-- Reboot beta waitlist: referral + attribution plumbing.
-- Adds a per-row invite code, optional referrer/source capture, and a
-- join_beta_waitlist_referral(email, referrer_code, signup_source) function
-- that returns the caller's own status, code, boosted queue position (each
-- referral moves you up 12 hours) and referral count.
--
-- Data preservation: existing rows keep their email/created_at and are only
-- backfilled with invite codes. No table privileges are granted to any caller
-- role; every read still flows through SECURITY DEFINER functions with a
-- pinned search_path. Replaying this file must not destroy anything.

ALTER TABLE public.beta_waitlist
  ADD COLUMN IF NOT EXISTS invite_code text,
  ADD COLUMN IF NOT EXISTS referrer_code text,
  ADD COLUMN IF NOT EXISTS source text;

DO $$ BEGIN
  ALTER TABLE public.beta_waitlist ADD CONSTRAINT beta_waitlist_invite_code_shape
    CHECK (invite_code IS NULL OR invite_code ~ '^[0-9A-F]{8}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.beta_waitlist ADD CONSTRAINT beta_waitlist_referrer_code_shape
    CHECK (referrer_code IS NULL OR referrer_code ~ '^[0-9A-F]{8}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.beta_waitlist ADD CONSTRAINT beta_waitlist_source_shape
    CHECK (source IS NULL OR (char_length(source) <= 64 AND source ~ '^[a-z0-9._-]+$'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS beta_waitlist_invite_code_key
  ON public.beta_waitlist (invite_code) WHERE invite_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS beta_waitlist_referrer_code_idx
  ON public.beta_waitlist (referrer_code) WHERE referrer_code IS NOT NULL;

-- Internal allocator: uppercase hex avoids ambiguous glyphs and re-rolls on
-- the (astronomically rare) collision instead of failing the signup.
CREATE OR REPLACE FUNCTION public.beta_waitlist_new_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_code text;
  v_guard integer := 0;
BEGIN
  LOOP
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    IF NOT EXISTS (SELECT 1 FROM public.beta_waitlist WHERE invite_code = v_code) THEN
      RETURN v_code;
    END IF;
    v_guard := v_guard + 1;
    IF v_guard > 9 THEN
      RAISE EXCEPTION 'Could not allocate a waitlist invite code';
    END IF;
  END LOOP;
END;
$$;

-- Nobody calls the allocator directly; the join functions use it internally.
REVOKE ALL ON FUNCTION public.beta_waitlist_new_code() FROM PUBLIC, anon, authenticated;

-- Backfill already-registered builders so the very first invite links work.
DO $$
DECLARE v_row record;
BEGIN
  FOR v_row IN SELECT id FROM public.beta_waitlist WHERE invite_code IS NULL LOOP
    UPDATE public.beta_waitlist SET invite_code = public.beta_waitlist_new_code()
    WHERE id = v_row.id AND invite_code IS NULL;
  END LOOP;
END;
$$;

-- A distinct name, not an overload: PostgREST sends untyped parameters, and
-- two same-name candidates (one with defaults) resolve as "not unique".
-- The deployed one-argument join_beta_waitlist keeps its exact behaviour.
CREATE OR REPLACE FUNCTION public.join_beta_waitlist_referral(
  prospect_email text,
  referrer_code text DEFAULT NULL,
  signup_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email text := lower(btrim(prospect_email));
  v_ref text := nullif(upper(btrim(coalesce(referrer_code, ''))), '');
  v_src text := nullif(lower(btrim(coalesce(signup_source, ''))), '');
  v_row public.beta_waitlist%ROWTYPE;
  v_new boolean;
  v_position bigint;
  v_referrals bigint;
BEGIN
  IF v_email IS NULL
     OR char_length(v_email) NOT BETWEEN 3 AND 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;

  -- Malformed attribution degrades to "none" instead of rejecting the signup.
  IF v_ref IS NOT NULL AND v_ref !~ '^[0-9A-F]{8}$' THEN v_ref := NULL; END IF;
  IF v_src IS NOT NULL AND (char_length(v_src) > 64 OR v_src !~ '^[a-z0-9._-]+$') THEN v_src := NULL; END IF;

  INSERT INTO public.beta_waitlist (email, referrer_code, source, invite_code)
  VALUES (v_email, v_ref, v_src, public.beta_waitlist_new_code())
  ON CONFLICT (email) DO NOTHING
  RETURNING * INTO v_row;

  v_new := v_row.id IS NOT NULL;

  IF NOT v_new THEN
    SELECT * INTO v_row FROM public.beta_waitlist WHERE email = v_email;
    IF v_row.invite_code IS NULL THEN
      UPDATE public.beta_waitlist SET invite_code = public.beta_waitlist_new_code()
      WHERE id = v_row.id RETURNING invite_code INTO v_row.invite_code;
    END IF;
  END IF;

  -- Queue position with the invite boost: every builder who joined through
  -- your link moves your effective spot 12 hours toward the front. Ties share
  -- a rank. O(n log n) scans are fine at waitlist scale.
  WITH scores AS (
    SELECT w.id,
      w.created_at - (interval '12 hours' * (
        SELECT count(*) FROM public.beta_waitlist r WHERE r.referrer_code = w.invite_code
      )) AS score
    FROM public.beta_waitlist w
  )
  SELECT count(*) + 1 INTO v_position
    FROM scores s
    WHERE s.score < (SELECT score FROM scores WHERE id = v_row.id);
  SELECT count(*) INTO v_referrals
    FROM public.beta_waitlist w WHERE w.referrer_code = v_row.invite_code;

  RETURN jsonb_build_object(
    'status',    CASE WHEN v_new THEN 'registered' ELSE 'existing' END,
    'inviteCode', v_row.invite_code,
    'position',  v_position,
    'referrals', v_referrals,
    'referred',  v_new AND v_ref IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.join_beta_waitlist_referral(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_beta_waitlist_referral(text, text, text) TO anon, authenticated;
