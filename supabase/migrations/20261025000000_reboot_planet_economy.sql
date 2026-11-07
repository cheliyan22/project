-- Reboot Planet economy: additive Supabase/PostgreSQL schema and server-only RPCs.
-- Existing profiles, ideas, wallets, and balances are never replaced or reset.

CREATE TABLE public.planet_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Trusted SQL bootstrap only (run manually by a database owner with a trusted email):
-- INSERT INTO public.planet_admins (user_id)
-- SELECT id FROM auth.users WHERE email = 'trusted-admin@example.com';
-- There is deliberately no client RPC or policy that can grant admin access.

CREATE TABLE public.economy_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  active_coins bigint NOT NULL CHECK (active_coins > 0),
  active_interval_seconds integer NOT NULL CHECK (active_interval_seconds > 0),
  daily_activity_cap bigint NOT NULL CHECK (daily_activity_cap >= 0),
  max_placed_premium integer NOT NULL CHECK (max_placed_premium >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.economy_config (
  singleton, active_coins, active_interval_seconds, daily_activity_cap, max_placed_premium
) VALUES (true, 15, 15, 14400, 24)
-- Re-applying a migration must never overwrite operator-tuned economy values.
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE public.building_definitions (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  is_premium boolean NOT NULL,
  price bigint NOT NULL CHECK (
    (NOT is_premium AND price = 0) OR (is_premium AND price > 0)
  ),
  footprint jsonb NOT NULL,
  customization_config jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  enabled boolean NOT NULL DEFAULT true,
  CHECK (jsonb_typeof(footprint) = 'object'),
  CHECK (jsonb_typeof(customization_config) = 'object')
);

INSERT INTO public.building_definitions (
  id, name, description, is_premium, price, footprint, customization_config, version, enabled
)
WITH supported_customization AS (
  SELECT '{
    "exteriorColor": {"type": "color", "format": "hex-rrggbb"},
    "finish": {"type": "enum", "values": ["metal", "concrete", "obsidian", "wood", "glass"]},
    "lightingColor": {"type": "color", "format": "hex-rrggbb"},
    "accessories": {"type": "array", "allowed": ["antenna", "holo-sign", "garden", "solar-array"]}
  }'::jsonb AS config
), definitions(id, name, description, is_premium, price, footprint) AS (
  VALUES
    ('starter-shack', 'Starter Shack', 'A modest first foothold on the planet.', false, 0, '{"width":1,"depth":1}'::jsonb),
    ('brickbox', 'Brickbox', 'A sturdy brick workspace for new ideas.', false, 0, '{"width":1,"depth":1}'::jsonb),
    ('abandoned-shed', 'Abandoned Shed', 'A forgotten shed ready for revival.', false, 0, '{"width":1,"depth":1}'::jsonb),
    ('modern-cube', 'Modern Cube', 'Clean lines and a compact modern silhouette.', false, 0, '{"width":1,"depth":1}'::jsonb),
    ('mini-warehouse', 'Mini Warehouse', 'Small-scale storage for ambitious projects.', false, 0, '{"width":1,"depth":1}'::jsonb),
    ('research-pod', 'Research Pod', 'A focused pod for experiments and discovery.', false, 0, '{"width":1,"depth":1}'::jsonb),
    ('neon-corner', 'Neon Corner', 'A bright corner for late-night building.', false, 0, '{"width":1,"depth":1}'::jsonb),
    ('stackhouse-mini', 'Stackhouse Mini', 'A compact stacked home for builders.', false, 0, '{"width":1,"depth":1}'::jsonb),
    ('hackers-den-mini', 'Hackers Den Mini', 'A small den with a hacker spirit.', false, 0, '{"width":1,"depth":1}'::jsonb),
    ('concrete-tower', 'Concrete Tower', 'A resilient concrete landmark.', false, 0, '{"width":1,"depth":1}'::jsonb),
    ('reboot-nexus', 'Reboot Nexus', 'The premium heart of a revived planet.', true, 15000, '{"width":2,"depth":2}'::jsonb)
)
SELECT d.id, d.name, d.description, d.is_premium, d.price, d.footprint,
       s.config, 1, true
FROM definitions d
CROSS JOIN supported_customization s
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_premium = EXCLUDED.is_premium,
  price = EXCLUDED.price,
  footprint = EXCLUDED.footprint,
  customization_config = EXCLUDED.customization_config,
  version = EXCLUDED.version,
  enabled = EXCLUDED.enabled;

CREATE TABLE public.coin_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount bigint NOT NULL,
  type text NOT NULL,
  reason text NOT NULL,
  source_key text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX coin_transactions_user_created_idx
  ON public.coin_transactions (user_id, created_at DESC);

CREATE TABLE public.building_ownership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  definition_id text NOT NULL REFERENCES public.building_definitions(id) ON DELETE RESTRICT,
  purchase_transaction_id uuid UNIQUE REFERENCES public.coin_transactions(id) ON DELETE RESTRICT,
  customization jsonb NOT NULL DEFAULT '{}'::jsonb,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, definition_id),
  CHECK (jsonb_typeof(customization) = 'object')
);

CREATE TABLE public.building_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ownership_id uuid REFERENCES public.building_ownership(id) ON DELETE RESTRICT,
  free_definition_id text REFERENCES public.building_definitions(id) ON DELETE RESTRICT,
  grid_x integer NOT NULL CHECK (grid_x BETWEEN -12 AND 12),
  grid_z integer NOT NULL CHECK (grid_z BETWEEN -12 AND 12),
  rotation integer NOT NULL DEFAULT 0 CHECK (rotation BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((ownership_id IS NOT NULL AND free_definition_id IS NULL)
      OR (ownership_id IS NULL AND free_definition_id IS NOT NULL)),
  UNIQUE (ownership_id),
  UNIQUE (user_id, grid_x, grid_z)
);

CREATE UNIQUE INDEX building_placements_one_free_per_user_idx
  ON public.building_placements (user_id)
  WHERE free_definition_id IS NOT NULL;

CREATE TABLE public.activity_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_claim_at timestamptz NOT NULL DEFAULT now(),
  next_nonce integer NOT NULL DEFAULT 1 CHECK (next_nonce > 0),
  daily_earned bigint NOT NULL DEFAULT 0 CHECK (daily_earned >= 0),
  activity_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date)
);

CREATE INDEX activity_sessions_user_day_idx
  ON public.activity_sessions (user_id, activity_day);

ALTER TABLE public.planet_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.economy_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.building_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.building_ownership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.building_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY economy_config_public_read ON public.economy_config
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY building_definitions_public_read ON public.building_definitions
  FOR SELECT TO anon, authenticated USING (enabled);
CREATE POLICY coin_wallets_owner_read ON public.coin_wallets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY coin_transactions_owner_read ON public.coin_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY building_ownership_owner_read ON public.building_ownership
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY building_placements_owner_read ON public.building_placements
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY activity_sessions_owner_read ON public.activity_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.planet_admins FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.economy_config, public.building_definitions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.coin_wallets, public.coin_transactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.building_ownership, public.building_placements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.activity_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.economy_config, public.building_definitions TO anon, authenticated;
GRANT SELECT ON public.coin_wallets, public.coin_transactions TO authenticated;
GRANT SELECT ON public.building_ownership, public.building_placements TO authenticated;
GRANT SELECT ON public.activity_sessions TO authenticated;

CREATE OR REPLACE FUNCTION public.planet_has_access()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_created_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.planet_admins pa WHERE pa.user_id = v_uid) THEN
    RETURN true;
  END IF;

  SELECT u.created_at INTO v_created_at FROM auth.users u WHERE u.id = v_uid;
  RETURN v_created_at IS NOT NULL AND now() >= v_created_at + interval '30 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.planet_access_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_created_at timestamptz;
  v_expires_at timestamptz;
  v_is_admin boolean := false;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT u.created_at INTO v_created_at FROM auth.users u WHERE u.id = v_uid;
    v_expires_at := v_created_at + interval '30 days';
    SELECT EXISTS (SELECT 1 FROM public.planet_admins pa WHERE pa.user_id = v_uid)
      INTO v_is_admin;
  END IF;

  RETURN jsonb_build_object(
    'hasAccess', public.planet_has_access(),
    'isAdmin', v_is_admin,
    'unlockAt', v_expires_at,
    'daysRemaining', CASE
      WHEN v_expires_at IS NULL THEN NULL
      ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_expires_at - now())) / 86400)::integer)
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_building(definition_id text, idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance bigint;
  v_definition public.building_definitions%rowtype;
  v_transaction public.coin_transactions%rowtype;
  v_ownership public.building_ownership%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.planet_has_access() THEN
    RAISE EXCEPTION 'Planet access has expired';
  END IF;
  IF idempotency_key IS NULL OR btrim(idempotency_key) = '' THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  INSERT INTO public.coin_wallets (user_id) VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT cw.balance INTO v_balance FROM public.coin_wallets cw
    WHERE cw.user_id = v_uid FOR UPDATE;

  SELECT * INTO v_transaction FROM public.coin_transactions ct
    WHERE ct.user_id = v_uid
      AND ct.idempotency_key = purchase_building.idempotency_key;
  IF FOUND THEN
    IF v_transaction.type <> 'building_purchase' THEN
      RAISE EXCEPTION 'Idempotency key was already used for another operation';
    END IF;
    SELECT * INTO v_ownership FROM public.building_ownership bo
      WHERE bo.purchase_transaction_id = v_transaction.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Prior purchase is missing its ownership record';
    END IF;
    RETURN jsonb_build_object(
      'balance', v_balance,
      'owned', true,
      'alreadyOwned', true,
      'ownershipId', v_ownership.id,
      'definitionId', v_ownership.definition_id,
      'purchaseTransactionId', v_transaction.id,
      'customization', v_ownership.customization
    );
  END IF;

  SELECT * INTO v_definition FROM public.building_definitions bd
    WHERE bd.id = purchase_building.definition_id AND bd.enabled;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Building definition is unavailable';
  END IF;
  IF NOT v_definition.is_premium OR v_definition.price IS NULL THEN
    RAISE EXCEPTION 'Only premium buildings are purchased';
  END IF;

  SELECT * INTO v_ownership FROM public.building_ownership bo
    WHERE bo.user_id = v_uid AND bo.definition_id = purchase_building.definition_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'balance', v_balance,
      'owned', true,
      'alreadyOwned', true,
      'ownershipId', v_ownership.id,
      'definitionId', v_ownership.definition_id,
      'purchaseTransactionId', v_ownership.purchase_transaction_id,
      'customization', v_ownership.customization
    );
  END IF;

  IF v_balance < v_definition.price THEN
    RAISE EXCEPTION 'Insufficient coin balance';
  END IF;

  INSERT INTO public.coin_transactions (
    user_id, amount, type, reason, source_key, idempotency_key
  ) VALUES (
    v_uid, -v_definition.price, 'building_purchase',
    'Purchased ' || v_definition.id, 'building:' || v_definition.id, idempotency_key
  ) RETURNING * INTO v_transaction;

  UPDATE public.coin_wallets cw
    SET balance = cw.balance - v_definition.price, updated_at = now()
    WHERE cw.user_id = v_uid
    RETURNING cw.balance INTO v_balance;

  INSERT INTO public.building_ownership (
    user_id, definition_id, purchase_transaction_id
  ) VALUES (v_uid, v_definition.id, v_transaction.id)
  RETURNING * INTO v_ownership;

  RETURN jsonb_build_object(
    'balance', v_balance,
    'owned', true,
    'alreadyOwned', false,
    'ownershipId', v_ownership.id,
    'definitionId', v_ownership.definition_id,
    'purchaseTransactionId', v_transaction.id,
    'customization', v_ownership.customization
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.customize_building(ownership_id uuid, config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ownership public.building_ownership%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF config IS NULL OR jsonb_typeof(config) <> 'object' THEN
    RAISE EXCEPTION 'Customization config must be an object';
  END IF;

  -- {} is the supported reset (and preview-safe) value; no coins are touched.
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(config) k(key)
    WHERE k.key NOT IN ('exteriorColor', 'finish', 'lightingColor', 'accessories')
  ) THEN
    RAISE EXCEPTION 'Unsupported customization field';
  END IF;
  IF config ? 'exteriorColor' AND (
    jsonb_typeof(config->'exteriorColor') <> 'string'
    OR config->>'exteriorColor' !~ '^#[0-9A-Fa-f]{6}$'
  ) THEN
    RAISE EXCEPTION 'Exterior color must be a six-digit hex color';
  END IF;
  IF config ? 'finish' AND (
    jsonb_typeof(config->'finish') <> 'string'
    OR config->>'finish' NOT IN ('metal', 'concrete', 'obsidian', 'wood', 'glass')
  ) THEN
    RAISE EXCEPTION 'Unsupported exterior finish';
  END IF;
  IF config ? 'lightingColor' AND (
    jsonb_typeof(config->'lightingColor') <> 'string'
    OR config->>'lightingColor' !~ '^#[0-9A-Fa-f]{6}$'
  ) THEN
    RAISE EXCEPTION 'Lighting color must be a six-digit hex color';
  END IF;
  IF config ? 'accessories' THEN
    IF jsonb_typeof(config->'accessories') <> 'array' THEN
      RAISE EXCEPTION 'Accessories must be an array';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(config->'accessories') a(value)
      WHERE jsonb_typeof(a.value) <> 'string'
         OR a.value #>> '{}' NOT IN ('antenna', 'holo-sign', 'garden', 'solar-array')
    ) THEN
      RAISE EXCEPTION 'Unsupported accessory';
    END IF;
  END IF;

  UPDATE public.building_ownership bo
    SET customization = config
    WHERE bo.id = ownership_id AND bo.user_id = v_uid
    RETURNING * INTO v_ownership;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Building ownership not found';
  END IF;

  RETURN jsonb_build_object(
    'owned', true,
    'ownershipId', v_ownership.id,
    'definitionId', v_ownership.definition_id,
    'customization', v_ownership.customization
  );
END;
$$;

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
  IF NOT EXISTS (
    SELECT 1 FROM public.building_definitions bd
    WHERE bd.id = place_free_building.definition_id AND bd.enabled AND NOT bd.is_premium
  ) THEN
    RAISE EXCEPTION 'Building is not an enabled free definition';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 4101));

  SELECT * INTO v_placement FROM public.building_placements bp
    WHERE bp.user_id = v_uid AND bp.free_definition_id IS NOT NULL
    FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.building_placements occupied
    LEFT JOIN public.building_ownership bo ON bo.id = occupied.ownership_id
    JOIN public.building_definitions bd ON bd.id = COALESCE(bo.definition_id, occupied.free_definition_id)
    WHERE occupied.user_id = v_uid AND occupied.id <> v_placement.id
      AND x < occupied.grid_x + (bd.footprint->>'width')::integer
      AND x + 1 > occupied.grid_x
      AND z < occupied.grid_z + (bd.footprint->>'depth')::integer
      AND z + 1 > occupied.grid_z
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

  SELECT * INTO v_placement FROM public.building_placements bp
    WHERE bp.ownership_id = place_owned_building.ownership_id AND bp.user_id = v_uid
    FOR UPDATE;
  IF x + (v_definition.footprint->>'width')::integer - 1 > 12
     OR z + (v_definition.footprint->>'depth')::integer - 1 > 12 THEN
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
    WHERE occupied.user_id = v_uid AND occupied.id <> v_placement.id
      AND x < occupied.grid_x + (bd.footprint->>'width')::integer
      AND x + (v_definition.footprint->>'width')::integer > occupied.grid_x
      AND z < occupied.grid_z + (bd.footprint->>'depth')::integer
      AND z + (v_definition.footprint->>'depth')::integer > occupied.grid_z
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

CREATE OR REPLACE FUNCTION public.remove_building_placement(placement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_placement public.building_placements%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.building_placements bp
    WHERE bp.id = placement_id AND bp.user_id = v_uid
    RETURNING * INTO v_placement;

  RETURN jsonb_build_object(
    'removed', FOUND,
    'placementId', placement_id,
    'ownershipId', v_placement.ownership_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_activity_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.activity_sessions%rowtype;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.planet_has_access() THEN
    RAISE EXCEPTION 'Planet access has expired';
  END IF;

  INSERT INTO public.activity_sessions (
    user_id, started_at, last_claim_at, activity_day
  ) VALUES (v_uid, v_now, v_now, (v_now AT TIME ZONE 'UTC')::date)
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'sessionId', v_session.id,
    'startedAt', v_session.started_at,
    'nextNonce', v_session.next_nonce,
    'dailyEarned', v_session.daily_earned
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_activity_heartbeat(
  session_id uuid,
  nonce integer,
  activity_count integer,
  visible boolean,
  focused boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.activity_sessions%rowtype;
  v_config public.economy_config%rowtype;
  v_balance bigint;
  v_now timestamptz;
  v_today date;
  v_elapsed numeric;
  v_credited_seconds integer;
  v_gross bigint;
  v_award bigint;
  v_daily_used bigint;
  v_daily_remaining bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.planet_has_access() THEN
    RAISE EXCEPTION 'Planet access has expired';
  END IF;

  -- Serializes all of a user's claims so parallel sessions cannot bypass the daily cap.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 4102));

  SELECT * INTO v_session FROM public.activity_sessions s
    WHERE s.id = session_id AND s.user_id = v_uid
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity session not found';
  END IF;

  INSERT INTO public.coin_wallets (user_id) VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT cw.balance INTO v_balance FROM public.coin_wallets cw
    WHERE cw.user_id = v_uid FOR UPDATE;
  SELECT * INTO v_config FROM public.economy_config ec WHERE ec.singleton;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Economy config is missing';
  END IF;

  v_now := clock_timestamp();
  v_today := (v_now AT TIME ZONE 'UTC')::date;
  IF v_session.activity_day <> v_today THEN
    UPDATE public.activity_sessions s
      SET daily_earned = 0, activity_day = v_today
      WHERE s.id = v_session.id
      RETURNING * INTO v_session;
  END IF;

  SELECT COALESCE(sum(s.daily_earned), 0)::bigint INTO v_daily_used
    FROM public.activity_sessions s
    WHERE s.user_id = v_uid AND s.activity_day = v_today;
  v_daily_remaining := GREATEST(v_config.daily_activity_cap - v_daily_used, 0);

  -- A lost response can be retried safely: consumed nonces never credit again.
  IF nonce IS NOT NULL AND nonce > 0 AND nonce < v_session.next_nonce THEN
    RETURN jsonb_build_object(
      'balance', v_balance,
      'coins', 0,
      'creditedSeconds', 0,
      'retry', true,
      'nextNonce', v_session.next_nonce,
      'dailyEarned', v_daily_used,
      'dailyRemaining', v_daily_remaining
    );
  END IF;
  IF nonce IS NULL OR nonce <= 0 OR nonce <> v_session.next_nonce THEN
    RAISE EXCEPTION 'Nonce must exactly equal the next expected nonce';
  END IF;
  IF activity_count IS NULL OR activity_count <= 0 THEN
    RAISE EXCEPTION 'Recent client activity is required';
  END IF;
  IF visible IS NOT TRUE OR focused IS NOT TRUE THEN
    RAISE EXCEPTION 'An active visible, focused session is required';
  END IF;

  -- These signals provide abuse resistance, not proof of humanity.
  -- Elapsed time is measured exclusively between server timestamps.
  v_elapsed := EXTRACT(EPOCH FROM (v_now - v_session.last_claim_at));
  IF v_elapsed < 12 THEN
    RAISE EXCEPTION 'At least 12 seconds must elapse between claims';
  END IF;
  v_credited_seconds := LEAST(FLOOR(v_elapsed)::integer, 25);
  v_gross := (v_credited_seconds / v_config.active_interval_seconds)
             * v_config.active_coins;
  v_award := LEAST(v_gross, v_daily_remaining);

  UPDATE public.activity_sessions s
    SET last_claim_at = v_now,
        next_nonce = s.next_nonce + 1,
        daily_earned = s.daily_earned + v_award,
        activity_day = v_today
    WHERE s.id = v_session.id
    RETURNING * INTO v_session;

  IF v_award > 0 THEN
    INSERT INTO public.coin_transactions (
      user_id, amount, type, reason, source_key, idempotency_key
    ) VALUES (
      v_uid, v_award, 'activity', 'Active planet participation',
      'activity:' || v_session.id::text,
      'activity:' || v_session.id::text || ':' || nonce::text
    );

    UPDATE public.coin_wallets cw
      SET balance = cw.balance + v_award, updated_at = v_now
      WHERE cw.user_id = v_uid
      RETURNING cw.balance INTO v_balance;
  END IF;

  RETURN jsonb_build_object(
    'balance', v_balance,
    'coins', v_award,
    'creditedSeconds', v_credited_seconds,
    'retry', false,
    'nextNonce', v_session.next_nonce,
    'dailyEarned', v_daily_used + v_award,
    'dailyRemaining', v_daily_remaining - v_award
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reward_contribution(
  target_user uuid, kind text, source_key text, moderator_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_balance bigint;
  v_amount bigint;
  v_existing public.coin_transactions%rowtype;
  v_transaction public.coin_transactions%rowtype;
  v_idempotency_key text;
BEGIN
  IF v_admin IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.planet_admins pa WHERE pa.user_id = v_admin
  ) THEN
    RAISE EXCEPTION 'Planet admin access required';
  END IF;
  IF target_user IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;
  IF source_key IS NULL OR btrim(source_key) = '' THEN
    RAISE EXCEPTION 'Source key is required';
  END IF;

  v_amount := CASE kind
    WHEN 'evaluation' THEN 25
    WHEN 'comment' THEN 50
    WHEN 'revival' THEN 150
    WHEN 'postmortem' THEN 200
    WHEN 'challenge500' THEN 500
    WHEN 'challenge1000' THEN 1000
    ELSE NULL
  END;
  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Unsupported contribution kind';
  END IF;
  v_idempotency_key := 'contribution:' || source_key;

  INSERT INTO public.coin_wallets (user_id) VALUES (target_user)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT cw.balance INTO v_balance FROM public.coin_wallets cw
    WHERE cw.user_id = target_user FOR UPDATE;

  SELECT * INTO v_existing FROM public.coin_transactions ct
    WHERE ct.user_id = target_user AND ct.idempotency_key = v_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'balance', v_balance,
      'amount', v_existing.amount,
      'kind', kind,
      'sourceKey', source_key,
      'alreadyRewarded', true,
      'transactionId', v_existing.id
    );
  END IF;

  INSERT INTO public.coin_transactions (
    user_id, amount, type, reason, source_key, idempotency_key
  ) VALUES (
    target_user,
    v_amount,
    'contribution_reward',
    kind || CASE
      WHEN moderator_note IS NULL OR btrim(moderator_note) = '' THEN ''
      ELSE ': ' || moderator_note
    END,
    source_key,
    v_idempotency_key
  ) RETURNING * INTO v_transaction;

  UPDATE public.coin_wallets cw
    SET balance = cw.balance + v_amount, updated_at = now()
    WHERE cw.user_id = target_user
    RETURNING cw.balance INTO v_balance;

  RETURN jsonb_build_object(
    'balance', v_balance,
    'amount', v_amount,
    'kind', kind,
    'sourceKey', source_key,
    'alreadyRewarded', false,
    'transactionId', v_transaction.id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance bigint;
  v_recent jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT cw.balance INTO v_balance FROM public.coin_wallets cw WHERE cw.user_id = v_uid;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', recent.id,
    'amount', recent.amount,
    'type', recent.type,
    'reason', recent.reason,
    'sourceKey', recent.source_key,
    'createdAt', recent.created_at
  ) ORDER BY recent.created_at DESC), '[]'::jsonb)
  INTO v_recent
  FROM (
    SELECT ct.id, ct.amount, ct.type, ct.reason, ct.source_key, ct.created_at
    FROM public.coin_transactions ct
    WHERE ct.user_id = v_uid
    ORDER BY ct.created_at DESC
    LIMIT 20
  ) recent;

  RETURN jsonb_build_object(
    'balance', COALESCE(v_balance, 0),
    'recentTransactions', COALESCE(v_recent, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.planet_has_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.planet_access_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purchase_building(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.customize_building(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.place_free_building(text, integer, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.place_owned_building(uuid, integer, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_building_placement(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_activity_session() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_activity_heartbeat(uuid, integer, integer, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reward_contribution(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wallet_state() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.planet_access_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_building(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customize_building(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_free_building(text, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_owned_building(uuid, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_building_placement(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_activity_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_activity_heartbeat(uuid, integer, integer, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reward_contribution(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_state() TO authenticated;
