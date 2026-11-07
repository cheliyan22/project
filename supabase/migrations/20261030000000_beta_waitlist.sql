-- Reboot beta pre-registration
-- Public callers may save one normalized email through the RPC below. They
-- receive no table privileges, so the waitlist cannot be read or enumerated.

CREATE TABLE IF NOT EXISTS public.beta_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beta_waitlist_email_shape CHECK (
    char_length(email) BETWEEN 3 AND 254
    AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  CONSTRAINT beta_waitlist_email_normalized CHECK (email = lower(btrim(email)))
);

ALTER TABLE public.beta_waitlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.beta_waitlist FROM PUBLIC, anon, authenticated;

-- true = a new row was saved; false = this email was already registered.
-- The unique constraint and ON CONFLICT make retries and double-clicks safe.
CREATE OR REPLACE FUNCTION public.join_beta_waitlist(prospect_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email text := lower(btrim(prospect_email));
  v_id uuid;
BEGIN
  IF v_email IS NULL
     OR char_length(v_email) NOT BETWEEN 3 AND 254
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'A valid email address is required';
  END IF;

  INSERT INTO public.beta_waitlist (email)
  VALUES (v_email)
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.join_beta_waitlist(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_beta_waitlist(text) TO anon, authenticated;
