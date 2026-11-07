-- Preserve founder membership and numbering. Stop for operator review if historical
-- data cannot satisfy the original first-100 contract; never silently revoke awards.
BEGIN;
LOCK TABLE public.profiles, public.founder_circle IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.founder_circle WHERE slot_number NOT BETWEEN 1 AND 100)
 OR EXISTS(SELECT 1 FROM public.founder_circle GROUP BY slot_number HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Founder slot repair stopped: duplicate or out-of-range historical slots require an explicit membership-preserving reconciliation before retry';
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS founder_circle_slot_unique ON public.founder_circle(slot_number);
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.founder_circle'::regclass AND conname='founder_circle_slot_range') THEN
  ALTER TABLE public.founder_circle ADD CONSTRAINT founder_circle_slot_range CHECK(slot_number BETWEEN 1 AND 100);
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.assign_founder_slot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE next_slot int;
BEGIN
 -- A transaction-scoped, dedicated namespace serializes the read/allocate pair.
 PERFORM pg_advisory_xact_lock(784433,100);
 IF EXISTS(SELECT 1 FROM public.founder_circle WHERE user_id=NEW.id) THEN RETURN NEW;END IF;
 SELECT coalesce(max(slot_number),0)+1 INTO next_slot FROM public.founder_circle;
 IF next_slot<=100 THEN
  INSERT INTO public.founder_circle(user_id,slot_number) VALUES(NEW.id,next_slot)
  ON CONFLICT DO NOTHING;
  IF FOUND THEN
   UPDATE public.profiles SET is_founder=true,title='Founding Member' WHERE id=NEW.id;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.assign_founder_slot() FROM PUBLIC,anon,authenticated;
COMMIT;
