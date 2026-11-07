/**
 * Placement overlap regression check for the shop purchase -> first placement flow.
 * Runs the real migration SQL in an isolated in-memory Postgres (never touches any project DB).
 *   node placement-overlap.check.mjs            -> full chain (original + overlap fix)
 *   node placement-overlap.check.mjs --legacy   -> original migration only, documents the bug
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const UID = '00000000-0000-4000-8000-000000000001'
const legacy = process.argv.includes('--legacy')
const db = new PGlite()
const rpc = async (fn, ...args) => (await db.query(`SELECT public.${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS r`, args)).rows[0].r
const expectError = async (label, fn, ...args) => {
  await assert.rejects(rpc(fn, ...args), new RegExp(label[1]), label[0])
  return label[0]
}

try {
  await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;')
  // Minimal auth stub: the RPCs read auth.uid() and auth.users.created_at via planet_has_access().
  await db.exec(`CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${UID}'::uuid $$;
    INSERT INTO auth.users (id, created_at) VALUES ('${UID}', now() - interval '60 days');`)
  await db.exec(await readFile(new URL('./supabase/migrations/20261025000000_reboot_planet_economy.sql', import.meta.url), 'utf8'))
  if (!legacy) await db.exec(await readFile(new URL('./supabase/migrations/20261031130000_fix_placement_overlap_first_insert.sql', import.meta.url), 'utf8'))

  await db.query('INSERT INTO public.coin_wallets (user_id, balance) VALUES ($1, 50000)', [UID])
  const purchase = await rpc('purchase_building', 'reboot-nexus', 'check-key-1')
  assert.equal(purchase.owned, true, 'purchase should confirm ownership')
  const { rows: ownRows } = await db.query('SELECT id FROM public.building_ownership WHERE user_id = $1', [UID])
  const nexus = ownRows[0].id

  const shack = await rpc('place_free_building', 'starter-shack', 0, 0, 0)
  assert.equal(shack.x, 0, 'free building places at the requested anchor')

  if (legacy) {
    // Documented old behaviour: the friendly overlap check was NULL-skipped for brand-new
    // placements, so an occupied anchor died on the raw unique constraint and a partially
    // overlapping anchor inserted intersecting buildings.
    await expectError('legacy same-anchor crash is a raw constraint error, not a clean overlap message',
      'place_owned_building', nexus, 0, 0, 0, /duplicate key value violates unique constraint "building_placements_user_id_grid_x_grid_z_key"/)
    const leak = await rpc('place_owned_building', nexus, -1, -1, 0)
    assert.equal(leak.x, -1, 'legacy allows an intersecting placement')
    console.log('Placement overlap LEGACY check passed: reproduced raw 23505 crash on occupied anchor + silent intersecting insert.')
  } else {
    // Same purchase -> first placement flow with the fix applied.
    await expectError('occupied anchor reports a clean overlap error',
      'place_owned_building', nexus, 0, 0, 0, /Building footprint overlaps another placement/)
    await expectError('partially overlapping anchor is rejected',
      'place_owned_building', nexus, -1, -1, 0, /Building footprint overlaps another placement/)

    const placed = await rpc('place_owned_building', nexus, 1, 1, 0)
    assert.ok(placed.placementId, 'first Nexus placement succeeds on a free area')

    const moved = await rpc('place_owned_building', nexus, 1, 1, 2)
    assert.equal(moved.rotation, 2, 're-saving the same footprint is not a self-overlap')
    await expectError('moving the Nexus onto the shack is rejected',
      'place_owned_building', nexus, 0, 0, 0, /Building footprint overlaps another placement/)
    await expectError('rotated 2x2 footprint still respects world bounds',
      'place_owned_building', nexus, 12, 0, 1, /out of bounds|exceeds world boundaries/)

    await expectError('replacing the free building under the Nexus is rejected',
      'place_free_building', 'brickbox', 1, 1, 0, /Building footprint overlaps another placement/)
    const replaced = await rpc('place_free_building', 'brickbox', 5, 5, 0)
    assert.equal(replaced.definitionId, 'brickbox', 'free slot moves to a clear cell')

    const removed = await rpc('remove_building_placement', placed.placementId)
    assert.equal(removed.removed, true, 'owned placement can be removed and re-placed')
    await rpc('place_owned_building', nexus, 0, 0, 0)

    const { rows } = await db.query('SELECT count(*)::int AS n FROM public.building_placements WHERE user_id = $1', [UID])
    assert.equal(rows[0].n, 2, 'one free slot and one owned placement remain')
    console.log('Placement overlap check passed: purchase -> first placement errors cleanly on collisions, succeeds on free cells, and re-placement honours own-row exclusion and bounds.')
  }
} finally {
  await db.close()
}
