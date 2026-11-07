// Local-only validation: every migration runs in order in ephemeral PGlite.
// Restore validation requires a real backup supplied explicitly; missing input
// is SKIP, never a claim that recovered content or a live project was validated.
//   node build-project-setup.check.mjs --no-write
//   node build-project-setup.check.mjs --backup C:/path/to/backup.json --out setup.sql
// Relative paths resolve from this project, never from its parent.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const root = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(root, 'supabase', 'migrations')
const { values: options } = parseArgs({ options: {
  backup: { type: 'string' },
  out: { type: 'string', default: '70-full-project-setup.sql' },
  'no-write': { type: 'boolean', default: false },
} })
const outPath = resolve(root, options.out)
const backupPath = options.backup ? resolve(root, options.backup) : null
const files = readdirSync(migrationsDir, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.sql')).map(entry => entry.name).sort()
assert.ok(files.length > 0, 'at least one migration must be discovered')
assert.ok(!files.some(file => resolve(migrationsDir, file).toLowerCase() === outPath.toLowerCase()), 'output must not overwrite a migration')
assert.notEqual(outPath.toLowerCase(), backupPath?.toLowerCase(), 'output must not overwrite the backup')
const migrations = await Promise.all(files.map(async name => ({ name, sql: await readFile(join(migrationsDir, name), 'utf8') })))
const migrationSql = migrations.map(({ name, sql }) => `-- ===== ${name} =====\n${sql.trim()}\n`).join('\n')

const db = new PGlite()
try {
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
    -- Supabase hands future public tables to the client roles automatically, so
    -- the migrations' own REVOKE statements are tested against the state they
    -- will really meet on a live project.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, PUBLIC;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, PUBLIC;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, PUBLIC;
  `)

  // Attribute failures per file, preserving dependencies by applying in order.
  // This phase and the schema checks below never depend on a backup being present.
  for (const { name, sql } of migrations) {
    try { await db.exec(sql) }
    catch (cause) { throw new Error(`Migration failed: ${name}`, { cause }) }
    console.log(`PASS migration ${name}`)
  }
  console.log(`PASS all ${files.length} discovered migrations applied in order`)

  const columnsOf = async table => (await db.query(
    `SELECT column_name n, data_type t, udt_name u
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`, [table],
  )).rows

  const badges = Number((await db.query('SELECT count(*) n FROM public.badges')).rows[0].n)
  // The achievement migration adds three badges to the original 53.
  assert.equal(badges, 56, 'the original catalogue plus three achievement badges must be seeded')
  const achievements = (await db.query("SELECT slug FROM public.badges WHERE slug IN ('first_build', 'city_planner', 'nexus_owner') ORDER BY slug")).rows.map(row => row.slug)
  assert.deepEqual(achievements, ['city_planner', 'first_build', 'nexus_owner'])

  const tables = (await db.query(
    "SELECT table_name t FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name",
  )).rows.map(r => r.t)
  for (const required of ['beta_waitlist', 'profiles', 'feature_requests', 'planet_admins']) {
    assert.ok(tables.includes(required), `expected table ${required} after setup`)
  }
  console.log(`public schema now holds ${tables.length} tables`)

  // The waitlist RPC must behave for a signed-out visitor, which is the only
  // role the published /beta page ever uses.
  // All test rows are rolled back before optional restore validation.
  await db.exec('BEGIN; SET ROLE anon')
  assert.equal((await db.query("SELECT public.join_beta_waitlist('  Builder@Example.COM ') n")).rows[0].n, true)
  assert.equal((await db.query("SELECT public.join_beta_waitlist('builder@example.com') n")).rows[0].n, false)
  await db.exec('SAVEPOINT invalid_email')
  await assert.rejects(db.query("SELECT public.join_beta_waitlist('nope')"), /valid email/)
  await db.exec('ROLLBACK TO SAVEPOINT invalid_email; SAVEPOINT private_waitlist')
  await assert.rejects(db.query('SELECT email FROM public.beta_waitlist'), /permission denied/)
  await db.exec('ROLLBACK TO SAVEPOINT private_waitlist; RESET ROLE')
  console.log('beta waitlist RPC verified under the anon role')

  // This local test proves count behavior, not a live project's grants or data.
  const signalCounts = async () => (await db.query('SELECT authored_ideas, revival_signals FROM public.landing_signal_counts()')).rows[0]
  await db.exec('SET ROLE anon')
  const empty = await signalCounts()
  assert.equal(Number(empty.authored_ideas), 0, 'seed ideas carry no author, so the public count must be 0')
  assert.equal(Number(empty.revival_signals), 0, 'no revival rows exist yet, so the public count must be 0')
  await db.exec('RESET ROLE')

  // One real account, one idea it authored, one revival it sent. The profile row
  // comes from the handle_new_user trigger, so only auth.users is inserted.
  const BUILDER = '0b0b0b0b-0000-4000-8000-000000000001'
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${BUILDER}', 'builder@reboot.test');
    INSERT INTO public.ideas (title, slug, user_id) VALUES ('Authored for the check', 'authored-for-the-check', '${BUILDER}');
    INSERT INTO public.revivals (idea_id, reviver_name, reviver_email, user_id)
      VALUES ((SELECT id FROM public.ideas WHERE slug = 'authored-for-the-check'), 'first builder', 'builder@reboot.test', '${BUILDER}');
  `)
  await db.exec('SET ROLE anon')
  const filled = await signalCounts()
  await db.exec('RESET ROLE; ROLLBACK')
  assert.equal(Number(filled.authored_ideas), 1, 'an account-authored idea must raise the public count by exactly one')
  assert.equal(Number(filled.revival_signals), 1, 'a revival signal must raise the public count by exactly one')
  console.log('landing signal counts verified: the public totals follow account-authored rows')

  let backup
  let skipReason = 'no --backup supplied'
  if (backupPath) {
    try { backup = JSON.parse(await readFile(backupPath, 'utf8')) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      skipReason = `backup not found: ${backupPath}`
    }
  }
  let seedSql = ''
  let restoreValidated = false
  if (backup !== undefined) {
    assert.ok(backup && typeof backup === 'object' && !Array.isArray(backup), 'backup must be a JSON object')
    const quote = value => `'${String(value).replace(/'/g, "''")}'`
    const lit = (value, col) => {
      if (value === null) return 'null'
      if (col.t.toUpperCase() === 'ARRAY') {
        assert.ok(Array.isArray(value), `${col.n}: expected an array`)
        const elemType = col.u.startsWith('_') ? col.u.slice(1) : col.u
        const elements = value.map(item => item === null ? 'NULL' : `"${String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
        return `${quote(`{${elements.join(',')}}`)}::${elemType}[]`
      }
      if (col.t === 'json' || col.t === 'jsonb') return `${quote(JSON.stringify(value))}::${col.u}`
      if (typeof value === 'boolean') return value ? 'true' : 'false'
      if (typeof value === 'number') { assert.ok(Number.isFinite(value)); return String(value) }
      return quote(value)
    }
    const restored = []
    for (const table of ['projects', 'ideas']) {
      const rows = backup.tables?.[table]
      assert.ok(Array.isArray(rows), `backup.tables.${table} must be an array`)
      const cols = await columnsOf(table)
      const known = new Set(cols.map(col => col.n))
      const ids = new Set()
      for (const row of rows) {
        assert.ok(row && typeof row === 'object' && !Array.isArray(row), `${table}: invalid row`)
        assert.ok(typeof row.id === 'string' && !ids.has(row.id), `${table}: id is required and must be unique`)
        ids.add(row.id)
        const unknown = Object.keys(row).filter(key => !known.has(key))
        assert.deepEqual(unknown, [], `${table}: backup columns must exist in the migrated schema`)
        // Omit absent columns to preserve defaults added after this backup.
        const chosen = cols.filter(col => Object.hasOwn(row, col.n))
        seedSql += `INSERT INTO public.${table} (${chosen.map(col => `"${col.n}"`).join(', ')}) VALUES (${chosen.map(col => lit(row[col.n], col)).join(', ')}) ON CONFLICT (id) DO NOTHING;\n`
        restored.push({ table, row, chosen })
      }
    }
    await db.exec(seedSql)
    // Verify every supplied column under its real SQL type. A conflicting ID
    // cannot silently lose data; no hardcoded eight-row or named-example shortcut.
    for (const { table, row, chosen } of restored) {
      const matches = chosen.map(col => `"${col.n}" IS NOT DISTINCT FROM ${lit(row[col.n], col)}`).join(' AND ')
      const result = await db.query(`SELECT (${matches}) matches FROM public.${table} WHERE id = $1`, [row.id])
      assert.equal(result.rows.length, 1, `${table}: recovered row must be present`)
      assert.equal(result.rows[0].matches, true, `${table}: recovered columns must round-trip under actual schema types`)
    }
    restoreValidated = true
    console.log(`PASS restore: ${backup.tables.projects.length} projects, ${backup.tables.ideas.length} ideas; all supplied columns verified`)
  } else {
    console.log(`SKIP restore validation: ${skipReason}. No recovered content generated or validated.`)
  }
  if (!options['no-write']) {
    const header = restoreValidated
      ? '-- Migrations and supplied projects/ideas restore validated locally in PGlite.\n'
      : '-- MIGRATIONS ONLY. Restore validation SKIPPED; no recovered content included.\n'
    const sql = `${header}-- No live project was accessed or validated.\n\n${migrationSql}\n${seedSql}`
    await writeFile(outPath, sql)
    console.log(`Wrote ${outPath} (${(Buffer.byteLength(sql) / 1024).toFixed(0)} KB)`)
  }
  console.log(`\nLOCAL MIGRATION VALIDATION PASSED; restore ${restoreValidated ? 'PASSED for supplied projects/ideas' : 'SKIPPED'}. No cloud operations performed.`)
} finally {
  await db.close()
}
