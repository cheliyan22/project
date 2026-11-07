-- Additive beta upgrade: no account, project or history deletion.
CREATE TABLE IF NOT EXISTS public.beta_founders(id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,name text NOT NULL CHECK(length(name) BETWEEN 2 AND 80));
ALTER TABLE public.beta_founders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beta_founders FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.beta_founders TO anon,authenticated;
DROP POLICY IF EXISTS beta_founders_read ON public.beta_founders;
CREATE POLICY beta_founders_read ON public.beta_founders FOR SELECT TO anon,authenticated USING(true);
ALTER TABLE public.beta_revivals ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','succeeded','failed','withdrawn'));
ALTER TABLE public.beta_revivals ADD COLUMN IF NOT EXISTS result text NOT NULL DEFAULT '';
ALTER TABLE public.beta_revivals ADD COLUMN IF NOT EXISTS evidence_url text NOT NULL DEFAULT '';
ALTER TABLE public.beta_revivals ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS public.beta_revival_history(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),revival_id uuid NOT NULL REFERENCES public.beta_revivals ON DELETE CASCADE,
 project_id uuid NOT NULL REFERENCES public.beta_projects ON DELETE CASCADE,from_status text NOT NULL,to_status text NOT NULL,
 result text NOT NULL,evidence_url text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reboot_private.beta_outcome_actors(history_id uuid PRIMARY KEY REFERENCES public.beta_revival_history ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES auth.users);
ALTER TABLE public.beta_revival_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beta_revival_history,reboot_private.beta_outcome_actors FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.beta_revival_history TO anon,authenticated;
DROP POLICY IF EXISTS beta_outcome_read ON public.beta_revival_history;
CREATE POLICY beta_outcome_read ON public.beta_revival_history FOR SELECT TO anon,authenticated USING(EXISTS(SELECT 1 FROM public.beta_projects p WHERE p.id=project_id AND NOT p.hidden));
CREATE OR REPLACE FUNCTION public.beta_finish_revival(rid uuid,outcome text,final_result text,evidence text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,reboot_private AS $$
DECLARE uid uuid:=auth.uid(); attempt public.beta_revivals; owner_id uuid; hid uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required';END IF;
 PERFORM pg_advisory_xact_lock(hashtext(uid::text));
 IF EXISTS(SELECT 1 FROM reboot_private.beta_restrictions WHERE user_id=uid) THEN RAISE EXCEPTION 'Account restricted';END IF;
 IF (SELECT count(*) FROM reboot_private.beta_actions WHERE user_id=uid AND created_at>now()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'Hourly write limit reached';END IF;
 SELECT r.* INTO attempt FROM public.beta_revivals r JOIN public.beta_projects p ON p.id=r.project_id WHERE r.id=rid AND NOT p.hidden FOR UPDATE OF r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Revival not found';END IF;
 SELECT user_id INTO owner_id FROM reboot_private.beta_owners WHERE project_id=attempt.project_id;
 IF uid IS DISTINCT FROM owner_id AND NOT EXISTS(SELECT 1 FROM reboot_private.beta_contributors WHERE revival_id=rid AND user_id=uid) THEN RAISE EXCEPTION 'Contributor permission required';END IF;
 IF EXISTS(SELECT 1 FROM reboot_private.beta_blocks WHERE (user_id=owner_id AND blocked_user_id=uid) OR (user_id=uid AND blocked_user_id=owner_id)) THEN RAISE EXCEPTION 'Interaction unavailable';END IF;
 IF attempt.status<>'active' THEN RAISE EXCEPTION 'Outcome already recorded; start a new revival attempt';END IF;
 IF outcome IS NULL OR outcome NOT IN ('succeeded','failed','withdrawn') THEN RAISE EXCEPTION 'Invalid outcome';END IF;
 IF final_result IS NULL OR length(trim(final_result)) NOT BETWEEN 10 AND 5000 THEN RAISE EXCEPTION 'Describe the result in 10–5000 characters';END IF;
 IF outcome='succeeded' AND uid IS DISTINCT FROM owner_id THEN RAISE EXCEPTION 'Project owner must approve success';END IF;
 IF evidence IS NULL OR (evidence<>'' AND evidence !~ '^https://[^[:space:]]+$' AND evidence !~ '^/api/beta/media/[a-f0-9-]{36}$') THEN RAISE EXCEPTION 'Use an HTTPS evidence link';END IF;
 IF outcome='succeeded' AND evidence='' THEN RAISE EXCEPTION 'Success requires evidence';END IF;
 -- Local media must already be authorized project evidence; arbitrary file IDs are not proof.
 IF evidence LIKE '/api/%' AND NOT EXISTS(SELECT 1 FROM public.beta_progress WHERE project_id=attempt.project_id AND evidence_url=evidence) THEN RAISE EXCEPTION 'Attach media to this project progress first';END IF;
 INSERT INTO reboot_private.beta_actions(user_id) VALUES(uid);
 INSERT INTO public.beta_revival_history(revival_id,project_id,from_status,to_status,result,evidence_url) VALUES(rid,attempt.project_id,'active',outcome,trim(final_result),evidence) RETURNING id INTO hid;
 INSERT INTO reboot_private.beta_outcome_actors VALUES(hid,uid);
 UPDATE public.beta_revivals SET status=outcome,result=trim(final_result),evidence_url=evidence,updated_at=now() WHERE id=rid;
 RETURN jsonb_build_object('id',rid,'status',outcome);
END $$;
REVOKE ALL ON FUNCTION public.beta_finish_revival(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.beta_finish_revival(uuid,text,text,text) TO authenticated;

-- Every exposed collection and count excludes anonymous AND hidden projects,
-- including contributions by their owner: this prevents indirect deanonymization.
CREATE OR REPLACE FUNCTION public.beta_public_founder(founder_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,reboot_private AS $$
DECLARE display_name text; projects jsonb; attempts jsonb; contributions jsonb;
BEGIN
 SELECT name INTO display_name FROM public.beta_founders WHERE id=founder_id;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC),'[]') INTO projects FROM public.beta_projects p JOIN reboot_private.beta_owners o ON o.project_id=p.id WHERE o.user_id=founder_id AND NOT p.anonymous AND NOT p.hidden;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC),'[]') INTO attempts FROM public.beta_revivals r JOIN reboot_private.beta_revival_authors a ON a.revival_id=r.id JOIN public.beta_projects p ON p.id=r.project_id WHERE a.user_id=founder_id AND NOT p.anonymous AND NOT p.hidden;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC),'[]') INTO contributions FROM public.beta_progress e JOIN reboot_private.beta_progress_authors a ON a.progress_id=e.id JOIN public.beta_projects p ON p.id=e.project_id WHERE a.user_id=founder_id AND NOT p.anonymous AND NOT p.hidden;
 RETURN jsonb_build_object('id',founder_id,'name',display_name,'projects',projects,'revivals',attempts,'contributions',contributions);
END $$;
REVOKE ALL ON FUNCTION public.beta_public_founder(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.beta_public_founder(uuid) TO anon,authenticated;
