// PGlite regression for 20261101090000_badge_achievements.sql.
// Proves the things that were actually broken: nothing awarded badges, nothing
// wrote profiles.xp, re-running must not duplicate, and one account's data must
// never award another account.
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const db = new PGlite()
const MIGRATION = new URL('./migrations/20261101090000_badge_achievements.sql', import.meta.url)
const REPAIR = new URL('./migrations/20261107010000_repair_idea_achievement_statuses.sql', import.meta.url)

const ADA = '11111111-1111-4111-8111-111111111111'
const LINUS = '22222222-2222-4222-8222-222222222222'

async function one<T>(query: string, params: unknown[] = []): Promise<T> {
  return (await db.query<T>(query, params)).rows[0]
}

/** Calls the function as a given account, the way PostgREST does. */
async function award(user: string | null) {
  if (user === null) await db.exec(`RESET request.jwt.claim.sub`)
  else await db.exec(`SET request.jwt.claim.sub = '${user}'`)
  const result = await db.query<{ r: { earned: string[]; badges: number; xp: number } }>(
    `SELECT public.award_achievements() AS r`,
  )
  return result.rows[0].r
}

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;`)
  // Minimal schema: only the columns the function reads or writes.
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY,
      badge_count int DEFAULT 0,
      xp int DEFAULT 0,
      level int DEFAULT 1,
      ideas_submitted int DEFAULT 0,
      revival_count int DEFAULT 0
    );
    CREATE TABLE public.badges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug text UNIQUE NOT NULL,
      name text NOT NULL,
      description text,
      icon text,
      rarity text,
      xp_reward int DEFAULT 0
    );
    CREATE TABLE public.user_badges (
      user_id uuid NOT NULL,
      badge_id uuid NOT NULL,
      earned_at timestamptz DEFAULT now(),
      PRIMARY KEY (user_id, badge_id)
    );
    CREATE TABLE public.ideas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid,
      status text NOT NULL DEFAULT 'abandoned' CHECK (status IN ('abandoned','seeking','in_progress','revived'))
    );
    CREATE TABLE public.building_ownership (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid,
      definition_id text
    );
    CREATE TABLE public.building_placements (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid
    );

    INSERT INTO public.profiles (id) VALUES ('${ADA}'), ('${LINUS}');
    INSERT INTO public.badges (slug, name, rarity, xp_reward) VALUES
      ('first_blood', 'First Blood', 'common', 25),
      ('revivalist', 'Revivalist', 'rare', 100),
      ('serial_founder', 'Serial Founder', 'epic', 250);
  `)
  await db.exec(await readFile(MIGRATION, 'utf8'))
  await db.exec(await readFile(REPAIR, 'utf8'))
}, 60000)

afterAll(async () => { await db.close() })

describe('award_achievements', () => {
  it('refuses to award anything without a signed-in account', async () => {
    await expect(award(null)).rejects.toThrow(/Sign in/i)
  }, 30000)

  it('awards an owned building to its owner only', async () => {
    await db.exec(`INSERT INTO public.building_ownership (user_id, definition_id) VALUES ('${ADA}', 'starter-shack')`)

    const result = await award(ADA)
    expect(result.earned).toEqual(['first_build'])
    expect(result.badges).toBe(1)
    expect(result.xp).toBe(50)

    const profile = await one<{ badge_count: number; xp: number; level: number }>(
      `SELECT badge_count, xp, level FROM public.profiles WHERE id = '${ADA}'`)
    expect(profile.badge_count).toBe(1)
    expect(profile.xp).toBe(50)
    expect(profile.level).toBe(1)

    // The other account earned nothing from ADA's building.
    const other = await award(LINUS)
    expect(other.earned).toEqual([])
    expect(other.badges).toBe(0)
  }, 30000)

  it('is idempotent — re-running awards nothing new and keeps the totals', async () => {
    await award(ADA)
    const again = await award(ADA)
    expect(again.earned).toEqual([])
    expect(again.badges).toBe(1)
    expect(again.xp).toBe(50)

    const rows = await one<{ n: number }>(`SELECT count(*)::int n FROM public.user_badges WHERE user_id = '${ADA}'`)
    expect(rows.n).toBe(1)
  }, 30000)

  it('derives the premium and planning badges from real rows', async () => {
    await db.exec(`
      INSERT INTO public.building_ownership (user_id, definition_id) VALUES ('${LINUS}', 'reboot-nexus');
      INSERT INTO public.building_placements (user_id)
        SELECT '${LINUS}' FROM generate_series(1, 6);
    `)

    const result = await award(LINUS)
    expect(result.earned).toContain('nexus_owner')
    expect(result.earned).toContain('city_planner')
    expect(result.earned).toContain('first_build')
    expect(result.xp).toBe(600)
    expect(result.badges).toBe(3)

    const profile = await one<{ level: number }>(`SELECT level FROM public.profiles WHERE id = '${LINUS}'`)
    expect(profile.level).toBe(2)
  }, 30000)

  it('rejects client-only status names at the database boundary', async () => {
    for (const status of ['reviving', 'alive']) {
      await expect(db.query('INSERT INTO public.ideas (user_id, status) VALUES ($1,$2)', [ADA, status])).rejects.toThrow(/check constraint/i)
    }
  })

  it('awards successful revival only after a valid idea reaches revived', async () => {
    const idea = await one<{id: string}>(`INSERT INTO public.ideas (user_id, status) VALUES ('${ADA}', 'in_progress') RETURNING id`)
    expect((await award(ADA)).earned).not.toContain('revivalist')
    expect((await one<{revival_count: number}>(`SELECT revival_count FROM public.profiles WHERE id = '${ADA}'`)).revival_count).toBe(0)
    await db.query("UPDATE public.ideas SET status = 'revived' WHERE id = $1", [idea.id])
    expect((await award(ADA)).earned).toContain('revivalist')
    expect((await one<{revival_count: number}>(`SELECT revival_count FROM public.profiles WHERE id = '${ADA}'`)).revival_count).toBe(1)
  })

  it('counts published ideas and revivals on the profile', async () => {
    await db.exec(`
      INSERT INTO public.ideas (user_id, status) VALUES
        ('${LINUS}', 'in_progress'), ('${LINUS}', 'abandoned'), ('${LINUS}', 'revived'),
        ('${LINUS}', 'abandoned'), ('${LINUS}', 'abandoned');
    `)

    const result = await award(LINUS)
    expect(result.earned).toContain('first_blood')
    expect(result.earned).toContain('revivalist')
    expect(result.earned).toContain('serial_founder')

    const profile = await one<{ ideas_submitted: number; revival_count: number }>(
      `SELECT ideas_submitted, revival_count FROM public.profiles WHERE id = '${LINUS}'`)
    expect(profile.ideas_submitted).toBe(5)
    expect(profile.revival_count).toBe(1)
  }, 30000)

  it('replays the migration without losing awards', async () => {
    await db.exec(await readFile(MIGRATION, 'utf8'))
  await db.exec(await readFile(REPAIR, 'utf8'))
    const rows = await one<{ n: number }>(`SELECT count(*)::int n FROM public.user_badges WHERE user_id = '${LINUS}'`)
    expect(rows.n).toBeGreaterThanOrEqual(6)

    const replay = await award(LINUS)
    expect(replay.earned).toEqual([])
  }, 30000)
})
