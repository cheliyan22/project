export interface LandingStat {
  n: number;
  label: string;
  color: string;
}

/**
 * Turns raw counts into the landing-page stat strip, or into nothing at all.
 *
 * The rule this encodes: a number on the landing page is a public claim about
 * how many people used Reboot, so it may only come from something an account
 * actually did. Two filters carried inside `landing_signal_counts` keep that:
 *
 *   * an idea counts as real only when `user_id` is set. Every row from the
 *     original seed has `user_id = null` along with invented upvote / view /
 *     revival figures, so the seed can never inflate the archive total.
 *   * a revival signal is a `revivals` row, and the app only lets a signed-in
 *     account create one, so every row there is already an action by someone.
 *
 * Those counts come from a function rather than from two table reads because
 * `revivals` is not public: a row there names the account that sent it, so a
 * visitor may learn how many exist but may not list them. Reading it directly
 * answered 401 and the strip silently lost its second number forever.
 *
 * `builders` and `founder slots` were dropped rather than estimated: no table
 * tracks a founder capacity, and a builder count would be a head count of
 * accounts — neither number could be stated honestly.
 *
 * When the real counts are still zero, or either query failed, the result is an
 * empty array and the hero renders no strip. Showing nothing is the correct
 * output for "we do not know yet" — showing zero would read as a dead product
 * and showing anything else would be the fabricated social proof this file
 * exists to remove.
 */
export function buildLandingStats(
  authoredIdeas: number | null,
  revivalSignals: number | null,
): LandingStat[] {
  if (authoredIdeas === null || revivalSignals === null) return [];
  if (authoredIdeas <= 0) return [];

  const stats: LandingStat[] = [
    { n: authoredIdeas, label: 'IDEAS IN THE GRAVEYARD', color: '#FF00CC' },
  ];
  if (revivalSignals > 0) {
    stats.push({ n: revivalSignals, label: 'REVIVAL SIGNALS', color: '#00FF88' });
  }
  return stats;
}

/** Reads the two honest counts through the count-only RPC, so a signed-out visitor never
 *  needs row-level access to a table that names people. Any error means no proof. */
export async function fetchLandingStats(): Promise<LandingStat[]> {
  // Loaded inside the call so the counting rule above stays testable without a
  // configured Supabase client.
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase.rpc('landing_signal_counts');
  if (error) return [];

  // PostgREST returns a single-row set for a table function.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { authored_ideas: number | string; revival_signals: number | string }
    | undefined;
  if (!row) return [];

  const count = (value: number | string | null | undefined) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  return buildLandingStats(count(row.authored_ideas), count(row.revival_signals));
}
