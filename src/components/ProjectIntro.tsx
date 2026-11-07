import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { PROFILES as CITIES, CITY_IDS as CITY_CATEGORIES } from '@/babylon/profiles';
import { BetaSignupForm } from './BetaSignupForm';
import './ProjectIntro.css';

/* First-run introduction. Four chapters, read at the visitor's own pace — there
 * is no auto-advance, because a timed carousel turns the one moment a player is
 * paying attention into something they have to chase. Everything here states
 * what the product actually does: the archive, the eleven districts, the status
 * lifecycle, and how building works. No countdowns, no invented numbers, no
 * slogans. It is skippable from the first frame and never shown twice.
 *
 * Visual language follows the orbital plate: gold hairlines, Georgia display
 * type, mono micro-labels, one teal accent. */

interface Chapter {
  kicker: string;
  title: [string, string];
  body: string;
  detail?: string;
}

const CHAPTERS: Chapter[] = [
  {
    kicker: 'THE ARCHIVE',
    title: ['Nothing ends.', 'It transforms.'],
    body: 'Reboot is an archive of abandoned projects. Every record keeps what was built, why it stopped, and what it would take to continue.',
    detail: 'Records are public. Owners keep control of their project.',
  },
  {
    kicker: 'ELEVEN DISTRICTS',
    title: ['Each district holds', 'one kind of unfinished.'],
    body: 'Ideas are filed by category, and every category is a city with its own architecture, weather and landmark.',
    detail: CITY_CATEGORIES.map((id) => CITIES[id].name.replace(' City', '')).join(' · '),
  },
  {
    kicker: 'REVIVAL',
    title: ['Abandoned, reviving,', 'alive.'],
    body: 'Signal a revival when you want to take something further. Publish a postmortem when it ends for good. The archive keeps both — a record that stops is still a record.',
    detail: 'Nothing is deleted for stopping. That is the point of the archive.',
  },
  {
    kicker: 'YOUR CITY',
    title: ['Build a corner', 'of the planet.'],
    body: 'Submit an idea, document its progress, or join a revival. Saved projects appear in the world and keep their history as they change.',
    detail: 'Explore without an account. Sign in to submit projects and contribute.',
  },
];

export default function ProjectIntro({ onFinish }: { onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const continueRef = useRef<HTMLButtonElement>(null);
  const chapter = CHAPTERS[index];
  const last = index === CHAPTERS.length - 1;

  const finish = useCallback(() => onFinish(), [onFinish]);
  const next = useCallback(() => {
    if (last) { finish(); return; }
    setIndex((current) => Math.min(CHAPTERS.length - 1, current + 1));
  }, [finish, last]);
  const back = useCallback(() => setIndex((current) => Math.max(0, current - 1)), []);

  useEffect(() => {
    continueRef.current?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(); return; }
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select'))) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); next(); return; }
      if (event.key === 'ArrowLeft') { event.preventDefault(); back(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish, next, back]);

  return (
    <div className="project-intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="pi-sky" aria-hidden>
        <span className="pi-orbit pi-orbit--outer" />
        <span className="pi-orbit pi-orbit--mid" />
        <span className="pi-orbit pi-orbit--inner" />
        <span className="pi-horizon" />
      </div>

      <header className="pi-rail">
        <p className="pi-brand"><span aria-hidden /> REBOOT / FIRST ENTRY</p>
        <div className="pi-rail-right">
          <p className="pi-count">CHAPTER {String(index + 1).padStart(2, '0')} / {String(CHAPTERS.length).padStart(2, '0')}</p>
          <button type="button" className="pi-skip" onClick={finish}>
            Skip intro <X size={13} aria-hidden />
          </button>
        </div>
      </header>

      <main className="pi-stage">
        <section className="pi-copy" key={chapter.kicker}>
          <p className="pi-kicker">{chapter.kicker}</p>
          <h1 id="intro-title">
            {chapter.title[0]}<br /><em>{chapter.title[1]}</em>
          </h1>
          <span className="pi-rule" aria-hidden />
          <p className="pi-body">{chapter.body}</p>
          {chapter.detail && <p className="pi-detail">{chapter.detail}</p>}
          {last && (
            <div className="pi-beta">
              <BetaSignupForm tone="intro" source="first-run-intro" />
            </div>
          )}
        </section>
      </main>

      <footer className="pi-foot">
        <nav className="pi-ticks" aria-label="Introduction chapters">
          {CHAPTERS.map((item, position) => (
            <button
              key={item.kicker}
              type="button"
              aria-label={`Chapter ${position + 1}: ${item.kicker}`}
              aria-current={position === index ? 'step' : undefined}
              data-active={position <= index}
              onClick={() => setIndex(position)}
            />
          ))}
        </nav>
        <div className="pi-actions">
          {index > 0 && (
            <button type="button" className="pi-back" onClick={back}>
              <ArrowLeft size={14} aria-hidden /> Back
            </button>
          )}
          <button ref={continueRef} type="button" className="pi-continue" onClick={next}>
            {last ? 'Enter Reboot' : 'Continue'} <ArrowRight size={15} aria-hidden />
          </button>
        </div>
      </footer>
    </div>
  );
}
