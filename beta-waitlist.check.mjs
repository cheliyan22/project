import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;')
  await db.exec(await readFile(new URL('./supabase/migrations/20261030000000_beta_waitlist.sql', import.meta.url), 'utf8'))
  await db.exec('SET ROLE anon')

  const first = await db.query("SELECT public.join_beta_waitlist('  Builder@Example.COM ') AS inserted")
  assert.equal(first.rows[0].inserted, true, 'first registration should insert')

  const duplicate = await db.query("SELECT public.join_beta_waitlist('builder@example.com') AS inserted")
  assert.equal(duplicate.rows[0].inserted, false, 'case-insensitive duplicate should be idempotent')

  await assert.rejects(
    db.query("SELECT public.join_beta_waitlist('not-an-email')"),
    /valid email/,
    'invalid email should be rejected by the database',
  )
  await assert.rejects(
    db.query('SELECT email FROM public.beta_waitlist'),
    /permission denied/,
    'anonymous callers must not read the waitlist',
  )
  await db.exec('RESET ROLE')

  const rows = await db.query('SELECT email FROM public.beta_waitlist')
  assert.deepEqual(rows.rows, [{ email: 'builder@example.com' }])
  console.log('Beta waitlist migration passed: normalized insert, duplicate retry, validation, and private reads.')
} finally {
  await db.close()
}
