-- Intentional contract change: archive browsing remains public; activity totals
-- now count distinct authenticated people, never browser-supplied totals.
-- Preserve unverifiable historical aggregates privately rather than display them
-- as verified engagement. A revival signal records an actual signed proposal.
CREATE SCHEMA IF NOT EXISTS reboot_private;
REVOKE ALL ON SCHEMA reboot_private FROM PUBLIC,anon,authenticated;
CREATE TABLE reboot_private.legacy_idea_counter_archive (
 idea_id uuid PRIMARY KEY, upvotes int NOT NULL, views int NOT NULL, revival_count int NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO reboot_private.legacy_idea_counter_archive(idea_id,upvotes,views,revival_count)
 SELECT id,upvotes,views,revival_count FROM public.ideas;
CREATE TABLE reboot_private.idea_signals (
 idea_id uuid NOT NULL REFERENCES public.ideas ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('support','view','revival')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(idea_id,user_id,kind)
);
CREATE INDEX idea_signals_account_time ON reboot_private.idea_signals(user_id,created_at);
REVOKE ALL ON reboot_private.idea_signals,reboot_private.legacy_idea_counter_archive FROM PUBLIC,anon,authenticated;
UPDATE public.ideas SET upvotes=0,views=0,revival_count=0;

-- Grants are column-specific for ALL clients, including the project's owner.
REVOKE INSERT,UPDATE ON public.ideas FROM PUBLIC,anon,authenticated;
DO $$ DECLARE col record; BEGIN
 FOR col IN SELECT attname FROM pg_attribute WHERE attrelid='public.ideas'::regclass AND attnum>0 AND NOT attisdropped LOOP
  EXECUTE format('REVOKE INSERT (%I),UPDATE (%I) ON public.ideas FROM PUBLIC,anon,authenticated',col.attname,col.attname);
  IF col.attname NOT IN ('upvotes','views','revival_count') THEN
   EXECUTE format('GRANT INSERT (%I),UPDATE (%I) ON public.ideas TO authenticated',col.attname,col.attname);
  END IF;
 END LOOP;
END $$;
DROP POLICY IF EXISTS ideas_update ON public.ideas;
CREATE POLICY ideas_update ON public.ideas FOR UPDATE TO authenticated
 USING(user_id=auth.uid() OR public.is_planet_admin())
 WITH CHECK(user_id=auth.uid() OR public.is_planet_admin());

-- Aggregate deltas run under the trusted function owner and atomically update
-- the idea row. Unique signal keys make retries and concurrent duplicates safe.
CREATE FUNCTION public.apply_idea_signal_delta() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,reboot_private AS $$
DECLARE signal record; delta int;
BEGIN
 IF TG_OP='DELETE' THEN signal:=OLD;delta:=-1;ELSE signal:=NEW;delta:=1;END IF;
 UPDATE public.ideas SET
  upvotes=upvotes+CASE WHEN signal.kind='support' THEN delta ELSE 0 END,
  views=views+CASE WHEN signal.kind='view' THEN delta ELSE 0 END,
  revival_count=revival_count+CASE WHEN signal.kind='revival' THEN delta ELSE 0 END
 WHERE id=signal.idea_id;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.apply_idea_signal_delta() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER idea_signal_totals AFTER INSERT OR DELETE ON reboot_private.idea_signals FOR EACH ROW EXECUTE FUNCTION public.apply_idea_signal_delta();

CREATE FUNCTION public.record_idea_signal(p_idea_id uuid,p_kind text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,reboot_private AS $$
DECLARE uid uuid:=auth.uid(); owner_id uuid; totals jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in to record project activity';END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('support','view') THEN RAISE EXCEPTION 'Unsupported signal';END IF;
 SELECT user_id INTO owner_id FROM public.ideas WHERE id=p_idea_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found';END IF;
 IF p_kind='support' AND owner_id=uid THEN RAISE EXCEPTION 'You cannot support your own project';END IF;
 PERFORM pg_advisory_xact_lock(hashtext(uid::text));
 IF NOT EXISTS(SELECT 1 FROM reboot_private.idea_signals WHERE idea_id=p_idea_id AND user_id=uid AND kind=p_kind) THEN
  IF (SELECT count(*) FROM reboot_private.idea_signals WHERE user_id=uid AND created_at>now()-interval '1 day')>=250 THEN RAISE EXCEPTION 'Daily activity limit reached';END IF;
  INSERT INTO reboot_private.idea_signals(idea_id,user_id,kind) VALUES(p_idea_id,uid,p_kind) ON CONFLICT DO NOTHING;
 END IF;
 SELECT jsonb_build_object('upvotes',upvotes,'views',views,'revival_count',revival_count,
  'supported',EXISTS(SELECT 1 FROM reboot_private.idea_signals WHERE idea_id=p_idea_id AND user_id=uid AND kind='support')) INTO totals FROM public.ideas WHERE id=p_idea_id;
 RETURN totals;
END $$;
REVOKE ALL ON FUNCTION public.record_idea_signal(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_idea_signal(uuid,text) TO authenticated;

CREATE FUNCTION public.record_revival_proposal_signal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,reboot_private AS $$
BEGIN
 IF NEW.user_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.ideas WHERE id=NEW.idea_id AND user_id IS DISTINCT FROM NEW.user_id) THEN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text));
  IF NOT EXISTS(SELECT 1 FROM reboot_private.idea_signals WHERE idea_id=NEW.idea_id AND user_id=NEW.user_id AND kind='revival') THEN
   IF (SELECT count(*) FROM reboot_private.idea_signals WHERE user_id=NEW.user_id AND created_at>now()-interval '1 day')>=250 THEN RAISE EXCEPTION 'Daily activity limit reached';END IF;
   INSERT INTO reboot_private.idea_signals(idea_id,user_id,kind) VALUES(NEW.idea_id,NEW.user_id,'revival') ON CONFLICT DO NOTHING;
  END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.record_revival_proposal_signal() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER revival_proposal_signal AFTER INSERT ON public.revivals FOR EACH ROW EXECUTE FUNCTION public.record_revival_proposal_signal();
-- Historical proposals with known authenticated authors are verifiable facts.
INSERT INTO reboot_private.idea_signals(idea_id,user_id,kind)
 SELECT DISTINCT r.idea_id,r.user_id,'revival' FROM public.revivals r JOIN public.ideas i ON i.id=r.idea_id
 WHERE r.user_id IS NOT NULL AND i.user_id IS DISTINCT FROM r.user_id ON CONFLICT DO NOTHING;
