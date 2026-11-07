-- Additive experimental beta domain. Legacy ideas/projects/planet_projects remain intact.
-- Apply ONLY to an isolated Supabase project. No sample accounts or engagement.
CREATE SCHEMA IF NOT EXISTS reboot_private;
REVOKE ALL ON SCHEMA reboot_private FROM PUBLIC, anon, authenticated;
CREATE TABLE public.beta_projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL CHECK(length(title) BETWEEN 3 AND 120),
 description text NOT NULL CHECK(length(description) BETWEEN 20 AND 5000),
 category text NOT NULL CHECK(category IN ('AI','Gaming','Education','Health','Creative','Space','Robotics','Community')),
 anonymous boolean NOT NULL DEFAULT false, founder text NOT NULL,
 status text NOT NULL DEFAULT 'abandoned' CHECK(status IN ('abandoned','discovered','under_revival','revived','completed')),
 requirements text NOT NULL DEFAULT '', url text NOT NULL DEFAULT '' CHECK(url='' OR url ~ '^https://[^[:space:]]+$'),
 hidden boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reboot_private.beta_owners(project_id uuid PRIMARY KEY REFERENCES public.beta_projects ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES auth.users);
CREATE TABLE reboot_private.beta_moderators(user_id uuid PRIMARY KEY REFERENCES auth.users);
CREATE TABLE reboot_private.beta_restrictions(user_id uuid PRIMARY KEY REFERENCES auth.users, reason text NOT NULL);
CREATE TABLE reboot_private.beta_actions(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON reboot_private.beta_actions(user_id,created_at);
CREATE TABLE public.beta_revivals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES public.beta_projects ON DELETE CASCADE,
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 5000), proposed_changes text NOT NULL CHECK(length(proposed_changes) BETWEEN 10 AND 5000),
 new_direction text NOT NULL CHECK(length(new_direction) BETWEEN 10 AND 5000), requirements text NOT NULL CHECK(length(requirements) BETWEEN 3 AND 5000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reboot_private.beta_contributors(revival_id uuid REFERENCES public.beta_revivals ON DELETE CASCADE,user_id uuid REFERENCES auth.users,PRIMARY KEY(revival_id,user_id));
CREATE TABLE reboot_private.beta_revival_authors(revival_id uuid PRIMARY KEY REFERENCES public.beta_revivals ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES auth.users);
CREATE TABLE public.beta_progress (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES public.beta_projects ON DELETE CASCADE,
 body text NOT NULL CHECK(length(body) BETWEEN 10 AND 5000), evidence_url text NOT NULL CHECK(evidence_url ~ '^https://[^[:space:]]+$' OR evidence_url ~ '^/api/beta/media/[a-f0-9-]{36}$'),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reboot_private.beta_progress_authors(progress_id uuid PRIMARY KEY REFERENCES public.beta_progress ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES auth.users);
CREATE TABLE public.beta_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES public.beta_projects ON DELETE CASCADE,
 from_status text NOT NULL,to_status text NOT NULL,reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.beta_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES public.beta_projects ON DELETE CASCADE,
 parent_id uuid REFERENCES public.beta_comments,body text NOT NULL CHECK(length(body) BETWEEN 3 AND 2000),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reboot_private.beta_comment_authors(comment_id uuid PRIMARY KEY REFERENCES public.beta_comments ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES auth.users);
CREATE TABLE reboot_private.beta_supports(project_id uuid REFERENCES public.beta_projects ON DELETE CASCADE,user_id uuid REFERENCES auth.users,PRIMARY KEY(project_id,user_id));
CREATE TABLE public.beta_nominations(project_id uuid PRIMARY KEY REFERENCES public.beta_projects ON DELETE CASCADE,reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE reboot_private.beta_reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid REFERENCES public.beta_projects ON DELETE CASCADE,user_id uuid REFERENCES auth.users,reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),resolved boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE reboot_private.beta_blocks(user_id uuid REFERENCES auth.users,blocked_user_id uuid REFERENCES auth.users,PRIMARY KEY(user_id,blocked_user_id),CHECK(user_id<>blocked_user_id));
CREATE TABLE reboot_private.beta_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users,project_id uuid REFERENCES public.beta_projects ON DELETE CASCADE,body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());

-- No client can directly insert/update/delete domain rows, even with permissive default grants.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['beta_projects','beta_revivals','beta_progress','beta_history','beta_comments','beta_nominations'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO anon,authenticated',t);
 END LOOP;
END $$;
CREATE POLICY beta_project_read ON public.beta_projects FOR SELECT TO anon,authenticated USING (NOT hidden);
CREATE POLICY beta_revival_read ON public.beta_revivals FOR SELECT TO anon,authenticated USING (EXISTS(SELECT 1 FROM public.beta_projects p WHERE p.id=project_id AND NOT p.hidden));
CREATE POLICY beta_progress_read ON public.beta_progress FOR SELECT TO anon,authenticated USING (EXISTS(SELECT 1 FROM public.beta_projects p WHERE p.id=project_id AND NOT p.hidden));
CREATE POLICY beta_history_read ON public.beta_history FOR SELECT TO anon,authenticated USING (EXISTS(SELECT 1 FROM public.beta_projects p WHERE p.id=project_id AND NOT p.hidden));
CREATE POLICY beta_comment_read ON public.beta_comments FOR SELECT TO anon,authenticated USING (EXISTS(SELECT 1 FROM public.beta_projects p WHERE p.id=project_id AND NOT p.hidden));
CREATE POLICY beta_nomination_read ON public.beta_nominations FOR SELECT TO anon,authenticated USING (EXISTS(SELECT 1 FROM public.beta_projects p WHERE p.id=project_id AND NOT p.hidden));
REVOKE ALL ON ALL TABLES IN SCHEMA reboot_private FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.beta_command(action text, payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public,reboot_private AS $$
DECLARE uid uuid:=auth.uid(); pid uuid; rid uuid; current_status text; next_status text; owner_id uuid; result_id uuid; is_mod boolean;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 -- Serialize a user's mutations so simultaneous requests cannot bypass quota.
 PERFORM pg_advisory_xact_lock(hashtext(uid::text));
 IF EXISTS(SELECT 1 FROM reboot_private.beta_restrictions WHERE user_id=uid) THEN RAISE EXCEPTION 'Account restricted'; END IF;
 IF (SELECT count(*) FROM reboot_private.beta_actions WHERE user_id=uid AND created_at>now()-interval '1 hour')>=30 THEN RAISE EXCEPTION 'Hourly write limit reached'; END IF;
 INSERT INTO reboot_private.beta_actions(user_id) VALUES(uid);
 is_mod:=EXISTS(SELECT 1 FROM reboot_private.beta_moderators WHERE user_id=uid);
 IF action='submit' THEN
  INSERT INTO public.beta_projects(title,description,category,anonymous,founder,requirements,url)
   VALUES(trim(payload->>'title'),trim(payload->>'description'),payload->>'category',coalesce((payload->>'anonymous')::boolean,false),
    CASE WHEN coalesce((payload->>'anonymous')::boolean,false) THEN 'Anonymous founder' ELSE left(coalesce(nullif(trim(payload->>'founder'),''),'Founder'),80) END,
    left(coalesce(payload->>'requirements',''),2000),coalesce(payload->>'url','')) RETURNING id INTO result_id;
  INSERT INTO reboot_private.beta_owners VALUES(result_id,uid);
  RETURN jsonb_build_object('id',result_id);
 END IF;
 pid:=(payload->>'projectId')::uuid;
 SELECT status INTO current_status FROM public.beta_projects WHERE id=pid AND (NOT hidden OR is_mod) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
 SELECT user_id INTO owner_id FROM reboot_private.beta_owners WHERE project_id=pid;
 IF action<>'unblock' AND NOT (is_mod AND action IN ('moderate','restrict')) AND EXISTS(SELECT 1 FROM reboot_private.beta_blocks WHERE (user_id=owner_id AND blocked_user_id=uid) OR (user_id=uid AND blocked_user_id=owner_id)) THEN RAISE EXCEPTION 'Interaction unavailable'; END IF;
 CASE action
 WHEN 'revival' THEN
  INSERT INTO public.beta_revivals(project_id,reason,proposed_changes,new_direction,requirements) VALUES(pid,trim(payload->>'reason'),trim(payload->>'proposedChanges'),trim(payload->>'newDirection'),trim(payload->>'requirements')) RETURNING id INTO result_id;
  INSERT INTO reboot_private.beta_contributors VALUES(result_id,uid);
  INSERT INTO reboot_private.beta_revival_authors VALUES(result_id,uid);
 WHEN 'invite' THEN
  rid:=(payload->>'revivalId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.beta_revivals r JOIN reboot_private.beta_contributors c ON c.revival_id=r.id WHERE r.id=rid AND r.project_id=pid AND c.user_id=uid) THEN RAISE EXCEPTION 'Contributor permission required'; END IF;
  INSERT INTO reboot_private.beta_contributors VALUES(rid,(payload->>'userId')::uuid) ON CONFLICT DO NOTHING;
 WHEN 'progress' THEN
  IF uid<>owner_id AND NOT EXISTS(SELECT 1 FROM public.beta_revivals r JOIN reboot_private.beta_contributors c ON c.revival_id=r.id WHERE r.project_id=pid AND c.user_id=uid) THEN RAISE EXCEPTION 'Contributor permission required'; END IF;
  INSERT INTO public.beta_progress(project_id,body,evidence_url) VALUES(pid,trim(payload->>'body'),payload->>'evidenceUrl') RETURNING id INTO result_id;
  INSERT INTO reboot_private.beta_progress_authors VALUES(result_id,uid);
 WHEN 'transition' THEN
  IF uid<>owner_id THEN RAISE EXCEPTION 'Owner permission required'; END IF;
  next_status:=payload->>'status';
  IF NOT ((current_status='abandoned' AND next_status='discovered') OR (current_status='discovered' AND next_status IN ('under_revival','abandoned')) OR (current_status='under_revival' AND next_status IN ('revived','abandoned')) OR (current_status='revived' AND next_status IN ('completed','abandoned')) OR (current_status='completed' AND next_status='abandoned')) THEN RAISE EXCEPTION 'Invalid transition'; END IF;
  IF next_status='under_revival' AND NOT EXISTS(SELECT 1 FROM public.beta_revivals WHERE project_id=pid) THEN RAISE EXCEPTION 'Revival plan required'; END IF;
  IF next_status IN ('revived','completed') AND NOT EXISTS(SELECT 1 FROM public.beta_progress WHERE project_id=pid) THEN RAISE EXCEPTION 'Evidence required'; END IF;
  INSERT INTO public.beta_history(project_id,from_status,to_status,reason) VALUES(pid,current_status,next_status,trim(payload->>'reason')) RETURNING id INTO result_id;
  UPDATE public.beta_projects SET status=next_status,updated_at=now() WHERE id=pid;
 WHEN 'comment' THEN
  IF payload->>'parentId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.beta_comments WHERE id=(payload->>'parentId')::uuid AND project_id=pid) THEN RAISE EXCEPTION 'Invalid reply'; END IF;
  INSERT INTO public.beta_comments(project_id,parent_id,body) VALUES(pid,(payload->>'parentId')::uuid,trim(payload->>'body')) RETURNING id INTO result_id;
  INSERT INTO reboot_private.beta_comment_authors VALUES(result_id,uid);
 WHEN 'support' THEN
  INSERT INTO reboot_private.beta_supports VALUES(pid,uid) ON CONFLICT DO NOTHING;
 WHEN 'unsupport' THEN
  DELETE FROM reboot_private.beta_supports WHERE project_id=pid AND user_id=uid;
 WHEN 'nominate' THEN
  INSERT INTO public.beta_nominations VALUES(pid,trim(payload->>'reason'),now()) ON CONFLICT DO NOTHING;
 WHEN 'report' THEN
  INSERT INTO reboot_private.beta_reports(project_id,user_id,reason) VALUES(pid,uid,trim(payload->>'reason')) RETURNING id INTO result_id;
 WHEN 'unblock' THEN
  DELETE FROM reboot_private.beta_blocks WHERE user_id=uid AND blocked_user_id=(payload->>'userId')::uuid;
 WHEN 'block' THEN
  INSERT INTO reboot_private.beta_blocks VALUES(uid,(payload->>'userId')::uuid) ON CONFLICT DO NOTHING;
 WHEN 'restrict' THEN
  IF NOT is_mod THEN RAISE EXCEPTION 'Moderator permission required'; END IF;
  INSERT INTO reboot_private.beta_restrictions VALUES((payload->>'userId')::uuid,left(trim(payload->>'reason'),2000)) ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason;
 WHEN 'moderate' THEN
  IF NOT is_mod THEN RAISE EXCEPTION 'Moderator permission required'; END IF;
  UPDATE public.beta_projects SET hidden=coalesce((payload->>'hidden')::boolean,true) WHERE id=pid;
  UPDATE reboot_private.beta_reports SET resolved=true WHERE project_id=pid;
 ELSE RAISE EXCEPTION 'Unknown action';
 END CASE;
 IF owner_id<>uid AND action IN ('revival','comment','progress') THEN INSERT INTO reboot_private.beta_notifications(user_id,project_id,body) VALUES(owner_id,pid,action); END IF;
 RETURN jsonb_build_object('id',result_id,'projectId',pid);
END $$;
REVOKE ALL ON FUNCTION public.beta_command(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.beta_command(text,jsonb) TO authenticated;

CREATE FUNCTION public.beta_inbox() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,reboot_private AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'projectId',project_id,'body',body,'createdAt',created_at)),'[]') FROM reboot_private.beta_notifications WHERE user_id=auth.uid();
$$;
REVOKE ALL ON FUNCTION public.beta_inbox() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.beta_inbox() TO authenticated;
CREATE FUNCTION public.beta_moderation_queue() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,reboot_private AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM reboot_private.beta_moderators WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'Moderator permission required'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM reboot_private.beta_reports r WHERE NOT resolved);
END $$;
REVOKE ALL ON FUNCTION public.beta_moderation_queue() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.beta_moderation_queue() TO authenticated;
CREATE FUNCTION public.beta_support_counts() RETURNS TABLE(project_id uuid,supports bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,reboot_private AS $$
 SELECT s.project_id,count(*) FROM reboot_private.beta_supports s JOIN public.beta_projects p ON p.id=s.project_id WHERE NOT p.hidden GROUP BY s.project_id;
$$;
REVOKE ALL ON FUNCTION public.beta_support_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.beta_support_counts() TO anon,authenticated;
