/* First-run state. One key, one meaning: this browser has already been shown the
 * introduction. Kept separate from the planet tutorial key so replaying the
 * flight school does not resurrect the intro, and vice versa. */

const INTRO_KEY = 'reboot-intro-v1';

export function hasSeenIntro(): boolean {
  try {
    return window.localStorage.getItem(INTRO_KEY) === 'seen';
  } catch {
    // Private mode or blocked storage: show it once per session rather than
    // throwing the visitor into an app they have never seen explained.
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    window.localStorage.setItem(INTRO_KEY, 'seen');
  } catch {
    /* storage unavailable — the intro simply appears again next time */
  }
}
