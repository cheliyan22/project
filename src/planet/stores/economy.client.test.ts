import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BuildingId } from '@/planet/buildings/catalog'

/* Drives the real economy store against a fake PostgREST-shaped backend whose
 * latency, ordering and responses are controlled by the test. The point is to
 * pin down the purchase/reload interaction: a world where the reload after a
 * purchase can be dropped, or resolved out of order, silently leaves a player
 * who paid 15,000 coins without their building. */

type Row = Record<string, unknown>

interface FakeServer {
  balance: number
  ownership: Row[]
  placements: Row[]
  listDelay: number
  rpcDelay: number
  calls: { name: string; args: Record<string, unknown> | undefined; at: number }[]
  /** When true the server applies the purchase but the response never arrives. */
  losePurchaseResponse: boolean
  /** When true remove_building_placement reports that nothing was removed. */
  refuseRemoval: boolean
  seq: number
}

const server: FakeServer = {
  balance: 0,
  ownership: [],
  placements: [],
  listDelay: 40,
  rpcDelay: 5,
  calls: [],
  losePurchaseResponse: false,
  refuseRemoval: false,
  seq: 0,
}

const NEXUS: Row = {
  id: 'own-nexus',
  user_id: 'user-1',
  definition_id: 'reboot-nexus',
  purchase_transaction_id: 'txn-1',
  customization: {},
  acquired_at: '2026-11-01T00:00:00.000Z',
}

const later = <T,>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))

/** Runs work to completion under fake timers: the promise chain only settles
 *  while time is being advanced, so they have to move together. */
async function settle<T>(work: Promise<T>, ms = 600): Promise<T> {
  const [result] = await Promise.all([work, vi.advanceTimersByTimeAsync(ms)])
  return result
}

/* Queries snapshot the rows when they are issued, exactly like a database would:
 * a SELECT that starts before the purchase commits must not see the new row. */
function query(table: 'building_ownership' | 'building_placements') {
  return {
    select: () => ({
      order: () => {
        server.calls.push({ name: `${table}.select`, args: undefined, at: performance.now() })
        const snapshot = table === 'building_ownership' ? [...server.ownership] : [...server.placements]
        return later(server.listDelay, { data: snapshot, error: null })
      },
    }),
  }
}

const supabase = {
  from: (table: 'building_ownership' | 'building_placements') => query(table),
  rpc: (name: string, args?: Record<string, unknown>) => {
    server.calls.push({ name, args, at: performance.now() })
    server.seq += 1
    if (name === 'wallet_state') {
      const snapshot = { balance: server.balance, recentTransactions: [], dailyRemaining: null }
      return later(server.listDelay, { data: snapshot, error: null })
    }
    if (name === 'purchase_building') {
      server.balance -= 15000
      server.ownership = [NEXUS, ...server.ownership]
      if (server.losePurchaseResponse) {
        return later(server.rpcDelay, { data: null, error: { message: 'Failed to fetch' } })
      }
      return later(server.rpcDelay, { data: { owned: true, balance: server.balance }, error: null })
    }
    if (name === 'place_owned_building' || name === 'place_free_building') {
      server.placements = [{
        id: `place-${server.seq}`,
        user_id: 'user-1',
        ownership_id: args?.ownership_id ?? null,
        free_definition_id: args?.definition_id ?? null,
        grid_x: args?.x ?? 0,
        grid_z: args?.z ?? 0,
        rotation: args?.rotation ?? 0,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z',
      }]
      return later(server.rpcDelay, { data: { placementId: `place-${server.seq}` }, error: null })
    }
    if (name === 'remove_building_placement') {
      const removed = !server.refuseRemoval
      if (removed) server.placements = server.placements.filter((row) => row.id !== args?.placement_id)
      return later(server.rpcDelay, { data: { removed }, error: null })
    }
    if (name === 'customize_building') {
      return later(server.rpcDelay, { data: { customization: args?.config ?? {} }, error: null })
    }
    return later(server.rpcDelay, { data: null, error: null })
  },
}

vi.mock('@/lib/supabase', () => ({ supabase }))

const { useEconomy } = await import('@/planet/stores/economy')

const reset = () => {
  server.balance = 60000
  server.ownership = []
  server.placements = []
  server.listDelay = 40
  server.rpcDelay = 5
  server.calls = []
  server.losePurchaseResponse = false
  server.refuseRemoval = false
  server.seq = 0
  useEconomy.setState({
    balance: 0, transactions: [], ownership: [], placements: [],
    loading: false, busy: false, error: null, dailyRemaining: null,
  })
}

describe('economy store: a purchase must survive its own refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reset()
  })

  it('keeps the bought building when a load was already in flight', async () => {
    // PlanetPage loads the economy on mount; the player opens the shop and buys
    // before that first load has resolved.
    const inFlight = useEconomy.getState().loadEconomy()
    const buying = useEconomy.getState().purchase('reboot-nexus' as BuildingId)

    await vi.advanceTimersByTimeAsync(400)
    await Promise.all([inFlight, buying])

    expect(useEconomy.getState().error).toBeNull()
    expect(useEconomy.getState().ownership.map((row) => row.definition_id)).toContain('reboot-nexus')
  })

  it('does not let an older load overwrite the post-purchase state', async () => {
    // A slow load starts first, a fast reload triggered by the purchase finishes
    // first, then the slow one resolves and clobbers it with pre-purchase rows.
    server.listDelay = 300
    const slow = useEconomy.getState().loadEconomy()
    await vi.advanceTimersByTimeAsync(20)

    server.listDelay = 10
    const buying = useEconomy.getState().purchase('reboot-nexus' as BuildingId)

    await vi.advanceTimersByTimeAsync(600)
    await Promise.all([slow, buying])

    expect(useEconomy.getState().ownership.map((row) => row.definition_id)).toContain('reboot-nexus')
    expect(useEconomy.getState().balance).toBe(45000)
  })

  it('reconciles when the purchase succeeded on the server but the response was lost', async () => {
    server.losePurchaseResponse = true
    const ok = await settle(useEconomy.getState().purchase('reboot-nexus' as BuildingId))

    expect(ok).toBe(false)
    expect(useEconomy.getState().error).toBe('Failed to fetch')
    // The coins were spent server-side, so the client must show the real state.
    expect(server.calls.filter((call) => call.name === 'building_ownership.select').length).toBeGreaterThan(0)
    expect(useEconomy.getState().ownership.map((row) => row.definition_id)).toContain('reboot-nexus')
  })

  it('reuses one idempotency key across retries of the same purchase intent', async () => {
    server.losePurchaseResponse = true
    await settle(useEconomy.getState().purchase('reboot-nexus' as BuildingId))

    server.losePurchaseResponse = false
    await settle(useEconomy.getState().purchase('reboot-nexus' as BuildingId))

    const keys = server.calls
      .filter((call) => call.name === 'purchase_building')
      .map((call) => call.args?.idempotency_key)
    expect(keys.length).toBe(2)
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
  })

  it('reports a refused removal instead of pretending the row is gone', async () => {
    server.placements = [{
      id: 'place-1', user_id: 'user-1', ownership_id: 'own-nexus', free_definition_id: null,
      grid_x: 0, grid_z: 0, rotation: 0, created_at: '', updated_at: '',
    }]
    server.refuseRemoval = true

    const ok = await settle(useEconomy.getState().removePlacement('place-1'))

    expect(ok).toBe(false)
    expect(useEconomy.getState().error).toBeTruthy()
    expect(useEconomy.getState().placements.map((row) => row.id)).toContain('place-1')
  })
})
