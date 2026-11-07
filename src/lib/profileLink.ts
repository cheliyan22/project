/* Public builder links. One function so a shared URL is always generated the
 * same way — the leaderboard, the flight deck share card and the profile page
 * itself all point at /u/<username>. */

export function profileUrl(username: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/u/${encodeURIComponent(username)}`;
}

export async function copyProfileLink(username: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(profileUrl(username));
    return true;
  } catch {
    return false;
  }
}
