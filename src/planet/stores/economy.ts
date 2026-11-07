import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { BuildingCustomization, BuildingId } from '@/planet/buildings/catalog'

export interface CoinTransaction {
  id: string
  amount: number
  type: string
  reason: string
  sourceKey: string
  createdAt: string
}

export interface OwnershipRecord {
  id: string
  user_id: string
  definition_id: BuildingId
  purchase_transaction_id: string | null
  customization: Partial<BuildingCustomization>
  acquired_at: string
}

export interface PlacementRecord {
  id: string
  user_id: string
  ownership_id: string | null
  free_definition_id: BuildingId | null
  grid_x: number
  grid_z: number
  rotation: number
  updated_at: string
}

interface EconomyState {
  balance: number
  transactions: CoinTransaction[]
  ownership: OwnershipRecord[]
  placements: PlacementRecord[]
  loading: boolean
  busy: boolean
  error: string | null
  dailyRemaining: number | null
  loadEconomy: () => Promise<void>
  purchase: (definitionId: BuildingId) => Promise<boolean>
  customize: (ownershipId: string, config: Partial<BuildingCustomization>) => Promise<boolean>
  placeFree: (definitionId: BuildingId, x: number, z: number, rotation: number) => Promise<boolean>
  placeOwned: (ownershipId: string, x: number, z: number, rotation: number) => Promise<boolean>
  removePlacement: (placementId: string) => Promise<boolean>
}

/* A purchase is one intent, not one click. If the response is lost the coins may
 * still have been spent server-side, so a retry has to carry the same
 * idempotency key or the server sees a second, unrelated purchase. */
let purchaseIntent: { definitionId: BuildingId; key: string } | null = null

function intentKeyFor(definitionId: BuildingId): string {
  if (!purchaseIntent || purchaseIntent.definitionId !== definitionId) {
    purchaseIntent = { definitionId, key: crypto.randomUUID() }
  }
  return purchaseIntent.key
}

/* PostgREST returns PostgrestError (an Error subclass) but a lost response or a
 * thrown literal can arrive as a bare { message }. Both must reach the player. */
const message = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message
  const shaped = typeof error === 'object' && error !== null ? (error as { message?: unknown }).message : undefined
  return typeof shaped === 'string' && shaped ? shaped : fallback
}

export const useEconomy = create<EconomyState>((set, get) => {
  /* Wallet and list reads are serialised. Overlapping reads are how a paid-for
   * building disappears: a load issued before the purchase commits resolves
   * afterwards and writes the pre-purchase rows over the fresh ones. Queueing
   * also means a reload requested *during* a load is never dropped. */
  let chain: Promise<void> = Promise.resolve()
  let queued = 0

  const readEconomy = async () => {
    try {
      const [wallet, ownership, placements] = await Promise.all([
        supabase.rpc('wallet_state'),
        supabase.from('building_ownership').select('*').order('acquired_at', { ascending: false }),
        supabase.from('building_placements').select('*').order('created_at', { ascending: true }),
      ])
      if (wallet.error) throw wallet.error
      if (ownership.error) throw ownership.error
      if (placements.error) throw placements.error
      set({
        balance: Number(wallet.data?.balance ?? 0),
        transactions: (wallet.data?.recentTransactions ?? []) as CoinTransaction[],
        ownership: (ownership.data ?? []) as OwnershipRecord[],
        placements: (placements.data ?? []) as PlacementRecord[],
        dailyRemaining: wallet.data?.dailyRemaining ?? null,
        error: null,
      })
    } catch (error) {
      set({ error: message(error, 'Economy data could not load.') })
    }
  }

  const enqueueLoad = (): Promise<void> => {
    queued += 1
    set({ loading: true })
    chain = chain.then(readEconomy).finally(() => {
      queued -= 1
      if (queued === 0) set({ loading: false })
    })
    return chain
  }

  return {
    balance: 0, transactions: [], ownership: [], placements: [], loading: false, busy: false, error: null, dailyRemaining: null,

    loadEconomy: enqueueLoad,

    async purchase(definitionId) {
      if (get().busy) return false
      set({ busy: true, error: null })
      const idempotencyKey = intentKeyFor(definitionId)
      try {
        const { data, error } = await supabase.rpc('purchase_building', { definition_id: definitionId, idempotency_key: idempotencyKey })
        if (error) throw error
        purchaseIntent = null
        set({ balance: Number(data?.balance ?? get().balance) })
        await enqueueLoad()
        set({ busy: false })
        return Boolean(data?.owned)
      } catch (error) {
        // The purchase may have committed before the response was lost, so never
        // leave the player looking at pre-purchase state. Read the truth, then
        // report the failure that prompted it.
        const failure = message(error, 'Purchase failed. No changes were confirmed.')
        await enqueueLoad()
        set({ busy: false, error: failure })
        return false
      }
    },

    async customize(ownershipId, config) {
      if (get().busy) return false
      set({ busy: true, error: null })
      try {
        const { data, error } = await supabase.rpc('customize_building', { ownership_id: ownershipId, config })
        if (error) throw error
        set(state => ({ busy: false, ownership: state.ownership.map(record => record.id === ownershipId ? { ...record, customization: data?.customization ?? {} } : record) }))
        return true
      } catch (error) {
        set({ busy: false, error: message(error, 'Customization could not be saved.') })
        return false
      }
    },

    async placeFree(definitionId, x, z, rotation) {
      if (get().busy) return false
      set({ busy: true, error: null })
      try {
        const { error } = await supabase.rpc('place_free_building', { definition_id: definitionId, x, z, rotation })
        if (error) throw error
        await enqueueLoad()
        set({ busy: false })
        return true
      } catch (error) {
        const failure = message(error, 'Free building could not be placed.')
        await enqueueLoad()
        set({ busy: false, error: failure })
        return false
      }
    },

    async placeOwned(ownershipId, x, z, rotation) {
      if (get().busy) return false
      set({ busy: true, error: null })
      try {
        const { error } = await supabase.rpc('place_owned_building', { ownership_id: ownershipId, x, z, rotation })
        if (error) throw error
        await enqueueLoad()
        set({ busy: false })
        return true
      } catch (error) {
        const failure = message(error, 'Owned building could not be placed.')
        await enqueueLoad()
        set({ busy: false, error: failure })
        return false
      }
    },

    async removePlacement(placementId) {
      if (get().busy) return false
      set({ busy: true, error: null })
      try {
        const { data, error } = await supabase.rpc('remove_building_placement', { placement_id: placementId })
        if (error) throw error
        // The row may already be gone. Reconcile before reporting anything, so a
        // "removed" that never happened cannot be shown as success.
        await enqueueLoad()
        const refused = data?.removed === false
        set({ busy: false, error: refused ? 'That placement was already gone. The grid has been refreshed.' : null })
        return !refused
      } catch (error) {
        const failure = message(error, 'Placement could not be removed.')
        await enqueueLoad()
        set({ busy: false, error: failure })
        return false
      }
    },
  }
})

let activityListeners = 0
let activityTimer = 0
let activityCount = 0
let activityBusy = false

function recordActivity(event: Event) {
  if (event.isTrusted) activityCount = Math.min(1000, activityCount + 1)
}

/** Server timestamps and nonces determine rewards; the browser never submits a balance or duration. */
export function startActivityRewards(onBalance: (balance: number, dailyRemaining: number | null) => void) {
  if (activityTimer) return () => undefined
  let stopped = false
  let sessionId = ''
  let nextNonce = 1
  const events: Array<keyof WindowEventMap> = ['pointerdown', 'pointermove', 'keydown', 'scroll']
  events.forEach(event => window.addEventListener(event, recordActivity, { passive: true }))
  activityListeners = events.length

  const claim = async () => {
    if (stopped || activityBusy || !sessionId || document.hidden || !document.hasFocus() || activityCount === 0) return
    activityBusy = true
    const count = activityCount
    try {
      const { data, error } = await supabase.rpc('claim_activity_heartbeat', {
        session_id: sessionId, nonce: nextNonce, activity_count: count,
        visible: !document.hidden, focused: document.hasFocus(),
      })
      if (error) throw error
      nextNonce = Number(data?.nextNonce ?? nextNonce + 1)
      activityCount = Math.max(0, activityCount - count)
      onBalance(Number(data?.balance ?? 0), Number(data?.dailyRemaining ?? 0))
    } catch {
      // Keep the same nonce for a safe retry. The server rejects duplicate credit.
    } finally { activityBusy = false }
  }

  void supabase.rpc('start_activity_session').then(({ data, error }) => {
    if (stopped || error || !data?.sessionId) return
    sessionId = data.sessionId
    nextNonce = Number(data.nextNonce ?? 1)
    activityTimer = window.setInterval(() => void claim(), 15000)
  })

  return () => {
    stopped = true
    if (activityTimer) window.clearInterval(activityTimer)
    activityTimer = 0; sessionId = ''; activityCount = 0
    if (activityListeners) events.forEach(event => window.removeEventListener(event, recordActivity))
    activityListeners = 0
  }
}
