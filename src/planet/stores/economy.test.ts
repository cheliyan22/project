import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

const db = new PGlite()
const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const ADMIN = '33333333-3333-4333-8333-333333333333'
const U4 = '44444444-4444-4444-8444-444444444444'
const U5 = '55555555-5555-4555-8555-555555555555'
const U6 = '66666666-6666-4666-8666-666666666666'
const U7 = '77777777-7777-4777-8777-777777777777'
const U8 = '88888888-8888-4888-8888-888888888888'
const U9 = '99999999-9999-4999-8999-999999999999'
const U10 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const U11 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

async function asUser(userId: string) {
  await db.query('SELECT set_config($1, $2, false)', ['test.uid', userId])
}

async function addUser(userId: string, age = '31 days') {
  await db.query('INSERT INTO auth.users (id, created_at) VALUES ($1, now() - $2::interval)', [userId, age])
}

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.ideas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users(id),
      title text,
      upvotes integer NOT NULL DEFAULT 0,
      views integer NOT NULL DEFAULT 0,
      revival_count integer NOT NULL DEFAULT 0
    );
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('test.uid', true), '')::uuid
    $$;
  `)
  const migration = await readFile(new URL('../../../supabase/migrations/20261025000000_reboot_planet_economy.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  const appearanceMigration = await readFile(new URL('../../../supabase/migrations/20261025010000_planet_project_appearance.sql', import.meta.url), 'utf8')
  await db.exec(appearanceMigration)
  const hardeningMigration = await readFile(new URL('../../../supabase/migrations/20261026000000_reboot_planet_hardening.sql', import.meta.url), 'utf8')
  await db.exec(hardeningMigration)
  // Mirror the legacy production policies: the trigger, not the policy, must stop abuse.
  await db.exec(`
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
    CREATE POLICY ideas_select ON public.ideas FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY ideas_insert ON public.ideas FOR INSERT TO anon, authenticated WITH CHECK (true);
    CREATE POLICY ideas_update ON public.ideas FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
    GRANT SELECT, INSERT, UPDATE ON public.ideas TO anon, authenticated;
  `)
}, 30000)

afterAll(async () => { await db.close() })

describe('planet economy SQL', () => {
  it('unlocks after thirty days and allows a trusted admin immediately', async () => {
    await addUser(USER, '29 days')
    await addUser(OTHER)
    await addUser(ADMIN, '1 day')
    await db.query('INSERT INTO public.planet_admins (user_id) VALUES ($1)', [ADMIN])

    await asUser(USER)
    expect((await db.query<{ result: { hasAccess: boolean } }>('SELECT public.planet_access_status() AS result')).rows[0].result.hasAccess).toBe(false)
    await asUser(OTHER)
    expect((await db.query<{ result: { hasAccess: boolean } }>('SELECT public.planet_access_status() AS result')).rows[0].result.hasAccess).toBe(true)
    await asUser(ADMIN)
    expect((await db.query<{ result: { hasAccess: boolean; isAdmin: boolean } }>('SELECT public.planet_access_status() AS result')).rows[0].result).toMatchObject({ hasAccess: true, isAdmin: true })
  })

  it('purchases atomically, prevents insufficient funds, and deduplicates retries', async () => {
    await asUser(OTHER)
    await db.query('INSERT INTO public.coin_wallets (user_id, balance) VALUES ($1, 100)', [OTHER])
    await expect(db.query("SELECT public.purchase_building('reboot-nexus', 'insufficient')")).rejects.toThrow('Insufficient coin balance')
    expect((await db.query<{ balance: number }>('SELECT balance FROM public.coin_wallets WHERE user_id = $1', [OTHER])).rows[0].balance).toBe(100)

    await db.query('UPDATE public.coin_wallets SET balance = 15000 WHERE user_id = $1', [OTHER])
    const purchased = await db.query<{ result: { balance: number; owned: boolean; ownershipId: string } }>("SELECT public.purchase_building('reboot-nexus', 'purchase-key') AS result")
    expect(purchased.rows[0].result).toMatchObject({ balance: 0, owned: true })
    const retry = await db.query<{ result: { balance: number; alreadyOwned: boolean } }>("SELECT public.purchase_building('reboot-nexus', 'purchase-key') AS result")
    expect(retry.rows[0].result).toMatchObject({ balance: 0, alreadyOwned: true })
    expect((await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM public.coin_transactions WHERE user_id = $1', [OTHER])).rows[0].count).toBe(1)
    expect((await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM public.building_ownership WHERE user_id = $1', [OTHER])).rows[0].count).toBe(1)
  })

  it('replaces only the free placement and enforces premium footprint bounds and overlap', async () => {
    await asUser(OTHER)
    await db.query("SELECT public.place_free_building('starter-shack', 5, 5, 0)")
    await db.query("SELECT public.place_free_building('brickbox', -5, -5, 1)")
    expect((await db.query<{ count: number; definition: string }>('SELECT count(*)::integer AS count, max(free_definition_id) AS definition FROM public.building_placements WHERE user_id = $1 AND free_definition_id IS NOT NULL', [OTHER])).rows[0]).toEqual({ count: 1, definition: 'brickbox' })

    const ownership = (await db.query<{ id: string }>('SELECT id FROM public.building_ownership WHERE user_id = $1', [OTHER])).rows[0].id
    await expect(db.query('SELECT public.place_owned_building($1, 12, 12, 0)', [ownership])).rejects.toThrow('footprint exceeds')
    await db.query('SELECT public.place_owned_building($1, 0, 0, 0)', [ownership])
    await expect(db.query("SELECT public.place_free_building('brickbox', 1, 1, 0)")).rejects.toThrow('overlaps')

    const placement = (await db.query<{ id: string }>('SELECT id FROM public.building_placements WHERE ownership_id = $1', [ownership])).rows[0].id
    await db.query('SELECT public.remove_building_placement($1)', [placement])
    expect((await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM public.building_ownership WHERE id = $1', [ownership])).rows[0].count).toBe(1)
  })

  it('uses server elapsed time and never credits a consumed activity nonce twice', async () => {
    await asUser(OTHER)
    const balanceBefore = (await db.query<{ balance: number }>('SELECT balance FROM public.coin_wallets WHERE user_id = $1', [OTHER])).rows[0].balance
    const started = await db.query<{ result: { sessionId: string } }>('SELECT public.start_activity_session() AS result')
    const sessionId = started.rows[0].result.sessionId
    await db.query('UPDATE public.activity_sessions SET last_claim_at = clock_timestamp() - interval \'15 seconds\' WHERE id = $1', [sessionId])
    const claim = await db.query<{ result: { balance: number; coins: number; nextNonce: number } }>('SELECT public.claim_activity_heartbeat($1, 1, 3, true, true) AS result', [sessionId])
    expect(claim.rows[0].result).toMatchObject({ balance: balanceBefore + 15, coins: 15, nextNonce: 2 })
    const retry = await db.query<{ result: { balance: number; coins: number; nextNonce: number } }>('SELECT public.claim_activity_heartbeat($1, 1, 3, true, true) AS result', [sessionId])
    expect(retry.rows[0].result).toMatchObject({ balance: balanceBefore + 15, coins: 0, nextNonce: 2 })
    await expect(db.query('SELECT public.claim_activity_heartbeat($1, 2, 3, true, true)', [sessionId])).rejects.toThrow('At least 12 seconds')
    expect((await db.query<{ balance: number }>('SELECT balance FROM public.coin_wallets WHERE user_id = $1', [OTHER])).rows[0].balance).toBe(balanceBefore + 15)
  })

  it('saves project appearance only for the owner with a validated shape', async () => {
    const idea = (await db.query<{ id: string }>('INSERT INTO public.ideas (user_id) VALUES ($1) RETURNING id', [OTHER])).rows[0].id
    await asUser(OTHER)
    const saved = await db.query<{ result: { buildingCustomization: { color: string; style: string } } }>(
      "SELECT public.customize_project_appearance($1, '{\"color\":\"#AABBCC\",\"style\":\"spire\",\"height\":1.3,\"glowIntensity\":2}'::jsonb) AS result",
      [idea],
    )
    expect(saved.rows[0].result.buildingCustomization).toMatchObject({ color: '#AABBCC', style: 'spire' })
    await expect(db.query("SELECT public.customize_project_appearance($1, '{\"style\":\"castle\"}'::jsonb)", [idea])).rejects.toThrow('Unsupported rooftop style')
    await asUser(USER)
    await expect(db.query("SELECT public.customize_project_appearance($1, '{\"style\":\"dome\"}'::jsonb)", [idea])).rejects.toThrow('not owned')
    const stored = await db.query<{ style: string }>('SELECT building_customization->>\'style\' AS style FROM public.ideas WHERE id = $1', [idea])
    expect(stored.rows[0].style).toBe('spire')
  })

  it('restricts contribution rewards to admins and deduplicates source keys', async () => {
    await asUser(OTHER)
    await expect(db.query("SELECT public.reward_contribution($1, 'comment', 'idea:1:comment:1', 'Helpful')", [OTHER])).rejects.toThrow('admin')
    await asUser(ADMIN)
    const balanceBefore = (await db.query<{ balance: number }>('SELECT balance FROM public.coin_wallets WHERE user_id = $1', [OTHER])).rows[0].balance
    const first = await db.query<{ result: { balance: number; amount: number } }>("SELECT public.reward_contribution($1, 'comment', 'idea:1:comment:1', 'Helpful') AS result", [OTHER])
    expect(first.rows[0].result).toMatchObject({ balance: balanceBefore + 50, amount: 50 })
    const retry = await db.query<{ result: { balance: number; alreadyRewarded: boolean } }>("SELECT public.reward_contribution($1, 'comment', 'idea:1:comment:1', 'Helpful') AS result", [OTHER])
    expect(retry.rows[0].result).toMatchObject({ balance: balanceBefore + 50, alreadyRewarded: true })
  })
})

async function grantAccess(userId: string) {
  await addUser(userId)
  await asUser(userId)
}

async function premiumOwnership(userId: string) {
  return (await db.query<{ id: string }>(
    "INSERT INTO public.building_ownership (user_id, definition_id) VALUES ($1, 'reboot-nexus') RETURNING id", [userId],
  )).rows[0].id
}

describe('hardening regressions', () => {
  it('checks footprints on a first placement, in both directions', async () => {
    await grantAccess(U4)
    const ownedFirst = await premiumOwnership(U4)
    await db.query('SELECT public.place_owned_building($1, 4, 4, 0)', [ownedFirst])
    await expect(db.query("SELECT public.place_free_building('brickbox', 5, 5, 0)")).rejects.toThrow('overlaps')
    expect((await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM public.building_placements WHERE user_id = $1 AND free_definition_id IS NOT NULL', [U4])).rows[0].count).toBe(0)

    await grantAccess(U5)
    await db.query("SELECT public.place_free_building('brickbox', 6, 6, 0)")
    const premiumFirst = await premiumOwnership(U5)
    await expect(db.query('SELECT public.place_owned_building($1, 6, 6, 0)', [premiumFirst])).rejects.toThrow('overlaps')
    await db.query('SELECT public.place_owned_building($1, 8, 8, 0)', [premiumFirst])
    expect((await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM public.building_placements WHERE user_id = $1', [U5])).rows[0].count).toBe(2)
  })

  it('binds a purchase idempotency key to the building it paid for', async () => {
    await grantAccess(U6)
    await db.query('INSERT INTO public.coin_wallets (user_id, balance) VALUES ($1, 15000)', [U6])
    await db.query("SELECT public.purchase_building('reboot-nexus', 'shared-key')")
    await expect(db.query("SELECT public.purchase_building('starter-shack', 'shared-key')")).rejects.toThrow('different building')
    const same = await db.query<{ result: { balance: number; alreadyOwned: boolean; definitionId: string } }>("SELECT public.purchase_building('reboot-nexus', 'shared-key') AS result")
    expect(same.rows[0].result).toMatchObject({ balance: 0, alreadyOwned: true, definitionId: 'reboot-nexus' })
    expect((await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM public.building_ownership WHERE user_id = $1', [U6])).rows[0].count).toBe(1)
  })

  it('shares one activity clock across parallel sessions', async () => {
    await grantAccess(U7)
    await db.query('INSERT INTO public.coin_wallets (user_id, balance) VALUES ($1, 0)', [U7])
    const sessionA = (await db.query<{ id: string }>('INSERT INTO public.activity_sessions (user_id) VALUES ($1) RETURNING id', [U7])).rows[0].id
    const sessionB = (await db.query<{ id: string }>('INSERT INTO public.activity_sessions (user_id) VALUES ($1) RETURNING id', [U7])).rows[0].id
    await db.query('UPDATE public.activity_sessions SET last_claim_at = clock_timestamp() - interval \'15 seconds\' WHERE user_id = $1', [U7])

    const first = await db.query<{ result: { coins: number } }>('SELECT public.claim_activity_heartbeat($1, 1, 3, true, true) AS result', [sessionA])
    expect(first.rows[0].result.coins).toBe(15)
    // A second tab claiming the same wall-clock window must not earn a second payout.
    await expect(db.query('SELECT public.claim_activity_heartbeat($1, 1, 3, true, true)', [sessionB])).rejects.toThrow('At least 12 seconds')
    expect((await db.query<{ balance: number }>('SELECT balance FROM public.coin_wallets WHERE user_id = $1', [U7])).rows[0].balance).toBe(15)

    await db.query('UPDATE public.activity_rate_state SET last_claim_at = clock_timestamp() - interval \'15 seconds\' WHERE user_id = $1', [U7])
    const later = await db.query<{ result: { coins: number } }>('SELECT public.claim_activity_heartbeat($1, 1, 3, true, true) AS result', [sessionB])
    expect(later.rows[0].result.coins).toBe(15)
    expect((await db.query<{ balance: number }>('SELECT balance FROM public.coin_wallets WHERE user_id = $1', [U7])).rows[0].balance).toBe(30)
  })

  it('honours a configured interval instead of the old 12s/25s constants', async () => {
    await grantAccess(U8)
    await db.query('UPDATE public.economy_config SET active_interval_seconds = 30 WHERE singleton')
    try {
      const started = await db.query<{ result: { sessionId: string } }>('SELECT public.start_activity_session() AS result')
      const sessionId = started.rows[0].result.sessionId
      await db.query('UPDATE public.activity_sessions SET last_claim_at = clock_timestamp() - interval \'30 seconds\' WHERE id = $1', [sessionId])
      const claim = await db.query<{ result: { coins: number; creditedSeconds: number } }>('SELECT public.claim_activity_heartbeat($1, 1, 3, true, true) AS result', [sessionId])
      expect(claim.rows[0].result).toMatchObject({ coins: 15, creditedSeconds: 30 })
      await expect(db.query('SELECT public.claim_activity_heartbeat($1, 2, 3, true, true)', [sessionId])).rejects.toThrow('At least 24 seconds')
    } finally {
      await db.query('UPDATE public.economy_config SET active_interval_seconds = 15 WHERE singleton')
    }
  })

  it('resumes the existing session instead of stacking a new one per reload', async () => {
    await asUser(U8)
    const again = await db.query<{ result: { sessionId: string; nextNonce: number } }>('SELECT public.start_activity_session() AS result')
    const before = (await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM public.activity_sessions WHERE user_id = $1', [U8])).rows[0].count
    const third = await db.query<{ result: { sessionId: string; nextNonce: number } }>('SELECT public.start_activity_session() AS result')
    expect(third.rows[0].result.sessionId).toBe(again.rows[0].result.sessionId)
    expect(third.rows[0].result.nextNonce).toBe(2)
    expect((await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM public.activity_sessions WHERE user_id = $1', [U8])).rows[0].count).toBe(before)
  })

  it('reports the reward that actually exists when a contribution is retried', async () => {
    await addUser(U9)
    await asUser(ADMIN)
    const first = await db.query<{ result: { amount: number; kind: string } }>("SELECT public.reward_contribution($1, 'comment', 'idea:9:comment:1', 'Helpful') AS result", [U9])
    expect(first.rows[0].result).toMatchObject({ amount: 50, kind: 'comment' })
    const retried = await db.query<{ result: { amount: number; kind: string; alreadyRewarded: boolean } }>("SELECT public.reward_contribution($1, 'revival', 'idea:9:comment:1', 'oops') AS result", [U9])
    expect(retried.rows[0].result).toMatchObject({ amount: 50, kind: 'comment', alreadyRewarded: true })
    expect((await db.query<{ balance: number }>('SELECT balance FROM public.coin_wallets WHERE user_id = $1', [U9])).rows[0].balance).toBe(50)
  })

  it('keeps public counters working while blocking non-owner edits as the authenticated role', async () => {
    await addUser(U10)
    await addUser(U11)
    const idea = (await db.query<{ id: string }>(
      "INSERT INTO public.ideas (user_id, title) VALUES ($1, 'Original title') RETURNING id", [U10],
    )).rows[0].id
    await db.query('INSERT INTO public.coin_wallets (user_id, balance) VALUES ($1, 11), ($2, 22)', [U10, U11])

    await asUser(U11)
    await db.query('SET ROLE authenticated')
    try {
      await db.query('UPDATE public.ideas SET upvotes = upvotes + 1, views = views + 1, revival_count = revival_count + 1 WHERE id = $1', [idea])
      expect((await db.query<{ upvotes: number; views: number; revival_count: number }>('SELECT upvotes, views, revival_count FROM public.ideas WHERE id = $1', [idea])).rows[0])
        .toEqual({ upvotes: 1, views: 1, revival_count: 1 })
      await expect(db.query('UPDATE public.ideas SET title = $2 WHERE id = $1', [idea, 'Defaced'])).rejects.toThrow('Only upvotes, views and revival_count')
      await expect(db.query('UPDATE public.ideas SET user_id = $2 WHERE id = $1', [idea, U11])).rejects.toThrow('ownership cannot be changed')
      await expect(db.query("UPDATE public.ideas SET building_customization = '{\"style\":\"dome\"}'::jsonb WHERE id = $1", [idea])).rejects.toThrow('Only upvotes, views and revival_count')
      await expect(db.query('SELECT 1 FROM public.activity_rate_state')).rejects.toThrow(/permission denied/)
      const visible = await db.query<{ user_id: string }>('SELECT user_id FROM public.coin_wallets')
      expect(visible.rows).toEqual([{ user_id: U11 }])
    } finally {
      await db.query('RESET ROLE')
    }

    await asUser(U10)
    await db.query('SET ROLE authenticated')
    try {
      await db.query("UPDATE public.ideas SET building_customization = '{\"style\":\"dome\"}'::jsonb WHERE id = $1", [idea])
      expect((await db.query<{ style: string | null }>('SELECT building_customization->>\'style\' AS style FROM public.ideas WHERE id = $1', [idea])).rows[0].style).toBe('dome')
      await expect(db.query("UPDATE public.ideas SET building_customization = '{\"style\":\"castle\"}'::jsonb WHERE id = $1", [idea])).rejects.toThrow('Unsupported rooftop style')
      await db.query('UPDATE public.ideas SET title = $2 WHERE id = $1', [idea, 'Owner edit'])
      const claimed = (await db.query<{ id: string; user_id: string }>("INSERT INTO public.ideas (title) VALUES ('Fresh publish') RETURNING id, user_id")).rows[0]
      expect(claimed.user_id).toBe(U10)
    } finally {
      await db.query('RESET ROLE')
    }
  })
})
