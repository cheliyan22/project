// Verifies the user's own Supabase project (from .env) after 70-full-project-setup.sql
// has been applied, using only the client credentials the published site holds.
//
// This proves what a visitor can actually make happen on the live database:
// which tables answer, how the waitlist RPC behaves, and that the waitlist
// itself stays unreadable without a privileged key. It writes one probe email
// and reports it so it can be removed afterwards.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  (await readFile(join(root, '.env'), 'utf8'))
    .split(/\r?\n/)
    .filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const URL_BASE = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
const probe = `probe.${Date.now()}@reboot-check.test`

console.log(`target: ${URL_BASE}`)
console.log(`client key kind: ${KEY.startsWith('sb_publishable_') ? 'publishable' : 'legacy anon'}`)

const read = async (table) => {
  const r = await fetch(`${URL_BASE}/rest/v1/${table}?select=*&limit=1`, { headers: H })
  return { status: r.status, range: r.headers.get('content-range'), body: r.status === 200 ? null : (await r.text()).slice(0, 90) }
}

// 1. Every table the published site reads as a signed-out visitor must answer.
//    This list comes from the supabase.from('...') calls in src/, not from the
//    schema: a table the client never queries has no reason to be public.
const PUBLIC_READS = ['ideas', 'profiles', 'badges', 'user_badges', 'comments',
  'project_timeline', 'revival_bounty', 'time_capsule', 'resurrections', 'founder_circle',
  'feature_requests', 'tags', 'idea_tags', 'economy_config', 'building_definitions']
for (const t of PUBLIC_READS) {
  const r = await read(t)
  assert.equal(r.status, 200, `${t} should be readable, got ${r.status} ${r.body ?? ''}`)
  console.log(`  table ${t.padEnd(18)} ok  rows=${r.range}`)
}

// 1b. Everything deliberately locked away must stay locked. On the previous
//     project Supabase's default privileges had quietly given anon full access to
//     all of these, so the lock-down migration's effect is only visible here.
//     'revivals' is the one a visitor's code path still asks for: the landing-page
//     stat strip reads its count and, when that query answers 401, shows no number
//     at all — which is the behaviour that file was written to produce.
const LOCKED = ['beta_waitlist', 'projects', 'project_tags', 'planet_admins', 'revival_requests',
  'revivals', 'coin_wallets', 'coin_transactions', 'building_ownership', 'building_placements', 'feature_votes']
for (const t of LOCKED) {
  const r = await read(t)
  assert.notEqual(r.status, 200, `${t} must not be readable by a visitor, got ${r.status}`)
  console.log(`  locked ${t.padEnd(17)} -> ${r.status}`)
}

// 2. The archive must still show its recovered content to a signed-out visitor.
const ideaRows = await (await fetch(`${URL_BASE}/rest/v1/ideas?select=slug&order=slug.asc`, { headers: H })).json()
console.log(`  public archive lists ${ideaRows.length} ideas: ${ideaRows.map(t => t.slug).join(', ')}`)
assert.equal(ideaRows.length, 8, 'the recovered archive should be visible')

const badgeCount = await (await fetch(`${URL_BASE}/rest/v1/badges?select=slug`, { headers: H })).json()
assert.equal(badgeCount.length, 53, 'all 53 badges should be seeded')
console.log(`  badge catalogue holds ${badgeCount.length} badges`)

// 3. The waitlist RPC, exactly as the published /beta page calls it.
const rpc = async (email) => {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/join_beta_waitlist`, {
    headers: H, method: 'POST', body: JSON.stringify({ prospect_email: email }),
  })
  return { status: r.status, body: await r.text() }
}

const fresh = await rpc(`  ${probe.toUpperCase()}  `)
assert.ok(fresh.status >= 200 && fresh.status < 300, `first registration should succeed, got ${fresh.status} ${fresh.body}`)
assert.equal(JSON.parse(fresh.body), true, 'first registration should report true')
console.log(`  rpc new email        -> ${fresh.status} true`)

const repeat = await rpc(probe)
assert.ok(repeat.status >= 200 && repeat.status < 300, `a retry should succeed, got ${repeat.status} ${repeat.body}`)
assert.equal(JSON.parse(repeat.body), false, 'a retry must report already-registered, not a second row')
console.log(`  rpc same email again -> ${repeat.status} false (idempotent)`)

const mixed = await rpc(probe.replace('@', '@@invalid'))
console.log(`  rpc malformed email  -> ${mixed.status} ${mixed.body.slice(0, 70)}`)
assert.ok(mixed.status >= 400, 'the database must reject a malformed address')

// 4. The landing hero's two numbers must come from the count-only RPC, and the
//    rows behind the second one must stay out of reach — which the LOCKED list
//    above already proved, because anon cannot list revivals at all.
const statRpc = await fetch(`${URL_BASE}/rest/v1/rpc/landing_signal_counts`, { headers: H, method: 'POST', body: '{}' })
const statBody = await statRpc.text()
assert.equal(statRpc.status, 200, `the stat RPC should answer, got ${statRpc.status} ${statBody.slice(0, 90)}`)
const strip = JSON.parse(statBody)[0]
assert.ok(strip && Number.isFinite(Number(strip.authored_ideas)) && Number.isFinite(Number(strip.revival_signals)),
  'the stat RPC should return two counts')

// The ideas half can be cross-checked against the archive a visitor already sees:
// no account-authored idea may be counted more than the ideas that exist.
const ideaTotal = Number((await (async () => {
  const r = await fetch(`${URL_BASE}/rest/v1/ideas?select=id`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } })
  return r.headers.get('content-range').split('/')[1]
})()))
console.log(`  stat RPC -> authored=${strip.authored_ideas} revival_signals=${strip.revival_signals}, archive holds ${ideaTotal} ideas`)
assert.ok(Number(strip.authored_ideas) <= ideaTotal, 'the authored count can never exceed the ideas that exist')
assert.ok(Number(strip.revival_signals) >= 0, 'the revival count is a plain total')

// 5. The waitlist must not be readable or listable by a visitor.
const peek = await read('beta_waitlist')
console.log(`  anon read of beta_waitlist -> ${peek.status} ${peek.body ?? ''}`)
assert.notEqual(peek.status, 200, 'anonymous visitors must not be able to read the waitlist')

console.log(`\nLIVE DATABASE VERIFIED. Probe row left behind: ${probe.toLowerCase()}`)
console.log(`Remove it later with: DELETE FROM public.beta_waitlist WHERE email = '${probe.toLowerCase()}';`)
