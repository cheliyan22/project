-- Additive repairs to the legacy board and waitlist. Existing migrations remain
-- historical records. Public waitlist responses intentionally become receipts:
-- an unverified email address is not authority to read membership/referral data.
BEGIN;
LOCK TABLE public.feature_requests, public.feature_votes IN ACCESS EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.feature_request_stamp_author()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_uid uuid := auth.uid(); v_handle text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'A signed-in account is required to suggest a feature';
  END IF;
  SELECT nullif(btrim(username), '') INTO v_handle FROM public.profiles WHERE id = v_uid;
  NEW.author_id := v_uid;
  NEW.author_handle := coalesce(v_handle, 'builder');
  -- A newly submitted suggestion has no administrative decision or votes.
  NEW.status := 'reviewing';
  NEW.admin_note := '';
  NEW.duplicate_of := NULL;
  NEW.vote_count := 0;
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.status_at := now();
  RETURN NEW;
END $$;

-- Remove previously inferred email handles, preserving explicitly public names.
UPDATE public.feature_requests f SET author_handle = 'builder'
FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
WHERE f.author_id = u.id AND nullif(btrim(p.username), '') IS NULL
  AND f.author_handle = split_part(u.email, '@', 1);

CREATE OR REPLACE FUNCTION public.feature_vote_tally()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  -- UPDATE takes the parent row lock; concurrent deltas compose correctly even
  -- when the transaction's original snapshot predates another committed vote.
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feature_requests SET vote_count = vote_count + 1 WHERE id = NEW.request_id;
    RETURN NEW;
  END IF;
  UPDATE public.feature_requests SET vote_count = vote_count - 1 WHERE id = OLD.request_id;
  RETURN OLD;
END $$;
UPDATE public.feature_requests f SET vote_count =
  (SELECT count(*)::integer FROM public.feature_votes v WHERE v.request_id = f.id);
REVOKE ALL ON FUNCTION public.feature_request_stamp_author(), public.feature_vote_tally() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.join_beta_waitlist_referral(
  prospect_email text, referrer_code text DEFAULT NULL, signup_source text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_email text := lower(btrim(prospect_email));
  v_ref text := nullif(upper(btrim(coalesce(referrer_code, ''))), '');
  v_src text := nullif(lower(btrim(coalesce(signup_source, ''))), '');
BEGIN
  IF v_email IS NULL OR char_length(v_email) NOT BETWEEN 3 AND 254
    OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;
  IF v_ref IS NOT NULL AND v_ref !~ '^[0-9A-F]{8}$' THEN v_ref := NULL; END IF;
  IF v_src IS NOT NULL AND (char_length(v_src) > 64 OR v_src !~ '^[a-z0-9._-]+$') THEN v_src := NULL; END IF;
  INSERT INTO public.beta_waitlist(email,referrer_code,source,invite_code)
  VALUES(v_email,v_ref,v_src,public.beta_waitlist_new_code())
  ON CONFLICT(email) DO NOTHING;
  -- Identical response for first submission, retries, and someone else's email.
  RETURN jsonb_build_object('status','accepted');
END $$;

CREATE OR REPLACE FUNCTION public.join_beta_waitlist(prospect_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.join_beta_waitlist_referral(prospect_email, NULL, NULL);
  -- Compatibility keeps the boolean shape, but no longer reveals membership.
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.join_beta_waitlist(text), public.join_beta_waitlist_referral(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_beta_waitlist(text), public.join_beta_waitlist_referral(text,text,text) TO anon, authenticated;
COMMIT;
