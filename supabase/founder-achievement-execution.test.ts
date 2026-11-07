import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';

const db = new PGlite();
const repair = '20261107200000_founder_achievement.sql';
const sql = (name: string) => readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8');
let founder: string;
let visitor: string;

type Award = { earned: string[]; badges: number; xp: number };
async function award(uid: string | null, role = 'authenticated') {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  await db.exec(`SET ROLE ${role}`);
  try {
    return (await db.query<{ result: Award }>('SELECT award_achievements() AS result')).rows[0].result;
  } finally { await db.exec('RESET ROLE'); }
}

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE ideas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text NOT NULL DEFAULT 'abandoned'
      CHECK (status IN ('abandoned','seeking','in_progress','revived')));
    CREATE TABLE building_ownership (user_id uuid, definition_id text);
    CREATE TABLE building_placements (user_id uuid);`);
  for (const migration of [
    '20260706142422_add_profiles_auth.sql',
    '20260706154046_badges_leaderboard_founder_circle.sql',
    '20261101090000_badge_achievements.sql',
    '20261107010000_repair_idea_achievement_statuses.sql',
    '20261107190000_atomic_founder_slots.sql', repair,
  ]) await db.exec(await sql(migration));
  // Actual signup triggers fill the original first-100 allocation; the 101st is not a member.
  await db.exec("INSERT INTO auth.users(email) SELECT 'synthetic-reward-'||n||'@example.invalid' FROM generate_series(1,101)n");
  founder = (await db.query<{ user_id: string }>('SELECT user_id FROM founder_circle WHERE slot_number=1')).rows[0].user_id;
  visitor = (await db.query<{ id: string }>('SELECT id FROM profiles WHERE NOT is_founder')).rows[0].id;
}, 30000);
afterAll(() => db.close());

it('awards the actual original legendary badge, 1000 XP and level 3 once to its member', async () => {
  expect((await db.query("SELECT rarity,xp_reward FROM badges WHERE slug='founding_member'")).rows[0]).toEqual({ rarity: 'legendary', xp_reward: 1000 });
  expect(await award(founder)).toEqual({ earned: ['founding_member'], badges: 1, xp: 1000 });
  expect(await award(founder)).toEqual({ earned: [], badges: 1, xp: 1000 });
  expect((await db.query('SELECT xp,level,badge_count FROM profiles WHERE id=$1', [founder])).rows[0]).toEqual({ xp: 1000, level: 3, badge_count: 1 });
});

it('does not award a nonmember even if its profile flag claims founder status', async () => {
  await db.query('UPDATE profiles SET is_founder=true WHERE id=$1', [visitor]);
  expect(await award(visitor)).toEqual({ earned: [], badges: 0, xp: 0 });
});

it('requires a signed-in identity and preserves the anonymous RPC denial', async () => {
  await expect(award(null)).rejects.toThrow(/Sign in/);
  await expect(award(founder, 'anon')).rejects.toThrow(/permission denied/);
});

it('preserves building awards and the corrected successful-revival status contract', async () => {
  await db.query("INSERT INTO building_ownership VALUES($1,'reboot-nexus')", [founder]);
  await db.query('INSERT INTO building_placements SELECT $1 FROM generate_series(1,6)', [founder]);
  await db.query("INSERT INTO ideas(user_id,status) VALUES($1,'in_progress')", [founder]);
  const active = await award(founder);
  expect(active.earned.sort()).toEqual(['city_planner', 'first_blood', 'first_build', 'nexus_owner']);
  expect(active.xp).toBe(1650);
  expect((await db.query('SELECT revival_count FROM profiles WHERE id=$1', [founder])).rows[0].revival_count).toBe(0);
  await db.query("UPDATE ideas SET status='revived' WHERE user_id=$1", [founder]);
  expect(await award(founder)).toEqual({ earned: ['revivalist'], badges: 6, xp: 1850 });
  expect((await db.query('SELECT revival_count,ideas_submitted,level FROM profiles WHERE id=$1', [founder])).rows[0]).toEqual({ revival_count: 1, ideas_submitted: 1, level: 4 });
  await expect(db.query("INSERT INTO ideas(user_id,status) VALUES($1,'reviving')", [founder])).rejects.toThrow(/check constraint/);
});

it('preserves earned rows and totals when the additive repair is reapplied', async () => {
  const before = (await db.query('SELECT * FROM user_badges ORDER BY id')).rows;
  await db.exec(await sql(repair));
  expect((await db.query('SELECT * FROM user_badges ORDER BY id')).rows).toEqual(before);
  expect(await award(founder)).toEqual({ earned: [], badges: 6, xp: 1850 });
});

it('changes only the membership candidate and keeps the dashboard copy identical', async () => {
  const latest = await sql(repair);
  const previous = await sql('20261107010000_repair_idea_achievement_statuses.sql');
  const functionBody = (text: string) => text.slice(text.indexOf('create or replace function'));
  expect(functionBody(latest).replace("        ('founding_member', exists (select 1 from public.founder_circle f where f.user_id = v_user)),\n", '')).toBe(functionBody(previous));
  expect(await readFile(new URL('./dashboard/39-founder-achievement.sql', import.meta.url), 'utf8')).toBe(latest);
});
