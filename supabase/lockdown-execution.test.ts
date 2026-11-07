// Executes the whole Reboot migration chain in a real in-memory Postgres (PGlite)
// and checks what the locked-down schema actually permits. The shape test in
// public-lockdown.test.ts only reads the SQL text; this file runs it.
//
// The fixture deliberately starts from Supabase's permissive default grants plus
// the open policies the original migrations created, so "anon could rewrite any
// idea" is proven to be true before the lock-down and false after it.
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

const db = new PGlite()

const OWNER = '11111111-1111-4111-8111-111111111111'
const VISITOR = '22222222-2222-4222-8222-222222222222'
const ADMIN = '33331333-3333-4333-8333-333333333333'
const IDEA = '44444444-4444-4444-8444-444444444444'
const LEGACY = '55555555-5555-4555-8555-555555555555'

const BASE_MIGRATIONS = [
  '20260703135603_create_reboot_schema.sql',
  '20260703140619_add_detailed_project_fields.sql',
  '20260705230258_reboot_full_schema_v2.sql',
  '20260706142422_add_profiles_auth.sql',
  '20260706154046_badges_leaderboard_founder_circle.sql',
  '20260706155248_expand_badges_50.sql',
  '20260707133943_reboot_story_features.sql',
  '20261025000000_reboot_planet_economy.sql',
  '20261025010000_planet_project_appearance.sql',
  '20261026000000_reboot_planet_hardening.sql',
]
const LOCKDOWN = '20261028000000_lock_public_writes.sql'
const REPAIR = '20261107020000_legacy_write_permissions.sql'

type Role = 'anon' | 'authenticated'

/** Run `sql` as a client role, with `userId` as the signed-in account (null = ghost). */
async function run(role: Role, userId: string | null, sql: string, params: unknown[] = []) {
  await db.query('SELECT set_config($1, $2, false)', ['test.uid', userId ?? ''])
  await db.query(`SET ROLE ${role}`)
  try {
    return await db.query(sql, params as never[])
  } finally {
    await db.query('RESET ROLE')
    await db.query('SELECT set_config($1, $2, false)', ['test.uid', ''])
  }
}

/** Statements RLS answers by filtering rows away instead of raising. A refusal
 *  of any kind — error or empty result — counts as "nothing changed". */
const affected = async (role: Role, userId: string | null, sql: string, params: unknown[] = []) => {
  try { return (await run(role, userId, `${sql} RETURNING 1`, params)).rows.length } catch { return 0 }
}

const fails = (role: Role, userId: string | null, sql: string, params: unknown[] = []) =>
  expect(run(role, userId, sql, params), `${role} must not be able to run: ${sql}`).rejects.toThrow()

const count = async (sql: string) =>
  Number((await db.query<{ n: string | number }>(sql)).rows[0].n)

/** How many rows a client role can actually see; a refused read sees none. */
const visible = async (role: Role, userId: string | null, sql: string) => {
  try { return (await run(role, userId, sql)).rows.length } catch { return 0 }
}

const balanceOf = async (userId: string) =>
  Number((await db.query<{ balance: number }>(`SELECT balance FROM public.coin_wallets WHERE user_id = '${userId}'`)).rows[0].balance)

/** Everything the publishable anon key could do before the lock-down ran. */
let hole: Record<string, boolean> = {}
let ideasBefore = 0

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text,
      created_at timestamptz NOT NULL DEFAULT now(),
      raw_user_meta_data jsonb NOT NULL DEFAULT '{}'
    );
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('test.uid', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
  `)

  for (const name of BASE_MIGRATIONS) {
    await db.exec(await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8'))
  }

  // Supabase's default privileges: every client role can read and write
  // everything in public. This is the state the lock-down has to survive being
  // applied to.
  await db.exec(`
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
  `)

  await db.exec(`
    INSERT INTO auth.users (id, email, created_at) VALUES
      ('${OWNER}',   'owner@reboot.test',    now() - interval '40 days'),
      ('${VISITOR}', 'visitor@reboot.test',  now() - interval '5 days'),
      ('${ADMIN}',   'admin@reboot.test',    now() - interval '2 days');
    INSERT INTO public.planet_admins (user_id) VALUES ('${ADMIN}');
    INSERT INTO public.ideas (id, user_id, title, slug, creator_name, upvotes, views)
      VALUES ('${IDEA}', '${OWNER}', 'Owned project', 'owned-project', 'Owner', 5, 12);
    -- A project published before authorship existed: user_id stays NULL.
    INSERT INTO public.ideas (id, user_id, title, slug, creator_name, upvotes, views)
      VALUES ('${LEGACY}', NULL, 'Legacy project', 'legacy-project', 'Nobody', 1, 1);
    INSERT INTO public.revivals (idea_id, reviver_name, reviver_email, message)
      VALUES ('${IDEA}', 'Visitor', 'secret-visitor@reboot.test', 'I can rebuild this');
    INSERT INTO public.coin_wallets (user_id, balance) VALUES ('${OWNER}', 100);
  `)

  // Record what the publishable anon key could actually change before the
  // lock-down, measured by effect rather than by whether the statement raised.
  hole = {
    anonEditsIdeaTitle: (await affected('anon', null, `UPDATE public.ideas SET title = 'HIJACKED' WHERE id = '${IDEA}'`)) > 0,
    anonEditsOthersProfile: (await affected('anon', null, `UPDATE public.profiles SET username = 'hijacked' WHERE id = '${OWNER}'`)) > 0,
    anonReadsWallet: (await visible('anon', null, 'SELECT balance FROM public.coin_wallets')) > 0,
    anonMintsCoins: (await affected('anon', null, `UPDATE public.coin_wallets SET balance = balance + 1000 WHERE user_id = '${OWNER}'`)) > 0,
    anonPostsComment: (await affected('anon', null, `INSERT INTO public.comments (idea_id, content) VALUES ('${IDEA}', 'anon spam')`)) > 0,
    anonWritesTimeline: (await affected('anon', null, `INSERT INTO public.project_timeline (idea_id, emoji, label, description, milestone_date, sort_order) VALUES ('${IDEA}', 'x', 'y', 'z', now(), 1)`)) > 0,
    anonReadsRevivalEmail: (await visible('anon', null, 'SELECT reviver_email FROM public.revivals')) > 0,
  }
  await db.exec(`
    UPDATE public.ideas SET title = 'Owned project' WHERE id = '${IDEA}';
    DELETE FROM public.comments;
    DELETE FROM public.project_timeline;
    UPDATE public.coin_wallets SET balance = 100 WHERE user_id = '${OWNER}';
  `)

  ideasBefore = await count('SELECT count(*) AS n FROM public.ideas')

  await db.exec(await readFile(new URL(`./migrations/${LOCKDOWN}`, import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL(`./migrations/${REPAIR}`, import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('./migrations/20261101090000_badge_achievements.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('./migrations/20261107010000_repair_idea_achievement_statuses.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('./migrations/20261107150000_verified_idea_signals.sql', import.meta.url), 'utf8'))
}, 120000)

afterAll(async () => { await db.close() })

describe('public lock-down', () => {
  it('closes the holes that were really open', () => {
    expect(hole).toEqual({
      // Held before this migration already: the 20261026000000 ownership
      // trigger, the self-service profiles policy and the economy RLS.
      anonEditsIdeaTitle: false,
      anonEditsOthersProfile: false,
      anonReadsWallet: false,
      anonMintsCoins: false,
      // Wide open to any visitor with the publishable key until now.
      anonPostsComment: true,
      anonWritesTimeline: true,
      anonReadsRevivalEmail: true,
    })
    expect(ideasBefore).toBe(2)
  })

  it('keeps browsing public while counts require authenticated idempotent signals', async () => {
    const browsable = await run('anon', null, 'SELECT id,title FROM public.ideas ORDER BY title')
    expect(browsable.rows.map(r=>r.title)).toEqual(['Legacy project','Owned project'])
    await fails('anon',null,`UPDATE public.ideas SET upvotes=999999,views=999999,revival_count=999999 WHERE id='${IDEA}'`)
    await fails('anon',null,`SELECT public.record_idea_signal('${IDEA}','support')`)
    await run('authenticated',VISITOR,`SELECT public.record_idea_signal('${IDEA}','support')`)
    await run('authenticated',VISITOR,`SELECT public.record_idea_signal('${IDEA}','support')`)
    await run('authenticated',VISITOR,`SELECT public.record_idea_signal('${IDEA}','view')`)
    await run('authenticated',VISITOR,`SELECT public.record_idea_signal('${IDEA}','view')`)
    expect((await db.query(`SELECT upvotes,views,revival_count FROM public.ideas WHERE id='${IDEA}'`)).rows[0]).toEqual({upvotes:1,views:1,revival_count:0})
    expect((await db.query(`SELECT upvotes,views FROM reboot_private.legacy_idea_counter_archive WHERE idea_id='${IDEA}'`)).rows[0]).toEqual({upvotes:5,views:12})
    await fails('authenticated',VISITOR,'SELECT * FROM reboot_private.idea_signals')
  })

  it('prevents even owners and admins from forging totals and self-support', async()=>{
    for(const uid of [OWNER,VISITOR,ADMIN])for(const column of ['upvotes','views','revival_count']){
      await fails('authenticated',uid,`UPDATE public.ideas SET ${column}=999999 WHERE id='${IDEA}'`)
      await fails('authenticated',uid,`INSERT INTO public.ideas(title,slug,${column}) VALUES('forged','forged',999999)`)
    }
    await fails('authenticated',OWNER,`SELECT public.record_idea_signal('${IDEA}','support')`)
    await fails('authenticated',VISITOR,`SELECT public.record_idea_signal('${IDEA}','revival')`)
  })

  it('derives revival signals transactionally from unique real proposal authors',async()=>{
    for(let n=0;n<2;n++)await run('authenticated',VISITOR,`INSERT INTO public.revivals(idea_id,reviver_name,reviver_email,message) VALUES('${IDEA}','Visitor','synthetic@example.invalid','A considered revival proposal')`)
    expect((await db.query(`SELECT revival_count FROM public.ideas WHERE id='${IDEA}'`)).rows[0]).toEqual({revival_count:1})
    await db.query("DELETE FROM public.revivals WHERE reviver_email='synthetic@example.invalid'")
  })

  it('deduplicates repeated calls and preserves separate real members',async()=>{
    await db.query("SELECT set_config('test.uid',$1,false)",[VISITOR])
    await db.exec('SET ROLE authenticated')
    try{await Promise.all(Array.from({length:12},()=>db.query('SELECT public.record_idea_signal($1,$2)',[IDEA,'support'])))}finally{await db.exec('RESET ROLE')}
    await run('authenticated',ADMIN,`SELECT public.record_idea_signal('${IDEA}','support')`)
    expect((await db.query(`SELECT upvotes FROM public.ideas WHERE id='${IDEA}'`)).rows[0]).toEqual({upvotes:2})
  })

  it('limits daily unique activity while retries remain idempotent',async()=>{
    await db.exec('BEGIN')
    try{
      await db.exec(`INSERT INTO public.ideas(title,slug) SELECT 'Quota fixture','quota-fixture-'||n FROM generate_series(1,250) n`)
      await db.query("INSERT INTO reboot_private.idea_signals(idea_id,user_id,kind) SELECT id,$1,'view' FROM public.ideas WHERE slug LIKE 'quota-fixture-%'",[ADMIN])
      // A previously recorded signal remains safe to retry at the quota.
      await run('authenticated',ADMIN,`SELECT public.record_idea_signal('${IDEA}','support')`)
      await db.query("SELECT set_config('test.uid',$1,false)",[ADMIN])
      await db.exec('SET ROLE authenticated')
      await expect(db.query(`SELECT public.record_idea_signal('${LEGACY}','view')`)).rejects.toThrow(/Daily activity limit reached/)
    }finally{await db.exec('ROLLBACK');await db.exec('RESET ROLE')}
  })

  it('stops anonymous content writes', async () => {
    await fails('anon', null, `UPDATE public.ideas SET title = 'HIJACKED' WHERE id = '${IDEA}'`)
    await fails('anon', null, `UPDATE public.ideas SET description = 'x' WHERE id = '${IDEA}'`)
    await fails('anon', null, `UPDATE public.ideas SET status = 'revived' WHERE id = '${IDEA}'`)
    await fails('anon', null, `DELETE FROM public.ideas WHERE id = '${IDEA}'`)
    await fails('anon', null, `INSERT INTO public.ideas (title, slug) VALUES ('ghost publish', 'ghost-publish')`)
    await fails('anon', null, `INSERT INTO public.comments (idea_id, content) VALUES ('${IDEA}', 'anon spam')`)
    await fails('anon', null, `INSERT INTO public.revivals (idea_id, reviver_name, reviver_email) VALUES ('${IDEA}', 'a', 'a@b.c')`)
    await fails('anon', null, `INSERT INTO public.project_timeline (idea_id, emoji, label, description, milestone_date, sort_order) VALUES ('${IDEA}', 'x', 'y', 'z', now(), 1)`)
    await fails('anon', null, `INSERT INTO public.tags (name, slug) VALUES ('ghost tag', 'ghost-tag')`)
    await fails('anon', null, `INSERT INTO public.resurrections (original_title, original_founder, reviver_name, reviver_handle) VALUES ('a','b','c','d')`)
    await fails('anon', null, `INSERT INTO public.profiles (id, username) VALUES ('${OWNER}', 'impostor')`)
  })

  it('hides revival contact details and the admin list from clients that earned neither', async () => {
    await fails('anon', null, 'SELECT reviver_email FROM public.revivals')
    await fails('anon', null, 'SELECT user_id FROM public.planet_admins')
    await fails('authenticated', VISITOR, 'SELECT user_id FROM public.planet_admins')

    // A signed-in stranger still cannot read somebody else's proposal.
    const stranger = await run('authenticated', VISITOR, 'SELECT reviver_email FROM public.revivals')
    expect(stranger.rows).toEqual([])

    // The founder of the project it is about can.
    const founder = await run('authenticated', OWNER, 'SELECT reviver_email FROM public.revivals')
    expect(founder.rows.map(r => r.reviver_email)).toEqual(['secret-visitor@reboot.test'])
  })

  it('lets an account publish, and pins authorship to the signed-in user', async () => {
    await run('authenticated', VISITOR, `INSERT INTO public.ideas (title, slug, creator_name) VALUES ('My build', 'my-build', 'Visitor')`)
    const row = (await db.query<{ u: string | null }>(`SELECT user_id AS u FROM public.ideas WHERE slug = 'my-build'`)).rows[0]
    expect(row.u).toBe(VISITOR)

    // Naming somebody else as the author on insert does not stick: the guard
    // trigger rewrites the column with the calling account before the policy
    // ever sees it, so the row lands in the attacker's own archive.
    await run('authenticated', VISITOR, `INSERT INTO public.ideas (title, slug, user_id) VALUES ('Steal', 'steal', '${OWNER}')`)
    const spoofed = (await db.query<{ u: string | null }>(`SELECT user_id AS u FROM public.ideas WHERE slug = 'steal'`)).rows[0]
    expect(spoofed.u).toBe(VISITOR)
  })

  it('confines an account to the rows it owns', async () => {
    // Strict RLS filters nonowner updates before the ownership guard executes.
    expect(await affected('authenticated', VISITOR, `UPDATE public.ideas SET title = 'Not mine' WHERE id = '${IDEA}'`)).toBe(0)
    expect(await affected('authenticated', VISITOR, `UPDATE public.ideas SET user_id = '${VISITOR}' WHERE id = '${IDEA}'`)).toBe(0)
    await fails('anon', null, `UPDATE public.ideas SET user_id = '${VISITOR}' WHERE id = '${IDEA}'`)
    await fails('authenticated', VISITOR, `DELETE FROM public.ideas WHERE id = '${IDEA}'`)

    // Story attachments: RLS filters the statement down to nothing.
    expect(await affected('authenticated', VISITOR, `UPDATE public.project_timeline SET label = 'x' WHERE idea_id = '${IDEA}'`)).toBe(0)
    expect(await affected('authenticated', VISITOR, `UPDATE public.revival_bounty SET cash_bounty = 1 WHERE idea_id = '${IDEA}'`)).toBe(0)
    expect(await affected('authenticated', VISITOR, `UPDATE public.time_capsule SET readme_text = 'x' WHERE idea_id = '${IDEA}'`)).toBe(0)
    expect(await affected('authenticated', VISITOR, `DELETE FROM public.project_timeline WHERE idea_id = '${IDEA}'`)).toBe(0)

    // Browser-supplied totals are no longer part of public browsing.
    expect(await affected('authenticated', VISITOR, `UPDATE public.ideas SET upvotes = upvotes + 1 WHERE id = '${IDEA}'`)).toBe(0)

    // The founder can edit their own project.
    expect(await affected('authenticated', OWNER, `UPDATE public.ideas SET description = 'mine' WHERE id = '${IDEA}'`)).toBe(1)
  })

  it('protects ownerless archive content while retaining browsing and admin repairs', async () => {
    for (const field of ["title = 'stolen'", "description = 'tampered'", "status = 'revived'", `user_id = '${VISITOR}'`]) {
      expect(await affected('authenticated', VISITOR, `UPDATE public.ideas SET ${field} WHERE id = '${LEGACY}'`)).toBe(0)
    }
    expect(await affected('authenticated', VISITOR, `UPDATE public.ideas SET views = views + 1 WHERE id = '${LEGACY}'`)).toBe(0)
    await run('authenticated',VISITOR,`SELECT public.record_idea_signal('${LEGACY}','view')`)
    expect(await visible('anon', null, `SELECT title FROM public.ideas WHERE id = '${LEGACY}'`)).toBe(1)
    expect(await affected('authenticated', ADMIN, `UPDATE public.ideas SET description = 'restored archive' WHERE id = '${LEGACY}'`)).toBe(1)
  })

  it('limits self-service profile edits while keeping server-derived achievements writable', async () => {
    expect(await affected('authenticated', OWNER, `UPDATE public.profiles SET username = 'owner-edited', bio = 'My project story' WHERE id = '${OWNER}'`)).toBe(1)
    expect(await affected('authenticated', VISITOR, `UPDATE public.profiles SET bio = 'not mine' WHERE id = '${OWNER}'`)).toBe(0)
    for (const field of ['xp', 'level', 'badge_count', 'revival_count', 'ideas_submitted', 'rank']) {
      await fails('authenticated', OWNER, `UPDATE public.profiles SET ${field} = 99999 WHERE id = '${OWNER}'`)
    }
    await fails('authenticated', OWNER, `UPDATE public.profiles SET is_founder = true, title = 'Founding Member' WHERE id = '${OWNER}'`)
    const writable = await db.query<{attname:string; can_insert:boolean}>(`SELECT attname,has_column_privilege('authenticated','public.profiles'::regclass,attnum,'INSERT') can_insert FROM pg_attribute WHERE attrelid='public.profiles'::regclass AND attnum>0 AND NOT attisdropped`)
    expect(writable.rows.filter(r=>r.can_insert).map(r=>r.attname).sort()).toEqual(['avatar_url','bio','github_username','id','username'])
    const signup = '66666666-6666-4666-8666-666666666666'
    await db.query('INSERT INTO auth.users (id,email) VALUES ($1,$2)',[signup,'synthetic-new@example.invalid'])
    expect(await visible('authenticated',signup,`SELECT id FROM public.profiles WHERE id = '${signup}'`)).toBe(1)
    await db.query('DELETE FROM public.profiles WHERE id=$1',[signup])
    await fails('authenticated', signup, `INSERT INTO public.profiles(id,username,xp) VALUES('${signup}','forged-score',99999)`)
    await run('authenticated', signup, `INSERT INTO public.profiles(id,username,bio) VALUES('${signup}','new-founder','My own story')`)
    await run('authenticated', OWNER, 'SELECT public.award_achievements()')
    expect((await db.query<{n:number}>(`SELECT ideas_submitted n FROM public.profiles WHERE id = '${OWNER}'`)).rows[0].n).toBe(1)
  })

  it('keeps the permission repair dashboard copy byte-identical', async () => {
    expect(await readFile(new URL('./dashboard/35-repair-legacy-write-permissions.sql', import.meta.url),'utf8')).toBe(await readFile(new URL(`./migrations/${REPAIR}`,import.meta.url),'utf8'))
  })

  it('stamps comment authorship and keeps other accounts out of it', async () => {
    await run('authenticated', VISITOR, `INSERT INTO public.comments (idea_id, content) VALUES ('${IDEA}', 'first')`)
    const comment = (await db.query<{ id: string; u: string | null }>(`SELECT id, user_id u FROM public.comments WHERE content = 'first'`)).rows[0]
    expect(comment.u).toBe(VISITOR)

    expect(await affected('authenticated', OWNER, `UPDATE public.comments SET content = 'tampered' WHERE id = '${comment.id}'`)).toBe(0)
    expect(await affected('authenticated', OWNER, `DELETE FROM public.comments WHERE id = '${comment.id}'`)).toBe(0)

    await run('authenticated', VISITOR, `UPDATE public.comments SET content = 'edited' WHERE id = '${comment.id}'`)
    expect((await db.query<{ c: string }>(`SELECT content c FROM public.comments WHERE id = '${comment.id}'`)).rows[0].c).toBe('edited')

    await run('authenticated', VISITOR, `DELETE FROM public.comments WHERE id = '${comment.id}'`)
    expect(await count('SELECT count(*) AS n FROM public.comments')).toBe(0)
  })

  it('keeps planet money out of client reach', async () => {
    await db.exec(`INSERT INTO public.coin_wallets (user_id, balance) VALUES ('${VISITOR}', 15)`)
    await fails('authenticated', VISITOR, `UPDATE public.coin_wallets SET balance = 999999 WHERE user_id = '${VISITOR}'`)
    await fails('authenticated', VISITOR, `INSERT INTO public.coin_wallets (user_id, balance) VALUES ('${OWNER}', 999999)`)
    await fails('anon', null, 'SELECT balance FROM public.coin_wallets')
    // The anon key could mint coins before this migration; it still cannot.
    expect(await balanceOf(OWNER)).toBe(100)
  })

  it('leaves planet admins able to repair archive content', async () => {
    expect(await affected('authenticated', ADMIN, `UPDATE public.ideas SET description = 'repaired' WHERE id = '${IDEA}'`)).toBe(1)
    const row = (await db.query<{ d: string }>(`SELECT description d FROM public.ideas WHERE id = '${IDEA}'`)).rows[0]
    expect(row.d).toBe('repaired')
  })

  it('keeps every pre-existing row', async () => {
    const ideasAfter = Number((await db.query<{ n: string }>('SELECT count(*) AS n FROM public.ideas')).rows[0].n)
    expect(ideasAfter).toBe(ideasBefore + 2) // the two rows a test account published
    const titles = (await db.query<{ t: string }>(`SELECT title t FROM public.ideas WHERE id IN ('${IDEA}','${LEGACY}') ORDER BY title`)).rows.map(r => r.t)
    expect(titles).toEqual(['Legacy project', 'Owned project'])
    expect(await visible('anon', null, `SELECT title FROM public.ideas WHERE id = '${LEGACY}'`)).toBe(1)
  })

  it('leaves no anonymous table write path after verified-signals migration', async () => {
    // The latest migration intentionally supersedes the historical ghost-counter grant.
    const policies = (await db.query<{ t: string; p: string }>(`
      SELECT c.relname AS t, p.polname AS p
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND p.polcmd <> 'r'
        AND EXISTS (SELECT 1 FROM pg_roles r WHERE r.oid = ANY (p.polroles) AND r.rolname = 'anon')
    `)).rows
    expect(policies).toEqual([])

    const columns = await db.query<{ attname: string; anon_can_update: boolean }>(`
      SELECT a.attname,
             has_column_privilege('anon', 'public.ideas'::regclass, a.attnum, 'UPDATE') AS anon_can_update
      FROM pg_attribute a
      WHERE a.attrelid = 'public.ideas'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    `)
    expect(columns.rows.filter(c => c.anon_can_update).map(c => c.attname).sort())
      .toEqual([])
  })

  it('refuses to run before the planet migrations exist', async () => {
    const fresh = new PGlite()
    await fresh.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now());
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('test.uid', true), '')::uuid
      $$;
      CREATE TABLE public.ideas (id uuid PRIMARY KEY, title text);
    `)
    await expect(
      fresh.exec(await readFile(new URL(`./migrations/${LOCKDOWN}`, import.meta.url), 'utf8'))
    ).rejects.toThrow(/earlier migrations are not applied yet/)
    await fresh.close()
  }, 120000)
})
