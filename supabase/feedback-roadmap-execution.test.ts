// Executes the Feedback & Roadmap migration in a real in-memory Postgres, on top
// of the whole chain the lock-down test already proves, and checks the board by
// effect: what a visitor, an account, a stranger and an admin can actually make
// happen. Reading the SQL text is not evidence that a policy works.
//
// The fixture also mirrors Supabase's live default-privilege behaviour — new
// tables are handed to anon and authenticated automatically — so the migration's
// REVOKE is tested against the state it will really meet.
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

const db = new PGlite()

const AUTHOR = 'aaaaaaaa-0000-4000-8000-000000000001'
const SECOND = 'aaaaaaaa-0000-4000-8000-000000000002'
const STRANGER = 'aaaaaaaa-0000-4000-8000-000000000003'
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000004'
const IDEA = 'bbbbbbbb-0000-4000-8000-000000000001'

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
const FEEDBACK = '20261028120000_feedback_roadmap.sql'

const sql = (name: string) => readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8')

type Role = 'anon' | 'authenticated'

/** Run `text` as a client role, with `userId` as the signed-in account (null = ghost). */
async function run(role: Role, userId: string | null, text: string, params: unknown[] = []) {
  await db.query('SELECT set_config($1, $2, false)', ['test.uid', userId ?? ''])
  await db.query(`SET ROLE ${role}`)
  try {
    return await db.query(text, params as never[])
  } finally {
    await db.query('RESET ROLE')
    await db.query('SELECT set_config($1, $2, false)', ['test.uid', ''])
  }
}

const fails = (role: Role, userId: string | null, text: string, params: unknown[] = []) =>
  expect(run(role, userId, text, params), `${role} must not be able to run: ${text}`).rejects.toThrow()

/** RLS answers some attempts by filtering rows away instead of raising, so a
 *  refusal of either kind counts as "nothing changed". */
const affected = async (role: Role, userId: string | null, text: string, params: unknown[] = []) => {
  try { return (await run(role, userId, `${text} RETURNING 1`, params)).rows.length } catch { return 0 }
}

const visible = async (role: Role, userId: string | null, text: string) => {
  try { return (await run(role, userId, text)).rows.length } catch { return 0 }
}

const one = async <T,>(text: string) => (await db.query<T>(text)).rows[0]

const suggest = (userId: string, title: string, body = '') =>
  run('authenticated', userId,
    `INSERT INTO public.feature_requests (title, body) VALUES ($1, $2) RETURNING id`,
    [title, body])

/** The public number printed on the board. */
const votesOf = async (id: string) =>
  (await one<{ c: number }>(`SELECT vote_count c FROM public.feature_requests WHERE id = '${id}'`)).c

/** The private truth behind it. */
const voteRows = (id: string) =>
  db.query<{ n: string }>(`SELECT count(*) n FROM public.feature_votes WHERE request_id = '${id}'`)

const statusOf = async (id: string) =>
  (await one<{ s: string }>(`SELECT status s FROM public.feature_requests WHERE id = '${id}'`)).s

let requestA = ''
let requestB = ''
let requestC = ''

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

  for (const name of BASE_MIGRATIONS) await db.exec(await sql(name))

  await db.exec(`
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
  `)

  await db.exec(`
    INSERT INTO auth.users (id, email, created_at, raw_user_meta_data) VALUES
      ('${AUTHOR}',   'nova@reboot.test',    now() - interval '60 days', '{"username":"nova"}'),
      ('${SECOND}',   'second@reboot.test',  now() - interval '30 days', '{"username":"second"}'),
      ('${STRANGER}', 'stranger@reboot.test',now() - interval '12 days', '{"username":"stranger"}'),
      ('${ADMIN}',    'admin@reboot.test',   now() - interval '9 days',  '{"username":"rebootadmin"}');
    INSERT INTO public.planet_admins (user_id) VALUES ('${ADMIN}');
    INSERT INTO public.ideas (id, user_id, title, slug, creator_name)
      VALUES ('${IDEA}', '${AUTHOR}', 'Owned project', 'owned-project', 'Nova');
  `)

  // The board is built on top of the lock-down, which is what installs
  // public.is_planet_admin() and the clean-slate grant model.
  await db.exec(await sql(LOCKDOWN))

  // Supabase grants future tables in public to the client roles by default, so
  // the board starts life as wide open as it does on the live project.
  await db.exec(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, PUBLIC;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, PUBLIC;
  `)

  await db.exec(await sql(FEEDBACK))

  requestA = (await suggest(AUTHOR, 'Deeper interactive timelines', 'Let a project story hold commits and decisions.')).rows[0].id
  requestB = (await suggest(SECOND, 'Private API key management', 'Keep keys out of any public surface.')).rows[0].id
  requestC = (await suggest(STRANGER, 'Export timeline reports', 'A printable summary per project.')).rows[0].id
}, 180000)

afterAll(async () => { await db.close() })

describe('feedback board access', () => {
  it('stamps authorship and the handle from the session, not the browser', async () => {
    const row = await one<{ h: string; a: string }>(
      `SELECT author_handle h, author_id::text a FROM public.feature_requests WHERE id = '${requestA}'`)
    expect(row.h).toBe('nova')
    expect(row.a).toBe(AUTHOR)

    // Naming another author, or claiming a different handle, does not stick.
    await run('authenticated', AUTHOR,
      `INSERT INTO public.feature_requests (title, author_id, author_handle) VALUES ('Spoof', '${ADMIN}', 'rebootadmin')`)
    const spoofed = await one<{ h: string; a: string | null }>(
      `SELECT author_handle h, author_id::text a FROM public.feature_requests WHERE title = 'Spoof'`)
    expect(spoofed.a).toBe(AUTHOR)
    expect(spoofed.h).toBe('nova')

    expect(await affected('authenticated', AUTHOR, `DELETE FROM public.feature_requests WHERE title = 'Spoof'`)).toBe(1)
  })

  it('refuses every anonymous write, including from a server-side session', async () => {
    await fails('anon', null, `INSERT INTO public.feature_requests (title) VALUES ('ghost suggestion')`)
    await fails('anon', null, `INSERT INTO public.feature_votes (request_id, user_id) VALUES ('${requestA}', '${AUTHOR}')`)
    await fails('anon', null, `UPDATE public.feature_requests SET vote_count = 4000 WHERE id = '${requestA}'`)
    await fails('anon', null, `DELETE FROM public.feature_requests WHERE id = '${requestA}'`)

    // The database owner is not a way in either: the stamp trigger fires first,
    // so there is no back door for seeding fake activity.
    await expect(db.query(`INSERT INTO public.feature_requests (title) VALUES ('no back door')`))
      .rejects.toThrow(/signed-in account is required/)
  })

  it('refuses a suggestion that cannot be read as a suggestion', async () => {
    // The bounds live in the database, so a hand-built request cannot skip them.
    await fails('authenticated', AUTHOR, `INSERT INTO public.feature_requests (title) VALUES ('abc')`)
    await fails('authenticated', AUTHOR, `INSERT INTO public.feature_requests (title) VALUES ('${'x'.repeat(121)}')`)
    await fails('authenticated', AUTHOR, `INSERT INTO public.feature_requests (title, body) VALUES ('Long enough', '${'x'.repeat(4001)}')`)
    await fails('authenticated', AUTHOR, `INSERT INTO public.feature_requests (title) VALUES (NULL)`)
    expect(await one<{ n: string }>('SELECT count(*)::text n FROM public.feature_requests')).toEqual({ n: '3' })
  })

  it('leaves the board readable to a visitor and writes impossible for one', async () => {
    expect(await visible('anon', null, 'SELECT id, title, vote_count FROM public.feature_requests')).toBeGreaterThanOrEqual(3)

    // Revoke-then-grant really did leave anon read-only on both tables.
    const privs = await db.query<{ insert: boolean; update: boolean; delete: boolean; select: boolean }>(`
      SELECT has_table_privilege('anon', 'public.feature_requests'::regclass, 'INSERT')  AS insert,
             has_table_privilege('anon', 'public.feature_requests'::regclass, 'UPDATE')  AS update,
             has_table_privilege('anon', 'public.feature_requests'::regclass, 'DELETE')  AS delete,
             has_table_privilege('anon', 'public.feature_requests'::regclass, 'SELECT')  AS select
    `)
    expect(privs.rows[0]).toEqual({ insert: false, update: false, delete: false, select: true })
    expect(await one<{ n: string }>(`SELECT count(*)::text n FROM information_schema.role_table_grants
      WHERE grantee = 'PUBLIC' AND table_name IN ('feature_requests', 'feature_votes')`)).toEqual({ n: '0' })
    expect(await one<{ s: boolean }>(`SELECT has_table_privilege('anon', 'public.feature_votes', 'SELECT') AS s`))
      .toEqual({ s: false })
  })

  it('keeps the rest of the archive working exactly as before', async () => {
    expect(await visible('anon', null, `SELECT title FROM public.ideas WHERE id = '${IDEA}'`)).toBe(1)
    expect(await affected('anon', null, `UPDATE public.ideas SET views = views + 1 WHERE id = '${IDEA}'`)).toBe(1)
    expect(await one<{ t: string }>(`SELECT title t FROM public.ideas WHERE id = '${IDEA}'`)).toEqual({ t: 'Owned project' })
  })
})

describe('voting', () => {
  it('counts one vote per account and refuses a second', async () => {
    await run('authenticated', AUTHOR, `INSERT INTO public.feature_votes (request_id) VALUES ('${requestB}')`)
    expect(await votesOf(requestB)).toBe(1)

    // Same account, same suggestion: the primary key is the whole guarantee.
    await expect(run('authenticated', AUTHOR, `INSERT INTO public.feature_votes (request_id) VALUES ('${requestB}')`))
      .rejects.toThrow(/duplicate key value/)
    expect(await votesOf(requestB)).toBe(1)

    // A second account adds exactly one more.
    await run('authenticated', SECOND, `INSERT INTO public.feature_votes (request_id) VALUES ('${requestB}')`)
    expect(await votesOf(requestB)).toBe(2)

    // Voting for somebody else by naming their id does not forge their ballot:
    // the stamp trigger rewrites the column, so the vote lands in the caller's
    // own name and the total moves by exactly one.
    await run('authenticated', ADMIN, `INSERT INTO public.feature_votes (request_id, user_id) VALUES ('${requestB}', '${AUTHOR}')`)
    const roster = await db.query<{ u: string }>(`SELECT user_id::text u FROM public.feature_votes WHERE request_id = '${requestB}'`)
    expect(roster.rows.map(r => r.u).sort()).toEqual([ADMIN, AUTHOR, SECOND].sort())
    expect(await votesOf(requestB)).toBe(3)

    // The same caller cannot delete the author's ballot, only their own.
    expect(await affected('authenticated', ADMIN, `DELETE FROM public.feature_votes WHERE request_id = '${requestB}' AND user_id = '${AUTHOR}'`)).toBe(0)
    expect(await affected('authenticated', ADMIN, `DELETE FROM public.feature_votes WHERE request_id = '${requestB}'`)).toBe(1)
    expect(await votesOf(requestB)).toBe(2)
  })

  it('lets a vote be withdrawn and re-counted from the vote rows', async () => {
    expect(await affected('authenticated', SECOND, `DELETE FROM public.feature_votes WHERE request_id = '${requestB}' AND user_id = '${SECOND}'`)).toBe(1)
    expect(await votesOf(requestB)).toBe(1)
    expect(Number((await voteRows(requestB)).rows[0].n)).toBe(1)

    // Changing your mind is allowed: withdraw, then cast it again.
    await run('authenticated', SECOND, `INSERT INTO public.feature_votes (request_id) VALUES ('${requestB}')`)
    expect(await votesOf(requestB)).toBe(2)

    // A client cannot inflate the total directly.
    await fails('authenticated', SECOND, `UPDATE public.feature_requests SET vote_count = 99 WHERE id = '${requestB}'`)
    expect(await votesOf(requestB)).toBe(2)

    // Somebody else's vote is not theirs to withdraw — RLS filters it away.
    expect(await affected('authenticated', STRANGER, `DELETE FROM public.feature_votes WHERE request_id = '${requestB}' AND user_id = '${AUTHOR}'`)).toBe(0)
  })

  it('keeps who voted for what private to the voter', async () => {
    expect(await visible('authenticated', AUTHOR, 'SELECT request_id FROM public.feature_votes')).toBe(1)
    expect(await visible('authenticated', STRANGER, 'SELECT request_id FROM public.feature_votes')).toBe(0)
    expect(await visible('anon', null, 'SELECT request_id FROM public.feature_votes')).toBe(0)

    // The roster of voters is not readable even by the suggestion's author.
    const listed = await run('authenticated', AUTHOR,
      `SELECT user_id FROM public.feature_votes WHERE request_id = '${requestB}'`)
    expect(listed.rows.map(r => r.user_id)).toEqual([AUTHOR])
  })
})

describe('decisions belong to the owner', () => {
  it('stops an account that is not an admin from moving status, grouping or replies', async () => {
    await fails('authenticated', AUTHOR, `UPDATE public.feature_requests SET status = 'shipped' WHERE id = '${requestA}'`)
    await fails('authenticated', AUTHOR, `UPDATE public.feature_requests SET admin_note = 'I approved this' WHERE id = '${requestA}'`)
    await fails('authenticated', AUTHOR, `UPDATE public.feature_requests SET duplicate_of = '${requestB}' WHERE id = '${requestA}'`)
    await fails('authenticated', AUTHOR, `UPDATE public.feature_requests SET author_handle = 'rebootadmin' WHERE id = '${requestA}'`)
    expect(await statusOf(requestA)).toBe('reviewing')

    // A stranger cannot even reach the row to try.
    expect(await affected('authenticated', STRANGER, `UPDATE public.feature_requests SET title = 'Hijacked' WHERE id = '${requestA}'`)).toBe(0)
    expect((await one<{ t: string }>(`SELECT title t FROM public.feature_requests WHERE id = '${requestA}'`)).t).toBe('Deeper interactive timelines')

    // The author may still fix their own wording.
    expect(await affected('authenticated', AUTHOR, `UPDATE public.feature_requests SET body = 'Reworded' WHERE id = '${requestA}'`)).toBe(1)
  })

  it('lets an admin decide, and stamps when the decision was made', async () => {
    const before = (await one<{ s: string }>(`SELECT status_at::text s FROM public.feature_requests WHERE id = '${requestA}'`)).s
    await run('authenticated', ADMIN, `UPDATE public.feature_requests SET status = 'building', admin_note = 'Starting with the story tab.' WHERE id = '${requestA}'`)
    expect(await statusOf(requestA)).toBe('building')
    const after = (await one<{ s: string; n: string }>(`SELECT status_at::text s, admin_note n FROM public.feature_requests WHERE id = '${requestA}'`))
    expect(after.n).toBe('Starting with the story tab.')
    expect(after.s).not.toBe(before)
  })

  it('groups duplicates without letting the board become a hierarchy', async () => {
    await run('authenticated', ADMIN, `UPDATE public.feature_requests SET duplicate_of = '${requestA}' WHERE id = '${requestC}'`)
    expect((await one<{ d: string | null }>(`SELECT duplicate_of::text d FROM public.feature_requests WHERE id = '${requestC}'`)).d).toBe(requestA)

    // A duplicate cannot collect duplicates of its own.
    const child = (await suggest(STRANGER, 'A third level')).rows[0].id
    await expect(run('authenticated', ADMIN, `UPDATE public.feature_requests SET duplicate_of = '${requestC}' WHERE id = '${child}'`))
      .rejects.toThrow(/already marked as a duplicate/)

    // Nothing points at itself.
    await expect(run('authenticated', ADMIN, `UPDATE public.feature_requests SET duplicate_of = id WHERE id = '${requestA}'`))
      .rejects.toThrow(/feature_requests_not_self_duplicate/)

    await db.query(`DELETE FROM public.feature_requests WHERE id = '${child}'`)
  })

  it('declines a suggestion instead of promising it will be built', async () => {
    await run('authenticated', ADMIN, `UPDATE public.feature_requests SET status = 'not_now', admin_note = 'Not on this road.' WHERE id = '${requestB}'`)
    expect(await statusOf(requestB)).toBe('not_now')
    await expect(run('authenticated', ADMIN, `UPDATE public.feature_requests SET status = 'someday' WHERE id = '${requestB}'`))
      .rejects.toThrow(/feature_requests_status_check/)
  })
})

describe('withdrawing a suggestion', () => {
  it('allows the author only while nobody has acted on it', async () => {
    const fresh = (await suggest(AUTHOR, 'Take me back', 'Still reviewing.')).rows[0].id
    // requestA is already 'building', so it cannot be removed by its author.
    expect(await affected('authenticated', AUTHOR, `DELETE FROM public.feature_requests WHERE id = '${requestA}'`)).toBe(0)
    expect(await affected('authenticated', STRANGER, `DELETE FROM public.feature_requests WHERE id = '${fresh}'`)).toBe(0)
    expect(await affected('authenticated', AUTHOR, `DELETE FROM public.feature_requests WHERE id = '${fresh}'`)).toBe(1)
    expect(await visible('anon', null, `SELECT id FROM public.feature_requests WHERE id = '${fresh}'`)).toBe(0)
  })

  it('takes its votes with it and keeps every other row', async () => {
    const doomed = (await suggest(AUTHOR, 'Doomed idea', '')).rows[0].id
    await run('authenticated', SECOND, `INSERT INTO public.feature_votes (request_id) VALUES ('${doomed}')`)
    expect(Number((await voteRows(doomed)).rows[0].n)).toBe(1)

    await run('authenticated', ADMIN, `DELETE FROM public.feature_requests WHERE id = '${doomed}'`)
    expect(Number((await voteRows(doomed)).rows[0].n)).toBe(0)

    // The three suggestions the tests started with are still on the board, the
    // archive and the four profiles are untouched, and the only votes left are
    // the two cast for requestB.
    const kept = await one<{ r: string; v: string; p: string; i: string }>(`
      SELECT (SELECT count(*) FROM public.feature_requests)::text r,
             (SELECT count(*) FROM public.feature_votes)::text v,
             (SELECT count(*) FROM public.profiles)::text p,
             (SELECT count(*) FROM public.ideas)::text i`)
    expect(kept).toEqual({ r: '3', v: '2', p: '4', i: '1' })
    expect(await statusOf(requestA)).toBe('building')
    expect(await votesOf(requestB)).toBe(2)
  })
})

describe('migration order', () => {
  it('refuses to run before the archive and the lock-down exist', async () => {
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
    await expect(fresh.exec(await sql(FEEDBACK)))
      .rejects.toThrow(/the archive is not set up yet/)
    await fresh.close()

    // Archive present, is_planet_admin() missing: still a stop, with a named file.
    const half = new PGlite()
    await half.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now());
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('test.uid', true), '')::uuid
      $$;
    `)
    for (const name of BASE_MIGRATIONS) await half.exec(await sql(name))
    await expect(half.exec(await sql(FEEDBACK)))
      .rejects.toThrow(/needs public\.is_planet_admin\(\) from 20261028000000_lock_public_writes\.sql/)
    await half.close()
  }, 180000)

  it('is safe to replay', async () => {
    // Supabase can hand you a half-applied file; re-running must not destroy data.
    await db.exec(await sql(FEEDBACK))
    expect(Number((await db.query<{ n: string }>('SELECT count(*) n FROM public.feature_requests')).rows[0].n)).toBe(3)
    expect(await votesOf(requestB)).toBe(2)
    expect(await statusOf(requestA)).toBe('building')
  })
})
