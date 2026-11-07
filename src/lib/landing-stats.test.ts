// The landing strip is a public claim about how many people used Reboot, so its
// rule is encoded in one pure function and tested here: nothing appears until a
// real, account-authored count exists, and no metric is ever estimated.
import { describe, expect, it } from 'vitest';
import { buildLandingStats } from './landing-stats';

describe('buildLandingStats', () => {
  it('prints nothing while the archive has no authored ideas', () => {
    // This is today's live shape: 8 seed rows with user_id = null, 0 revivals.
    expect(buildLandingStats(0, 0)).toEqual([]);
  });

  it('prints nothing when a count could not be read', () => {
    // A failed or unreadable query is "no proof", never "zero" and never a guess.
    expect(buildLandingStats(null, 4)).toEqual([]);
    expect(buildLandingStats(4, null)).toEqual([]);
    expect(buildLandingStats(null, null)).toEqual([]);
  });

  it('shows the idea count on its own as soon as one account has posted', () => {
    const stats = buildLandingStats(1, 0);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ n: 1, label: 'IDEAS IN THE GRAVEYARD' });
  });

  it('adds revival signals only when someone actually signalled one', () => {
    const stats = buildLandingStats(3, 5);
    expect(stats.map(s => s.n)).toEqual([3, 5]);
    expect(stats[1].label).toBe('REVIVAL SIGNALS');
  });

  it('never reintroduces the invented builder or founder-slot metrics', () => {
    const labels = buildLandingStats(9999, 9999).map(s => s.label);
    expect(labels).not.toContain('BUILDERS');
    expect(labels).not.toContain('FOUNDER SLOTS');
    expect(labels).not.toContain('DEAD IDEAS');
    expect(labels).not.toContain('REVIVED');
  });

  it('reports the measured counts unchanged — no padding, no rounding up', () => {
    expect(buildLandingStats(12, 7).map(s => s.n)).toEqual([12, 7]);
  });
});
