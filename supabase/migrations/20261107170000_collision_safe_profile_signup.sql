-- Preserve automatic profile creation without letting a public username collision
-- roll back authentication signup. NULL usernames are permitted by the original
-- schema. Newly omitted/blank handles no longer disclose an email local-part.
-- Existing account/profile rows are not rewritten.
BEGIN;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, CASE WHEN nullif(btrim(NEW.raw_user_meta_data->>'username'), '') IS NULL
    THEN NULL ELSE NEW.raw_user_meta_data->>'username' END)
  ON CONFLICT DO NOTHING;

  -- If the requested username was taken, still create the account's profile.
  -- If its id already exists, retain that row exactly as it was.
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, NULL)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
COMMIT;
