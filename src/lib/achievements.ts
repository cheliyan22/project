import { supabase } from './supabase';

/* Achievement awards are a server decision (see the badge_achievements
 * migration): the browser only asks the server to look. A failure here must
 * never block the screen that asked, so every helper resolves to null. */

export interface AchievementResult {
  /** Slugs awarded by this call — empty when nothing new was earned. */
  earned: string[];
  badges: number;
  xp: number;
}

const BADGE_LABELS: Record<string, string> = {
  first_build: 'First Build',
  city_planner: 'City Planner',
  nexus_owner: 'Nexus Owner',
};

export function badgeLabel(slug: string): string {
  return BADGE_LABELS[slug] ?? slug.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function awardAchievements(): Promise<AchievementResult | null> {
  const { data, error } = await supabase.rpc('award_achievements');
  if (error || !data) return null;
  const payload = data as { earned?: unknown; badges?: unknown; xp?: unknown };
  return {
    earned: Array.isArray(payload.earned) ? payload.earned.filter((slug): slug is string => typeof slug === 'string') : [],
    badges: Number(payload.badges ?? 0),
    xp: Number(payload.xp ?? 0),
  };
}

/** "Badge unlocked: Nexus Owner" — used wherever the award happens inline. */
export function awardMessage(result: AchievementResult | null): string | null {
  if (!result || result.earned.length === 0) return null;
  const names = result.earned.map(badgeLabel);
  return names.length === 1 ? `Badge unlocked: ${names[0]}.` : `Badges unlocked: ${names.join(', ')}.`;
}
