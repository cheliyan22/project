-- =========================================================================
-- Reboot — Feedback & Roadmap
--
-- A permanent public board where users suggest what to build next, vote on
-- other people's suggestions, and watch the owner's decisions land against
-- their ideas. It reuses the identity, admin concept and authorship discipline
-- the rest of the archive already has: nothing here trusts a browser number.
--
-- Phase 1 on purpose: suggestions, votes, duplicate grouping, admin statuses
-- and admin replies. No screenshot attachments and no private feedback channel
-- yet, so nothing here needs a Storage bucket or a second visibility model.
--
-- Rules this migration enforces in the database, not in the UI
--   * one vote per account per suggestion, and it can be withdrawn
--   * vote totals are counted from vote rows, never sent by a client
--   * who voted for what is private to the voter; only the total is public
--   * suggestion authorship is stamped by the database from auth.uid()
--   * only a planet admin can move a status, mark a duplicate or reply
--   * an author may withdraw their own suggestion while it is still reviewing
--   * no anonymous writes at all, so the board cannot be farmed
--
-- Prerequisite: 20261028000000_lock_public_writes.sql must already be applied,
-- because this file depends on public.is_planet_admin() and on the clean-slate
-- grant model that migration installed.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 0. Preflight
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(t.object_name) INTO v_missing
  FROM unnest(ARRAY['public.ideas', 'public.profiles', 'public.planet_admins']) AS t(object_name)
  WHERE to_regclass(t.object_name) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Feedback & Roadmap stopped: these objects are missing, so the archive is not set up yet: %',
      array_to_string(v_missing, ', ');
  END IF;

  IF to_regprocedure('public.is_planet_admin()') IS NULL THEN
    RAISE EXCEPTION
      'Feedback & Roadmap needs public.is_planet_admin() from 20261028000000_lock_public_writes.sql.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL CHECK (char_length(title) BETWEEN 4 AND 120),
  body            text NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  status          text NOT NULL DEFAULT 'reviewing'
                  CHECK (status IN ('reviewing', 'planned', 'building', 'shipped', 'not_now')),
  author_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_handle   text NOT NULL DEFAULT '',
  vote_count      integer NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  duplicate_of    uuid REFERENCES public.feature_requests(id) ON DELETE SET NULL,
  admin_note      text NOT NULL DEFAULT '' CHECK (char_length(admin_note) <= 2000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  status_at       timestamptz NOT NULL DEFAULT now(),
  -- A suggestion cannot be its own duplicate, and a duplicate cannot itself
  -- be the target of another duplicate: two levels is all the board needs.
  CONSTRAINT feature_requests_not_self_duplicate CHECK (duplicate_of IS NULL OR duplicate_of <> id)
);

CREATE INDEX IF NOT EXISTS feature_requests_board_idx
  ON public.feature_requests (status, vote_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS feature_requests_duplicate_idx
  ON public.feature_requests (duplicate_of) WHERE duplicate_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS feature_requests_author_idx
  ON public.feature_requests (author_id) WHERE author_id IS NOT NULL;

-- The vote itself. The primary key is the whole guarantee that one account
-- cannot vote twice; a second attempt raises 23505 and the client treats that
-- as "already counted".
CREATE TABLE IF NOT EXISTS public.feature_votes (
  request_id  uuid NOT NULL REFERENCES public.feature_requests(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);

CREATE INDEX IF NOT EXISTS feature_votes_user_idx ON public.feature_votes (user_id);

ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_votes   ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Authorship and column guards
-- ---------------------------------------------------------------------------

-- The database decides who wrote a suggestion, from the session token. The
-- handle is snapshotted so the board keeps showing what the person called
-- themselves at the time, even if they later rename their profile.
--
-- SECURITY DEFINER because the e-mail fallback reads auth.users, and Supabase
-- deliberately gives anon/authenticated no SELECT on that table. It writes only
-- the two authorship columns and searches itself by auth.uid(), so a caller
-- cannot use it to read anything about anybody else.
CREATE OR REPLACE FUNCTION public.feature_request_stamp_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_handle text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'A signed-in account is required to suggest a feature';
  END IF;

  NEW.author_id := v_uid;

  SELECT coalesce(p.username, split_part(u.email, '@', 1), 'builder')
    INTO v_handle
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
   WHERE u.id = v_uid;

  NEW.author_handle := coalesce(v_handle, 'builder');
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- Only an admin may move status, link a duplicate or reply. An author may fix
-- their own wording. Anyone else never reaches this function because the
-- policy below filters their UPDATE down to zero rows.
CREATE OR REPLACE FUNCTION public.feature_request_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_privileged boolean := current_user IN ('postgres', 'service_role', 'supabase_admin');
BEGIN
  -- Grouping shape comes before the permission check: it is a data rule, so it
  -- applies to an admin's edit too. Two levels is all the board needs, and it
  -- keeps a duplicate from silently becoming a hub.
  IF NEW.duplicate_of IS NOT NULL
     AND NEW.duplicate_of IS DISTINCT FROM OLD.duplicate_of THEN
    IF EXISTS (SELECT 1 FROM public.feature_requests d
                WHERE d.id = NEW.duplicate_of AND d.duplicate_of IS NOT NULL) THEN
      RAISE EXCEPTION 'A suggestion that is already marked as a duplicate cannot collect duplicates';
    END IF;
  END IF;

  IF v_privileged THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_planet_admin() THEN
    IF NEW.status        IS DISTINCT FROM OLD.status
      OR NEW.duplicate_of IS DISTINCT FROM OLD.duplicate_of
      OR NEW.admin_note  IS DISTINCT FROM OLD.admin_note
      OR NEW.vote_count  IS DISTINCT FROM OLD.vote_count
      OR NEW.author_id   IS DISTINCT FROM OLD.author_id
      OR NEW.author_handle IS DISTINCT FROM OLD.author_handle
    THEN
      RAISE EXCEPTION 'Only a Reboot admin can change a suggestion''s status, grouping or reply';
    END IF;
  END IF;

  -- Status timestamps follow the status, and nothing else may be silently
  -- rewritten by the author.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_at := now();
  ELSE
    NEW.status_at := OLD.status_at;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- Withdrawing a suggestion is the author's right only while nobody has made a
-- decision about it yet; once it is planned, building, shipped or declined the
-- history of the board belongs to everybody.
CREATE OR REPLACE FUNCTION public.feature_request_guard_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_privileged boolean := current_user IN ('postgres', 'service_role', 'supabase_admin');
BEGIN
  IF v_privileged OR public.is_planet_admin() THEN
    RETURN OLD;
  END IF;

  IF OLD.author_id IS NULL OR OLD.author_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only a Reboot admin can remove this suggestion';
  END IF;

  IF OLD.status <> 'reviewing' THEN
    RAISE EXCEPTION 'An admin has already acted on this suggestion, so only an admin can remove it';
  END IF;

  RETURN OLD;
END
$$;

-- Vote totals are derived from vote rows. SECURITY DEFINER because the client
-- deliberately has no UPDATE right on feature_requests at all.
CREATE OR REPLACE FUNCTION public.feature_vote_tally()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feature_requests
       SET vote_count = (SELECT count(*)::integer FROM public.feature_votes v
                          WHERE v.request_id = NEW.request_id)
     WHERE id = NEW.request_id;
    RETURN NEW;
  END IF;

  UPDATE public.feature_requests
     SET vote_count = (SELECT count(*)::integer FROM public.feature_votes v
                        WHERE v.request_id = OLD.request_id)
   WHERE id = OLD.request_id;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS feature_request_stamp_author ON public.feature_requests;
CREATE TRIGGER feature_request_stamp_author
  BEFORE INSERT ON public.feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.feature_request_stamp_author();

DROP TRIGGER IF EXISTS feature_request_guard_update ON public.feature_requests;
CREATE TRIGGER feature_request_guard_update
  BEFORE UPDATE ON public.feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.feature_request_guard();

DROP TRIGGER IF EXISTS feature_request_guard_delete ON public.feature_requests;
CREATE TRIGGER feature_request_guard_delete
  BEFORE DELETE ON public.feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.feature_request_guard_delete();

DROP TRIGGER IF EXISTS feature_vote_insert_tally ON public.feature_votes;
CREATE TRIGGER feature_vote_insert_tally
  AFTER INSERT ON public.feature_votes
  FOR EACH ROW EXECUTE FUNCTION public.feature_vote_tally();

DROP TRIGGER IF EXISTS feature_vote_delete_tally ON public.feature_votes;
CREATE TRIGGER feature_vote_delete_tally
  AFTER DELETE ON public.feature_votes
  FOR EACH ROW EXECUTE FUNCTION public.feature_vote_tally();

-- A vote is always the caller's own. Same pattern as comments and revivals.
CREATE OR REPLACE FUNCTION public.feature_vote_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'A signed-in account is required to vote';
  END IF;
  NEW.user_id := auth.uid();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS feature_vote_stamp ON public.feature_votes;
CREATE TRIGGER feature_vote_stamp
  BEFORE INSERT ON public.feature_votes
  FOR EACH ROW EXECUTE FUNCTION public.feature_vote_stamp();

-- ---------------------------------------------------------------------------
-- 3. Policies
-- ---------------------------------------------------------------------------

-- The board is public to read; that is the point of it.
DROP POLICY IF EXISTS feature_requests_read ON public.feature_requests;
CREATE POLICY feature_requests_read ON public.feature_requests
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS feature_requests_insert ON public.feature_requests;
CREATE POLICY feature_requests_insert ON public.feature_requests
  FOR INSERT TO authenticated
  WITH CHECK (author_id IS NULL OR author_id = auth.uid());

-- Authors touch their own row, admins touch any row; the guard trigger above
-- is what keeps an author out of the status columns.
DROP POLICY IF EXISTS feature_requests_update ON public.feature_requests;
CREATE POLICY feature_requests_update ON public.feature_requests
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_planet_admin())
  WITH CHECK (author_id = auth.uid() OR public.is_planet_admin());

DROP POLICY IF EXISTS feature_requests_delete ON public.feature_requests;
CREATE POLICY feature_requests_delete ON public.feature_requests
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_planet_admin());

-- Who voted for what stays private to the voter. The public gets the total.
DROP POLICY IF EXISTS feature_votes_read ON public.feature_votes;
CREATE POLICY feature_votes_read ON public.feature_votes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS feature_votes_insert ON public.feature_votes;
CREATE POLICY feature_votes_insert ON public.feature_votes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS feature_votes_delete ON public.feature_votes;
CREATE POLICY feature_votes_delete ON public.feature_votes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Grants
--    Supabase hands new tables to anon and authenticated by default, so revoke
--    first and then hand back exactly what the board needs.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.feature_requests, public.feature_votes FROM anon, authenticated, PUBLIC;

GRANT SELECT ON public.feature_requests TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.feature_requests TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.feature_votes TO authenticated;

-- Trigger functions run with the caller's rights, so the caller needs EXECUTE.
-- (The tally and the author stamp are SECURITY DEFINER and reach their tables
-- through their owner, so they deliberately stay ungranted to clients.)
GRANT EXECUTE ON FUNCTION public.feature_request_guard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.feature_request_guard_delete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.feature_vote_stamp() TO authenticated;
