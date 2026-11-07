-- Historical handle cleanup is deliberately narrow: metadata must lack a username
-- key and the profile must still equal the old email-derived default. Explicit
-- usernames (even equal to the email prefix) and uncertain cases are retained.
BEGIN;
UPDATE public.feature_requests f SET author_handle='builder'
FROM auth.users u JOIN public.profiles p ON p.id=u.id
WHERE f.author_id=u.id AND NOT (coalesce(u.raw_user_meta_data,'{}'::jsonb) ? 'username')
 AND p.username=split_part(u.email,'@',1) AND f.author_handle=p.username;
UPDATE public.profiles p SET username=NULL FROM auth.users u
WHERE p.id=u.id AND NOT (coalesce(u.raw_user_meta_data,'{}'::jsonb) ? 'username')
 AND p.username=split_part(u.email,'@',1);

CREATE SCHEMA IF NOT EXISTS reboot_private;
REVOKE ALL ON SCHEMA reboot_private FROM PUBLIC,anon,authenticated;
CREATE TABLE reboot_private.waitlist_request_buckets(minute timestamptz PRIMARY KEY,requests int NOT NULL);
CREATE TABLE reboot_private.verified_referral_claims(
 claimant uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
 registration uuid NOT NULL UNIQUE REFERENCES public.beta_waitlist ON DELETE CASCADE,
 referrer uuid NOT NULL REFERENCES public.beta_waitlist ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),CHECK(registration<>referrer)
);
REVOKE ALL ON reboot_private.waitlist_request_buckets,reboot_private.verified_referral_claims FROM PUBLIC,anon,authenticated;
CREATE INDEX verified_referral_referrer ON reboot_private.verified_referral_claims(referrer);
CREATE OR REPLACE FUNCTION public.join_beta_waitlist_referral(prospect_email text,referrer_code text DEFAULT NULL,signup_source text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,reboot_private AS $$
DECLARE v_email text:=lower(btrim(prospect_email));v_ref text:=nullif(upper(btrim(coalesce(referrer_code,''))),'');v_src text:=nullif(lower(btrim(coalesce(signup_source,''))),'');v_verified boolean;v_registration uuid;v_referrer uuid;v_requests int;
BEGIN
 IF v_email IS NULL OR length(v_email) NOT BETWEEN 3 AND 254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'A valid email address is required';END IF;
 -- No trustworthy anonymous source identity exists inside this RPC. Apply a
 -- transparent global ceiling rather than pretending an email identifies caller.
 PERFORM pg_advisory_xact_lock(hashtext('reboot_waitlist_global_quota'));
 DELETE FROM reboot_private.waitlist_request_buckets WHERE minute<date_trunc('minute',now())-interval '1 hour';
 INSERT INTO reboot_private.waitlist_request_buckets VALUES(date_trunc('minute',now()),1)
 ON CONFLICT(minute) DO UPDATE SET requests=reboot_private.waitlist_request_buckets.requests+1 RETURNING requests INTO v_requests;
 IF v_requests>60 THEN RAISE EXCEPTION 'Waitlist is busy; try again in a minute';END IF;
 v_verified:=EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL AND lower(btrim(email))=v_email);
 IF v_ref IS NOT NULL AND v_ref !~ '^[0-9A-F]{8}$' THEN v_ref:=NULL;END IF;
 IF v_src IS NOT NULL AND (length(v_src)>64 OR v_src !~ '^[a-z0-9._-]+$') THEN v_src:=NULL;END IF;
 INSERT INTO public.beta_waitlist(email,referrer_code,source,invite_code)
 VALUES(v_email,CASE WHEN v_verified THEN v_ref ELSE NULL END,v_src,public.beta_waitlist_new_code()) ON CONFLICT(email) DO NOTHING;
 SELECT id INTO v_registration FROM public.beta_waitlist WHERE email=v_email;
 IF v_verified AND v_ref IS NOT NULL THEN
  SELECT id INTO v_referrer FROM public.beta_waitlist WHERE invite_code=v_ref AND id<>v_registration;
  IF v_referrer IS NOT NULL THEN
   INSERT INTO reboot_private.verified_referral_claims(claimant,registration,referrer) VALUES(auth.uid(),v_registration,v_referrer) ON CONFLICT DO NOTHING;
  END IF;
 END IF;
 RETURN jsonb_build_object('status','accepted');
END $$;
CREATE OR REPLACE FUNCTION public.my_beta_waitlist_referral() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,reboot_private AS $$
DECLARE v_email text;v_row public.beta_waitlist%ROWTYPE;v_position bigint;v_referrals bigint;
BEGIN
 SELECT lower(btrim(email)) INTO v_email FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL;
 IF v_email IS NULL THEN RAISE EXCEPTION 'Sign in with a verified email to view your referral details';END IF;
 SELECT * INTO v_row FROM public.beta_waitlist WHERE email=v_email;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF v_row.invite_code IS NULL THEN
  UPDATE public.beta_waitlist SET invite_code=public.beta_waitlist_new_code() WHERE id=v_row.id AND invite_code IS NULL;
  SELECT * INTO v_row FROM public.beta_waitlist WHERE id=v_row.id;
 END IF;
 WITH verified AS (
  SELECT c.referrer,count(*) AS n FROM reboot_private.verified_referral_claims c
  JOIN public.beta_waitlist r ON r.id=c.registration JOIN auth.users u ON u.id=c.claimant
  WHERE u.email_confirmed_at IS NOT NULL AND lower(btrim(u.email))=r.email GROUP BY c.referrer
 ), scores AS (
  SELECT w.id,w.created_at-(interval '12 hours'*least(10,coalesce(v.n,0))) AS score FROM public.beta_waitlist w LEFT JOIN verified v ON v.referrer=w.id
 ) SELECT count(*)+1 INTO v_position FROM scores WHERE score<(SELECT score FROM scores WHERE id=v_row.id);
 SELECT count(*) INTO v_referrals FROM reboot_private.verified_referral_claims c JOIN public.beta_waitlist r ON r.id=c.registration JOIN auth.users u ON u.id=c.claimant
 WHERE c.referrer=v_row.id AND u.email_confirmed_at IS NOT NULL AND lower(btrim(u.email))=r.email;
 RETURN jsonb_build_object('inviteCode',v_row.invite_code,'position',v_position,'referrals',v_referrals,'boostHours',least(10,v_referrals)*12);
END $$;
REVOKE ALL ON FUNCTION public.join_beta_waitlist_referral(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_beta_waitlist_referral(text,text,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.my_beta_waitlist_referral() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_beta_waitlist_referral() TO authenticated;
COMMIT;
