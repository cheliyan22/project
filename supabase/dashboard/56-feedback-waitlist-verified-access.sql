-- Follow 20261107130000_feedback_waitlist_privacy.sql. Public submission remains
-- a uniform receipt. Private referral data requires the authenticated account's
-- server-verified email; caller-provided emails and user metadata are ignored.
BEGIN;
CREATE OR REPLACE FUNCTION public.feature_request_guard_created_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.created_at IS DISTINCT FROM OLD.created_at
    AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
    AND NOT public.is_planet_admin() THEN
    RAISE EXCEPTION 'Only a Reboot admin can change a suggestion creation timestamp';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS feature_request_guard_created_at ON public.feature_requests;
CREATE TRIGGER feature_request_guard_created_at BEFORE UPDATE ON public.feature_requests
FOR EACH ROW EXECUTE FUNCTION public.feature_request_guard_created_at();
REVOKE ALL ON FUNCTION public.feature_request_guard_created_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feature_request_guard_created_at() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_beta_waitlist_referral()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_email text;
  v_row public.beta_waitlist%ROWTYPE;
  v_position bigint;
  v_referrals bigint;
BEGIN
  SELECT lower(btrim(u.email)) INTO v_email FROM auth.users u
    WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Sign in with a verified email to view your referral details';
  END IF;
  SELECT * INTO v_row FROM public.beta_waitlist WHERE email = v_email;
  IF v_row.id IS NULL THEN RETURN NULL; END IF;
  IF v_row.invite_code IS NULL THEN
    UPDATE public.beta_waitlist SET invite_code = public.beta_waitlist_new_code()
      WHERE id = v_row.id AND invite_code IS NULL;
    SELECT * INTO v_row FROM public.beta_waitlist WHERE id = v_row.id;
  END IF;
  WITH scores AS (
    SELECT w.id, w.created_at - (interval '12 hours' * (
      SELECT count(*) FROM public.beta_waitlist r WHERE r.referrer_code = w.invite_code
    )) AS score FROM public.beta_waitlist w
  ) SELECT count(*) + 1 INTO v_position FROM scores s
    WHERE s.score < (SELECT score FROM scores WHERE id = v_row.id);
  SELECT count(*) INTO v_referrals FROM public.beta_waitlist WHERE referrer_code = v_row.invite_code;
  RETURN jsonb_build_object('inviteCode',v_row.invite_code,'position',v_position,'referrals',v_referrals);
END $$;
REVOKE ALL ON FUNCTION public.my_beta_waitlist_referral() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_beta_waitlist_referral() TO authenticated;
COMMIT;
