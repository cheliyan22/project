-- Repair legacy authorization without altering historical migrations or content.
-- NULL authorship does not grant content ownership. Ghost counters remain writable.
-- Profiles expose self-service identity fields; achievements and founder status are server-owned.

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

  v_is_owner := v_uid IS NOT NULL AND (coalesce(OLD.user_id = v_uid, false) OR public.is_planet_admin());

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

REVOKE INSERT, UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
-- Clear any pre-existing column grants as well as table grants before allowlisting.
DO $$ DECLARE field record; BEGIN
 FOR field IN SELECT attname FROM pg_attribute WHERE attrelid='public.profiles'::regclass AND attnum>0 AND NOT attisdropped LOOP
  EXECUTE format('REVOKE INSERT (%I), UPDATE (%I) ON public.profiles FROM PUBLIC, anon, authenticated',field.attname,field.attname);
 END LOOP;
END $$;
GRANT INSERT (id, username, avatar_url, bio, github_username) ON public.profiles TO authenticated;
GRANT UPDATE (username, avatar_url, bio, github_username) ON public.profiles TO authenticated;
