-- =========================================================================
-- Reboot — public write lock-down
--
-- Why: the archive was built as a public demo. Every content table carried
-- INSERT/UPDATE policies open to `anon`, so any visitor with the publishable
-- anon key could rewrite any idea, edit any comment, wipe any project
-- timeline and read every revival e-mail. This migration closes that without
-- removing anything a real visitor needs.
--
-- What keeps working after this runs
--   * browsing the archive, story pages, leaderboards and the planet
--   * ghost (signed-out) upvotes, view counts and revival counters
--   * publishing, commenting and reviving for signed-in accounts
--
-- What stops
--   * any anonymous write except the three counter columns on `ideas`
--   * non-owners editing idea content, comments, timelines, bounties, capsules
--   * anonymous reading of revival proposals (they contain contact e-mail)
--   * writes to the unused first-generation tables (projects, project_tags,
--     revival_requests) and to the seeded lookup tables (tags, idea_tags,
--     badges, founder_circle, resurrections)
--
-- Backward compatible: no table or column is dropped, no row is deleted, and
-- existing content keeps its current visibility. Rows created before this
-- migration keep `user_id IS NULL` and stay readable; see
-- reboot-audit/APPLY-PLANET-VIA-DASHBOARD.md for the one-line statement that
-- hands a legacy idea to a real account.
--
-- Prerequisite: the planet migrations 20261025000000, 20261025010000 and
-- 20261026000000 must already be applied. The guard below refuses to run
-- otherwise so a partial sequence cannot leave the schema half-protected.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 0. Preflight
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(t.table_name) INTO v_missing
  FROM unnest(ARRAY[
    'ideas', 'comments', 'revivals', 'tags', 'idea_tags',
    'project_timeline', 'revival_bounty', 'time_capsule', 'resurrections',
    'profiles', 'user_badges', 'badges', 'founder_circle',
    'projects', 'project_tags', 'revival_requests',
    'planet_admins', 'economy_config', 'building_definitions',
    'coin_wallets', 'coin_transactions', 'building_ownership',
    'building_placements', 'activity_sessions'
  ]) AS t(table_name)
  WHERE to_regclass('public.' || t.table_name) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Public lock-down stopped: these Reboot tables are missing, so the earlier migrations are not applied yet: %',
      array_to_string(v_missing, ', ');
  END IF;

  SELECT array_agg(x.column_name) INTO v_missing
  FROM unnest(ARRAY['user_id', 'building_customization']) AS x(column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.ideas'::regclass
      AND a.attname = x.column_name
      AND a.attnum > 0 AND NOT a.attisdropped
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Public lock-down needs the planet migrations first. Missing ideas columns: %',
      array_to_string(v_missing, ', ');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. Shared helpers
-- ---------------------------------------------------------------------------

-- True when the calling account owns the idea. Used by the child-table
-- policies so a revival bounty or timeline row follows its project's owner.
CREATE OR REPLACE FUNCTION public.owns_idea(p_idea_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ideas i
    WHERE i.id = p_idea_id AND i.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.owns_idea(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_idea(uuid) TO anon, authenticated;

-- Planet administrators can repair content the archive no longer lets anyone
-- else touch. SECURITY DEFINER keeps `planet_admins` unreadable from clients.
CREATE OR REPLACE FUNCTION public.is_planet_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.planet_admins pa WHERE pa.user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.is_planet_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_planet_admin() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Authorship columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS comments_user_idx ON public.comments(user_id);

ALTER TABLE public.revivals
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS revivals_user_idx ON public.revivals(user_id);

-- ---------------------------------------------------------------------------
-- 3. Authorship is stamped by the database, never taken from the browser
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stamp_comment_authorship()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  NEW.user_id := auth.uid();
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'A signed-in account is required to comment';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.stamp_revival_authorship()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  NEW.user_id := auth.uid();
  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'A signed-in account is required to signal a revival';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_stamp_authorship ON public.comments;
CREATE TRIGGER comments_stamp_authorship
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_comment_authorship();

DROP TRIGGER IF EXISTS revivals_stamp_authorship ON public.revivals;
CREATE TRIGGER revivals_stamp_authorship
  BEFORE INSERT ON public.revivals
  FOR EACH ROW EXECUTE FUNCTION public.stamp_revival_authorship();

-- ---------------------------------------------------------------------------
-- 4. The ideas guard is re-asserted here on purpose.
--    RLS cannot compare a row's old and new values, so "non-owners may only
--    move counters" has to live in a trigger. Re-declaring it makes this
--    migration self-contained even if the hardening file was applied out of
--    order, and it stays byte-identical to 20261026000000.
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

REVOKE ALL ON FUNCTION public.validate_project_appearance(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_project_appearance(jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.ideas_guard_ownership()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_privileged boolean := current_user IN ('postgres', 'service_role', 'supabase_admin');
  v_uid uuid;
  v_is_owner boolean;
BEGIN
  IF v_privileged THEN
    RETURN NEW;
  END IF;

  v_uid := auth.uid();

  IF TG_OP = 'INSERT' THEN
    NEW.user_id := v_uid;
    RETURN NEW;
  END IF;

  v_is_owner := v_uid IS NOT NULL AND (OLD.user_id = v_uid OR public.is_planet_admin());

  IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NOT public.is_planet_admin() THEN
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

-- ---------------------------------------------------------------------------
-- 5. Policies — one deliberate, narrow write path per table
-- ---------------------------------------------------------------------------

-- ideas: publishing is an account action. Anonymous counter updates stay
-- allowed at the policy level and are fenced by column privileges (step 6)
-- plus the trigger above.
DROP POLICY IF EXISTS "ideas_insert" ON public.ideas;
CREATE POLICY ideas_insert ON public.ideas
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid() OR public.is_planet_admin());

DROP POLICY IF EXISTS "ideas_update" ON public.ideas;
CREATE POLICY ideas_update ON public.ideas
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- There is deliberately no ideas DELETE policy for client roles.
DROP POLICY IF EXISTS "ideas_delete" ON public.ideas;

-- comments: readable by everyone, writable only by the account that wrote it.
DROP POLICY IF EXISTS "comments_insert" ON public.comments;
CREATE POLICY comments_insert ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "comments_update" ON public.comments;
CREATE POLICY comments_update ON public.comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_planet_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_planet_admin());

DROP POLICY IF EXISTS "comments_delete" ON public.comments;
CREATE POLICY comments_delete ON public.comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_planet_admin());

-- revivals carry contact e-mail: the proposal is visible to the person who
-- sent it and to the founder of the project it is about, and to nobody else.
DROP POLICY IF EXISTS "revivals_select" ON public.revivals;
CREATE POLICY revivals_read ON public.revivals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.owns_idea(idea_id) OR public.is_planet_admin());

DROP POLICY IF EXISTS "revivals_insert" ON public.revivals;
CREATE POLICY revivals_insert ON public.revivals
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "revivals_update" ON public.revivals;
CREATE POLICY revivals_update ON public.revivals
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_planet_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_planet_admin());

DROP POLICY IF EXISTS "revivals_delete" ON public.revivals;
CREATE POLICY revivals_delete ON public.revivals
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_planet_admin());

-- Story attachments follow the owner of the project they belong to.
DROP POLICY IF EXISTS "tl_insert" ON public.project_timeline;
CREATE POLICY tl_insert ON public.project_timeline
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_idea(idea_id) OR public.is_planet_admin());

DROP POLICY IF EXISTS "tl_update" ON public.project_timeline;
CREATE POLICY tl_update ON public.project_timeline
  FOR UPDATE TO authenticated
  USING (public.owns_idea(idea_id) OR public.is_planet_admin())
  WITH CHECK (public.owns_idea(idea_id) OR public.is_planet_admin());

DROP POLICY IF EXISTS "tl_delete" ON public.project_timeline;
CREATE POLICY tl_delete ON public.project_timeline
  FOR DELETE TO authenticated
  USING (public.owns_idea(idea_id) OR public.is_planet_admin());

DROP POLICY IF EXISTS "rb_insert" ON public.revival_bounty;
CREATE POLICY rb_insert ON public.revival_bounty
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_idea(idea_id) OR public.is_planet_admin());

DROP POLICY IF EXISTS "rb_update" ON public.revival_bounty;
CREATE POLICY rb_update ON public.revival_bounty
  FOR UPDATE TO authenticated
  USING (public.owns_idea(idea_id) OR public.is_planet_admin())
  WITH CHECK (public.owns_idea(idea_id) OR public.is_planet_admin());

DROP POLICY IF EXISTS "rb_delete" ON public.revival_bounty;
CREATE POLICY rb_delete ON public.revival_bounty
  FOR DELETE TO authenticated
  USING (public.owns_idea(idea_id) OR public.is_planet_admin());

DROP POLICY IF EXISTS "tc_insert" ON public.time_capsule;
CREATE POLICY tc_insert ON public.time_capsule
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_idea(idea_id) OR public.is_planet_admin());

DROP POLICY IF EXISTS "tc_update" ON public.time_capsule;
CREATE POLICY tc_update ON public.time_capsule
  FOR UPDATE TO authenticated
  USING (public.owns_idea(idea_id) OR public.is_planet_admin())
  WITH CHECK (public.owns_idea(idea_id) OR public.is_planet_admin());

DROP POLICY IF EXISTS "tc_delete" ON public.time_capsule;
CREATE POLICY tc_delete ON public.time_capsule
  FOR DELETE TO authenticated
  USING (public.owns_idea(idea_id) OR public.is_planet_admin());

-- Seeded or platform-managed content: browsers read it, they never write it.
DROP POLICY IF EXISTS "tags_insert" ON public.tags;
DROP POLICY IF EXISTS "tags_update" ON public.tags;
DROP POLICY IF EXISTS "tags_delete" ON public.tags;
DROP POLICY IF EXISTS "idea_tags_insert" ON public.idea_tags;
DROP POLICY IF EXISTS "idea_tags_update" ON public.idea_tags;
DROP POLICY IF EXISTS "idea_tags_delete" ON public.idea_tags;
DROP POLICY IF EXISTS "res_insert" ON public.resurrections;
DROP POLICY IF EXISTS "res_update" ON public.resurrections;
DROP POLICY IF EXISTS "res_delete" ON public.resurrections;
DROP POLICY IF EXISTS "badges_insert" ON public.badges;
DROP POLICY IF EXISTS "badges_update" ON public.badges;
DROP POLICY IF EXISTS "badges_delete" ON public.badges;
DROP POLICY IF EXISTS "founder_circle_insert" ON public.founder_circle;
DROP POLICY IF EXISTS "founder_circle_update" ON public.founder_circle;
DROP POLICY IF EXISTS "founder_circle_delete" ON public.founder_circle;
DROP POLICY IF EXISTS "user_badges_delete" ON public.user_badges;

-- profiles stay self-service; nobody signs up as somebody else.
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- First-generation tables are not used by the app any more. Their rows are
-- kept, their write paths are closed.
DROP POLICY IF EXISTS "projects_insert" ON public.projects;
DROP POLICY IF EXISTS "projects_update" ON public.projects;
DROP POLICY IF EXISTS "projects_delete" ON public.projects;
DROP POLICY IF EXISTS "project_tags_insert" ON public.project_tags;
DROP POLICY IF EXISTS "project_tags_update" ON public.project_tags;
DROP POLICY IF EXISTS "project_tags_delete" ON public.project_tags;
DROP POLICY IF EXISTS "revival_requests_insert" ON public.revival_requests;
DROP POLICY IF EXISTS "revival_requests_update" ON public.revival_requests;
DROP POLICY IF EXISTS "revival_requests_delete" ON public.revival_requests;

-- ---------------------------------------------------------------------------
-- 6. Grants — RLS decides which row, privileges decide which column.
--    Starting from a clean slate means a table added later cannot silently
--    inherit Supabase's default PUBLIC write grant.
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Public read: the archive is meant to be browsed.
GRANT SELECT ON public.ideas, public.tags, public.idea_tags, public.comments,
                  public.project_timeline, public.revival_bounty, public.time_capsule,
                  public.resurrections, public.badges, public.user_badges,
                  public.founder_circle, public.profiles
  TO anon, authenticated;

-- Revival proposals are the one table that is not public (contact e-mail).
GRANT SELECT ON public.revivals TO authenticated;

-- Anonymous visitors may only move the three counters. Column-level rights
-- make an attempt to write a title or description fail before the trigger
-- even runs.
GRANT UPDATE (upvotes, views, revival_count) ON public.ideas TO anon;

-- Account holders write their own content; the policies above scope the rows.
GRANT INSERT, UPDATE ON public.ideas TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.revivals TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.project_timeline TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.revival_bounty TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.time_capsule TO authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;

-- The planet economy surface keeps exactly what 20261025000000 intended:
-- public catalogue reads and owner-scoped wallet reads through RPCs only.
GRANT SELECT ON public.economy_config, public.building_definitions TO anon, authenticated;
GRANT SELECT ON public.coin_wallets, public.coin_transactions,
                  public.building_ownership, public.building_placements,
                  public.activity_sessions TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Function surface: only the RPCs the client actually calls stay executable
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.owns_idea(uuid), public.is_planet_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stamp_comment_authorship(),
                public.stamp_revival_authorship(),
                public.ideas_guard_ownership() FROM PUBLIC;
