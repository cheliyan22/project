-- Fix first-placement overlap checks in the building placement RPCs.
--
-- Bug: both place_free_building() and place_owned_building() guard overlaps with
--   `occupied.id <> v_placement.id`. For a brand-new placement v_placement is a NULL row, so
--   the comparison is NULL for every candidate and the EXISTS finds nothing. The friendly
--   'Building footprint overlaps another placement' error never fires on the first placement:
--   an identical anchor instead aborts on the raw unique constraint
--   building_placements_user_id_grid_x_grid_z_key, and a partially overlapping anchor inserts
--   intersecting buildings. This is exactly the shop purchase -> first placement flow.
--
-- Fix: compare with IS DISTINCT FROM, and make both footprint extents rotation-aware on the
-- incoming and occupied sides. No data is rewritten; grants and function ownership are
-- unchanged (CREATE OR REPLACE preserves the existing EXECUTE grants to authenticated).

CREATE OR REPLACE FUNCTION public.place_free_building(
  definition_id text, x integer, z integer, rotation integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_placement public.building_placements%rowtype;
  v_width integer;
  v_depth integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.planet_has_access() THEN
    RAISE EXCEPTION 'Planet access has expired';
  END IF;
  IF x IS NULL OR z IS NULL OR abs(x) > 12 OR abs(z) > 12 THEN
    RAISE EXCEPTION 'Grid coordinates are out of bounds';
  END IF;
  IF rotation IS NULL OR rotation NOT BETWEEN 0 AND 3 THEN
    RAISE EXCEPTION 'Rotation must be between 0 and 3';
  END IF;

  SELECT CASE WHEN place_free_building.rotation IN (1, 3)
              THEN (bd.footprint->>'depth')::integer ELSE (bd.footprint->>'width')::integer END,
         CASE WHEN place_free_building.rotation IN (1, 3)
              THEN (bd.footprint->>'width')::integer ELSE (bd.footprint->>'depth')::integer END
    INTO v_width, v_depth
  FROM public.building_definitions bd
  WHERE bd.id = place_free_building.definition_id AND bd.enabled AND NOT bd.is_premium;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Building is not an enabled free definition';
  END IF;
  IF x + v_width - 1 > 12 OR z + v_depth - 1 > 12 THEN
    RAISE EXCEPTION 'Building footprint exceeds world boundaries';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 4101));

  SELECT * INTO v_placement FROM public.building_placements bp
    WHERE bp.user_id = v_uid AND bp.free_definition_id IS NOT NULL
    FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.building_placements occupied
    LEFT JOIN public.building_ownership bo ON bo.id = occupied.ownership_id
    JOIN public.building_definitions bd ON bd.id = COALESCE(bo.definition_id, occupied.free_definition_id)
    WHERE occupied.user_id = v_uid
      AND occupied.id IS DISTINCT FROM v_placement.id
      AND x < occupied.grid_x + CASE WHEN occupied.rotation IN (1, 3)
            THEN (bd.footprint->>'depth')::integer ELSE (bd.footprint->>'width')::integer END
      AND x + v_width > occupied.grid_x
      AND z < occupied.grid_z + CASE WHEN occupied.rotation IN (1, 3)
            THEN (bd.footprint->>'width')::integer ELSE (bd.footprint->>'depth')::integer END
      AND z + v_depth > occupied.grid_z
  ) THEN
    RAISE EXCEPTION 'Building footprint overlaps another placement';
  END IF;

  IF v_placement.id IS NULL THEN
    INSERT INTO public.building_placements (
      user_id, free_definition_id, grid_x, grid_z, rotation
    ) VALUES (v_uid, place_free_building.definition_id, x, z, rotation)
    RETURNING * INTO v_placement;
  ELSE
    UPDATE public.building_placements bp
      SET free_definition_id = place_free_building.definition_id, grid_x = x, grid_z = z,
          rotation = place_free_building.rotation, updated_at = now()
      WHERE bp.id = v_placement.id
      RETURNING * INTO v_placement;
  END IF;

  RETURN jsonb_build_object(
    'placementId', v_placement.id,
    'definitionId', v_placement.free_definition_id,
    'x', v_placement.grid_x,
    'z', v_placement.grid_z,
    'rotation', v_placement.rotation,
    'updatedAt', v_placement.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.place_owned_building(
  ownership_id uuid, x integer, z integer, rotation integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_definition public.building_definitions%rowtype;
  v_placement public.building_placements%rowtype;
  v_max_placed integer;
  v_width integer;
  v_depth integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.planet_has_access() THEN
    RAISE EXCEPTION 'Planet access has expired';
  END IF;
  IF x IS NULL OR z IS NULL OR abs(x) > 12 OR abs(z) > 12 THEN
    RAISE EXCEPTION 'Grid coordinates are out of bounds';
  END IF;
  IF rotation IS NULL OR rotation NOT BETWEEN 0 AND 3 THEN
    RAISE EXCEPTION 'Rotation must be between 0 and 3';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 4101));

  SELECT bd.* INTO v_definition
    FROM public.building_ownership bo
    JOIN public.building_definitions bd ON bd.id = bo.definition_id
    WHERE bo.id = ownership_id AND bo.user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Building ownership not found';
  END IF;
  IF NOT v_definition.is_premium THEN
    RAISE EXCEPTION 'Free buildings use the free placement RPC';
  END IF;

  v_width := CASE WHEN place_owned_building.rotation IN (1, 3)
                  THEN (v_definition.footprint->>'depth')::integer
                  ELSE (v_definition.footprint->>'width')::integer END;
  v_depth := CASE WHEN place_owned_building.rotation IN (1, 3)
                  THEN (v_definition.footprint->>'width')::integer
                  ELSE (v_definition.footprint->>'depth')::integer END;

  SELECT * INTO v_placement FROM public.building_placements bp
    WHERE bp.ownership_id = place_owned_building.ownership_id AND bp.user_id = v_uid
    FOR UPDATE;
  IF x + v_width - 1 > 12 OR z + v_depth - 1 > 12 THEN
    RAISE EXCEPTION 'Building footprint exceeds world boundaries';
  END IF;
  IF v_placement.id IS NULL THEN
    IF NOT v_definition.enabled THEN
      RAISE EXCEPTION 'Building definition is unavailable';
    END IF;
    SELECT ec.max_placed_premium INTO v_max_placed
      FROM public.economy_config ec WHERE ec.singleton;
    IF (SELECT count(*) FROM public.building_placements bp
        WHERE bp.user_id = v_uid AND bp.ownership_id IS NOT NULL) >= v_max_placed THEN
      RAISE EXCEPTION 'Premium placement capacity reached';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.building_placements occupied
    LEFT JOIN public.building_ownership bo ON bo.id = occupied.ownership_id
    JOIN public.building_definitions bd ON bd.id = COALESCE(bo.definition_id, occupied.free_definition_id)
    WHERE occupied.user_id = v_uid
      AND occupied.id IS DISTINCT FROM v_placement.id
      AND x < occupied.grid_x + CASE WHEN occupied.rotation IN (1, 3)
            THEN (bd.footprint->>'depth')::integer ELSE (bd.footprint->>'width')::integer END
      AND x + v_width > occupied.grid_x
      AND z < occupied.grid_z + CASE WHEN occupied.rotation IN (1, 3)
            THEN (bd.footprint->>'width')::integer ELSE (bd.footprint->>'depth')::integer END
      AND z + v_depth > occupied.grid_z
  ) THEN
    RAISE EXCEPTION 'Building footprint overlaps another placement';
  END IF;

  IF v_placement.id IS NULL THEN
    INSERT INTO public.building_placements (
      user_id, ownership_id, grid_x, grid_z, rotation
    ) VALUES (v_uid, ownership_id, x, z, rotation)
    RETURNING * INTO v_placement;
  ELSE
    UPDATE public.building_placements bp
      SET grid_x = x, grid_z = z, rotation = place_owned_building.rotation,
          updated_at = now()
      WHERE bp.id = v_placement.id
      RETURNING * INTO v_placement;
  END IF;

  RETURN jsonb_build_object(
    'placementId', v_placement.id,
    'ownershipId', v_placement.ownership_id,
    'definitionId', v_definition.id,
    'x', v_placement.grid_x,
    'z', v_placement.grid_z,
    'rotation', v_placement.rotation,
    'updatedAt', v_placement.updated_at
  );
END;
$$;
