// PGlite regression for 20261031160000_beta_waitlist_referrals.sql.
// Proves: legacy rows survive with backfilled codes, the referral function
// returns only the caller's own stats, attribution degrades safely, the deployed
// one-argument function keeps working, and replay is non-destructive.
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

const db = new PGlite()
const BASE = new URL('./migrations/20261030000000_beta_waitlist.sql', import.meta.url)
const REFS = new URL('./migrations/20261031160000_beta_waitlist_referrals.sql', import.meta.url)
const CODE = /^[0-9A-F]{8}$/

const sql = (url: URL) => readFile(url, 'utf8')
type Stats = { status: string; inviteCode: string; position: number; referrals: number; referred: boolean }
async function join(email: string, ref?: string, source?: string): Promise<Stats> {
  const r = await db.query<{ j: Stats }>(
    `SELECT public.join_beta_waitlist_referral($1::text, $2::text, $3::text)::jsonb AS j`, [email, ref ?? null, source ?? null])
  return r.rows[0].j
}
async function one<T>(q: string, p: unknown[] = []): Promise<T> {
  return (await db.query<T>(q, p)).rows[0]
}

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;`)
  await db.exec(await sql(BASE))
  // A registrant from before the referral era, inserted the way the live data exists.
  await db.query(`INSERT INTO public.beta_waitlist (email, created_at) VALUES ('early@example.test', now() - interval '2 days')`)
}, 30000)
afterAll(async () => { await db.close() })

describe('referral migration', () => {
  it('backfills codes for legacy rows without touching their data', async () => {
    await db.exec(await sql(REFS))
    const row = await one<{ n: number; code: string | null; created: boolean }>(
      `SELECT count(*)::int n, max(invite_code) code, max(created_at::text) IS NOT NULL created FROM public.beta_waitlist WHERE email = 'early@example.test'`)
    expect(row.n).toBe(1)
    expect(row.code).toMatch(CODE)
    expect(row.created).toBe(true)
  }, 60000)

  it('registers a new builder and returns only their own stats', async () => {
    const s = await join('Ada@Example.TEST ')
    expect(s.status).toBe('registered')
    expect(s.inviteCode).toMatch(CODE)
    expect(s.position).toBeGreaterThanOrEqual(2)
    expect(s.referrals).toBe(0)
    expect(s.referred).toBe(false)
  }, 60000)

  it('is idempotent for repeat emails and keeps the same code', async () => {
    const first = await join('ada@example.test')
    const again = await join('ada@example.test')
    expect(again.status).toBe('existing')
    expect(again.inviteCode).toBe(first.inviteCode)
  }, 60000)

  it('credits a valid referrer and shows it on the referrer row', async () => {
    const referrer = await join('linus@example.test')
    const friend = await join('friend@example.test', referrer.inviteCode)
    expect(friend.referred).toBe(true)
    const back = await join('linus@example.test')
    expect(back.referrals).toBe(1)
  }, 60000)

  it('moves the referrer up the queue — the invite boost is real', async () => {
    const before = await join('ada@example.test')
    expect(before.referrals).toBe(0)
    await join('boost1@example.test', before.inviteCode)
    await join('boost2@example.test', before.inviteCode)
    const after = await join('ada@example.test')
    expect(after.referrals).toBe(2)
    // Two 12-hour boosts carry her past linus (who had one referral of his own)
    // but not past the 2-day-old legacy registrant.
    expect(after.position).toBeLessThan(before.position)
    expect(after.position).toBe(2)
  }, 60000)

  it('degrades malformed attribution instead of rejecting the signup', async () => {
    const s = await join('messy@example.test', 'not a code!!', 'Bad Source!')
    expect(s.status).toBe('registered')
    expect(s.referred).toBe(false)
    const row = await one<{ src: string | null; ref: string | null }>(
      `SELECT source src, referrer_code ref FROM public.beta_waitlist WHERE email = 'messy@example.test'`)
    expect(row.src).toBeNull()
    expect(row.ref).toBeNull()
  }, 60000)

  it('keeps the deployed one-argument function working', async () => {
    const r = await db.query<{ b: boolean }>(`SELECT public.join_beta_waitlist('legacy@example.test') AS b`)
    expect(r.rows[0].b).toBe(true)
    const again = await db.query<{ b: boolean }>(`SELECT public.join_beta_waitlist('legacy@example.test') AS b`)
    expect(again.rows[0].b).toBe(false)
  }, 60000)

  it('still rejects invalid emails', async () => {
    await expect(join('nope')).rejects.toThrow(/valid email/)
  }, 60000)

  it('is safe to replay and preserves every row and code', async () => {
    const before = await one<{ n: number }>(`SELECT count(*)::int n FROM public.beta_waitlist`)
    const ada = await join('ada@example.test')
    await db.exec(await sql(REFS))
    const after = await one<{ n: number; codes: number }>(
      `SELECT count(*)::int n, count(invite_code)::int codes FROM public.beta_waitlist`)
    expect(after.n).toBe(before.n)
    // Replay also backfills any row still created through the legacy function.
    expect(after.codes).toBe(after.n)
    expect((await join('ada@example.test')).inviteCode).toBe(ada.inviteCode)
  }, 60000)
})
