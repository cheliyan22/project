-- Reboot landing-page proof, read as a count instead of as rows.
--
-- 20261028000000_lock_public_writes.sql gives `anon` SELECT on the archive tables it wants
-- browsed and keeps `revivals` for signed-in accounts only, because a revival row names the
-- account that sent it. The landing hero still has to answer one public question with real
-- numbers: has anyone actually done anything here yet? Rows are not what it needs, so rows
-- are not what this function gives it.
--
-- Two integers, computed as the table owner and returned as the only thing that leaves the
-- database. A visitor learns "3 ideas, 2 revival signals" and nothing about who is in there.
-- This is deliberately narrower than granting anon SELECT on revivals, which would publish
-- the user_id, the message and the contact fields of every revival in the archive.

CREATE OR REPLACE FUNCTION public.landing_signal_counts()
RETURNS TABLE (authored_ideas bigint, revival_signals bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    (SELECT count(*)::bigint FROM public.ideas WHERE user_id IS NOT NULL),
    (SELECT count(*)::bigint FROM public.revivals);
$$;

COMMENT ON FUNCTION public.landing_signal_counts() IS
  'Aggregate proof for the landing page: account-authored ideas and revival rows. Counts only; returns no row data.';

REVOKE ALL ON FUNCTION public.landing_signal_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.landing_signal_counts() TO anon, authenticated;
