-- Reboot Planet hardening: backward-compatible fixes for the economy and project ownership.
-- Every change is CREATE OR REPLACE / additive. No balances, ownership, placements,
-- sessions, ideas or other user-generated rows are deleted, reset or rewritten.

-- ---------------------------------------------------------------------------
-- 1. One activity clock per user, shared by every session, tab and device.
--    The old per-session last_claim_at let parallel sessions multiply earnings.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.activity_rate_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_claim_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_rate_state ENABLE ROW LEVEL SECURITY;

-- No client policy and no client grant: this state is only touched by the RPC below.
REVOKE ALL ON public.activity_rate_state FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Purchases: an idempotency key must name the same building it paid for.
-- ---------------------------------------------------------------------------

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
    IF v_ownership.definition_id <> purchase_building.definition_id THEN
      RAISE EXCEPTION 'Idempotency key was already used for a different building';
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
    'definitionId', v_definition.id,
    'purchaseTransactionId', v_transaction.id,
    'customization', v_ownership.customization
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Placement overlap: `occupied.id <> NULL` is NULL, not true, so the whole
--    EXISTS collapsed on a first placement. Free and premium both fixed.
-- ---------------------------------------------------------------------------

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
    WHERE occupied.user_id = v_uid
      AND (v_placement.id IS NULL OR occupied.id <> v_placement.id)
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
    WHERE occupied.user_id = v_uid
      AND (v_placement.id IS NULL OR occupied.id <> v_placement.id)
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

-- ---------------------------------------------------------------------------
-- 4. Activity sessions are resumed instead of multiplied, and claims use the
--    shared per-user clock plus the configured interval instead of 12s/25s
--    constants and truncating integer division.
-- ---------------------------------------------------------------------------

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
  v_today date := (clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.planet_has_access() THEN
    RAISE EXCEPTION 'Planet access has expired';
  END IF;

  -- A second tab or a reload resumes the same session (and its nonce sequence).
  SELECT * INTO v_session FROM public.activity_sessions s
    WHERE s.user_id = v_uid
    ORDER BY s.started_at DESC
    LIMIT 1;
  IF FOUND THEN
    IF v_session.activity_day <> v_today THEN
      UPDATE public.activity_sessions s
        SET daily_earned = 0, activity_day = v_today
        WHERE s.id = v_session.id
        RETURNING * INTO v_session;
    END IF;
    RETURN jsonb_build_object(
      'sessionId', v_session.id,
      'startedAt', v_session.started_at,
      'nextNonce', v_session.next_nonce,
      'dailyEarned', v_session.daily_earned
    );
  END IF;

  INSERT INTO public.activity_sessions (
    user_id, started_at, last_claim_at, activity_day
  ) VALUES (v_uid, v_now, v_now, v_today)
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
  v_rate public.activity_rate_state%rowtype;
  v_balance bigint;
  v_now timestamptz;
  v_today date;
  v_last_claim timestamptz;
  v_elapsed numeric;
  v_min_seconds integer;
  v_max_seconds integer;
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

  -- One shared clock per user: no session can re-credit time another session used.
  INSERT INTO public.activity_rate_state (user_id, last_claim_at)
    VALUES (v_uid, v_session.last_claim_at)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_rate FROM public.activity_rate_state ars
    WHERE ars.user_id = v_uid FOR UPDATE;

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
  v_last_claim := GREATEST(v_rate.last_claim_at, v_session.last_claim_at);
  v_elapsed := EXTRACT(EPOCH FROM (v_now - v_last_claim));
  v_min_seconds := GREATEST(1, FLOOR(v_config.active_interval_seconds * 0.8)::integer);
  IF v_elapsed < v_min_seconds THEN
    RAISE EXCEPTION 'At least % seconds must elapse between claims', v_min_seconds;
  END IF;
  v_max_seconds := v_config.active_interval_seconds
    + GREATEST(5, CEIL(v_config.active_interval_seconds * 0.75)::integer);
  v_credited_seconds := LEAST(FLOOR(v_elapsed)::integer, v_max_seconds);
  v_gross := FLOOR(
    (v_credited_seconds::numeric / v_config.active_interval_seconds) * v_config.active_coins
  )::bigint;
  v_award := LEAST(v_gross, v_daily_remaining);

  UPDATE public.activity_sessions s
    SET last_claim_at = v_now,
        next_nonce = s.next_nonce + 1,
        daily_earned = s.daily_earned + v_award,
        activity_day = v_today
    WHERE s.id = v_session.id
    RETURNING * INTO v_session;

  UPDATE public.activity_rate_state ars
    SET last_claim_at = v_now
    WHERE ars.user_id = v_uid;

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

-- ---------------------------------------------------------------------------
-- 5. Contribution retries report the reward that actually exists, not the
--    caller's new kind. The source key alone still deduplicates.
-- ---------------------------------------------------------------------------

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
      'kind', split_part(v_existing.reason, ':', 1),
      'sourceKey', v_existing.source_key,
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

-- ---------------------------------------------------------------------------
-- 6. Project ownership and appearance are enforced in the database, not by the
--    permissive legacy ideas_update policy. Anonymous and non-owner counter
--    updates (upvotes, views, revival_count) keep working exactly as before.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_project_appearance(config jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF config IS NULL OR jsonb_typeof(config) <> 'object' THEN
    RAISE EXCEPTION 'Appearance config must be an object';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(config) k(key)
    WHERE k.key NOT IN ('color', 'height', 'style', 'glowIntensity')
  ) THEN
    RAISE EXCEPTION 'Unsupported appearance field';
  END IF;
  IF config ? 'color' AND (
    jsonb_typeof(config->'color') <> 'string'
    OR config->>'color' !~ '^#[0-9A-Fa-f]{6}$'
  ) THEN
    RAISE EXCEPTION 'Color must be a six-digit hex color';
  END IF;
  IF config ? 'height' AND (
    jsonb_typeof(config->'height') <> 'number'
    OR (config->>'height')::numeric < 0.5
    OR (config->>'height')::numeric > 2
  ) THEN
    RAISE EXCEPTION 'Height must be between 0.5 and 2';
  END IF;
  IF config ? 'style' AND (
    jsonb_typeof(config->'style') <> 'string'
    OR config->>'style' NOT IN ('standard', 'spire', 'pyramid', 'dome', 'crystal')
  ) THEN
    RAISE EXCEPTION 'Unsupported rooftop style';
  END IF;
  IF config ? 'glowIntensity' AND (
    jsonb_typeof(config->'glowIntensity') <> 'number'
    OR (config->>'glowIntensity')::numeric < 0.5
    OR (config->>'glowIntensity')::numeric > 4
  ) THEN
    RAISE EXCEPTION 'Glow intensity must be between 0.5 and 4';
  END IF;
END;
$$;

-- The guard trigger below runs as the invoking role on purpose, so the validator
-- must stay callable by client roles. It only inspects the JSON it is given.
REVOKE ALL ON FUNCTION public.validate_project_appearance(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_project_appearance(jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.ideas_guard_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  -- Migrations, the service role and SECURITY DEFINER RPCs stay unrestricted.
  v_privileged boolean := current_user IN ('postgres', 'service_role', 'supabase_admin');
  v_uid uuid;
  v_is_owner boolean;
BEGIN
  IF v_privileged THEN
    RETURN NEW;
  END IF;

  v_uid := auth.uid();

  IF TG_OP = 'INSERT' THEN
    -- A browser publishes as itself (or anonymously), never as someone else.
    NEW.user_id := v_uid;
    RETURN NEW;
  END IF;

  v_is_owner := v_uid IS NOT NULL AND OLD.user_id = v_uid;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Project ownership cannot be changed';
  END IF;

  IF NOT v_is_owner AND (
    (to_jsonb(NEW) - 'upvotes' - 'views' - 'revival_count')
      IS DISTINCT FROM (to_jsonb(OLD) - 'upvotes' - 'views' - 'revival_count')
  ) THEN
    RAISE EXCEPTION 'Only upvotes, views and revival_count can be updated on another project';
  END IF;

  IF NEW.building_customization IS NOT NULL
     AND NEW.building_customization IS DISTINCT FROM OLD.building_customization THEN
    PERFORM public.validate_project_appearance(NEW.building_customization);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ideas_guard_ownership_insert ON public.ideas;
CREATE TRIGGER ideas_guard_ownership_insert
  BEFORE INSERT ON public.ideas
  FOR EACH ROW EXECUTE FUNCTION public.ideas_guard_ownership();

DROP TRIGGER IF EXISTS ideas_guard_ownership_update ON public.ideas;
CREATE TRIGGER ideas_guard_ownership_update
  BEFORE UPDATE ON public.ideas
  FOR EACH ROW EXECUTE FUNCTION public.ideas_guard_ownership();

CREATE OR REPLACE FUNCTION public.customize_project_appearance(idea_id uuid, config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_saved jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  PERFORM public.validate_project_appearance(config);

  UPDATE public.ideas i
    SET building_customization = config
    WHERE i.id = idea_id AND i.user_id = v_uid
    RETURNING i.building_customization INTO v_saved;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project not found or not owned by this account';
  END IF;

  RETURN jsonb_build_object('buildingCustomization', v_saved);
END;
$$;
