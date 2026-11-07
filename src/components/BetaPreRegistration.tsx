import { VerifiedWaitlistDetails } from './VerifiedWaitlistDetails';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Loader2, Play } from 'lucide-react';
import { joinBetaWaitlist, validateEmail, type BetaRegistration } from '../lib/beta-waitlist';
import './BetaPreRegistration.css';

type FormState =
  | { status: 'idle' | 'submitting' }
  | { status: 'error'; message: string }
  | { status: 'saved'; result: BetaRegistration };

// Drifting starfield with the occasional shooting star. Pure canvas, pauses
// when the tab is hidden, and never starts for reduced-motion visitors.
function BetaStarfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0, h = 0, raf = 0;
    type Star = { x: number; y: number; r: number; tw: number; sp: number; hue: string };
    let stars: Star[] = [];
    type Shooter = { x: number; y: number; vx: number; vy: number; life: number };
    let shooters: Shooter[] = [];
    const palette = ['rgba(210,235,235,', 'rgba(235,220,185,', 'rgba(160,200,205,'];
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.max(1, w * dpr); canvas.height = Math.max(1, h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(240, Math.floor(w * h / 8200));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 1.3 + .25,
        tw: Math.random() * Math.PI * 2,
        sp: .004 + Math.random() * .02,
        hue: palette[Math.floor(Math.random() * palette.length)],
      }));
    };
    resize();
    window.addEventListener('resize', resize);
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(50, now - last); last = now;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        s.tw += s.sp * dt; s.y += .0045 * dt * (s.r + .3);
        if (s.y > h + 2) { s.y = -2; s.x = Math.random() * w; }
        const a = .16 + Math.abs(Math.sin(s.tw)) * .55;
        ctx.fillStyle = `${s.hue}${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      if (Math.random() < .0016 * dt / 16) {
        shooters.push({ x: Math.random() * w * .7, y: Math.random() * h * .35, vx: .32, vy: .12, life: 1 });
      }
      shooters = shooters.filter(sh => sh.life > 0);
      for (const sh of shooters) {
        sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.life -= dt / 700;
        const g = ctx.createLinearGradient(sh.x, sh.y, sh.x - 90, sh.y - 34);
        g.addColorStop(0, `rgba(235,225,200,${(.7 * sh.life).toFixed(3)})`);
        g.addColorStop(1, 'rgba(235,225,200,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(sh.x - 90, sh.y - 34); ctx.stroke();
      }
      raf = requestAnimationFrame(frame);
    };
    const start = () => { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(frame); };
    const stop = () => cancelAnimationFrame(raf);
    const onVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);
  return <canvas ref={ref} className="beta-stars" aria-hidden="true" />;
}

export default function BetaPreRegistration() {
  const [email, setEmail] = useState('');
  const [form, setForm] = useState<FormState>({ status: 'idle' });

  useEffect(() => {
    const previous = document.title;
    document.title = 'Reboot Beta — Your next build starts here';
    return () => { document.title = previous; };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || form.status === 'submitting') return;
    // Name the typo instead of replacing it with a generic failure.
    const invalid = validateEmail(email);
    if (invalid) { setForm({ status: 'error', message: invalid }); return; }
    setForm({ status: 'submitting' });
    try {
      const result = await joinBetaWaitlist(email);
      setForm({ status: 'saved', result });
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : '';
      setForm({
        status: 'error',
        message: /valid email/i.test(text)
          ? 'That email address was rejected. Check it and try again.'
          : 'We couldn’t confirm your registration. Please try again—retrying the same email is safe.',
      });
    }
  };

  const submitting = form.status === 'submitting';

  return (
    <main className="beta-page">
      <BetaStarfield />
      <div className="beta-grid" aria-hidden="true" />
      <div className="beta-aurora" aria-hidden="true"><span /><span /><span /></div>
      <div className="beta-orbit beta-orbit-one" aria-hidden="true"><i className="beta-satellite" /></div>
      <div className="beta-orbit beta-orbit-two" aria-hidden="true" />
      <div className="beta-scan" aria-hidden="true" />

      <header className="beta-header">
        <a className="beta-brand" href="/" aria-label="Reboot home">
          <span className="beta-brand-mark">R</span>
          <span>REBOOT<small>SECOND DAWN</small></span>
        </a>
        <a className="beta-header-link" href="/">
          Live website <ArrowUpRight size={15} />
        </a>
      </header>

      <section className="beta-hero" aria-labelledby="beta-title">
        <div className="beta-copy">
          <p className="beta-eyebrow"><span /> BETA PRE-REGISTRATION</p>
          <h1 id="beta-title">Your next build<br /><em>starts here.</em></h1>
          <p className="beta-intro">
            A living archive for unfinished ideas. Explore the orbital planet,
            walk through its cities, and find a project worth bringing back.
          </p>

          {form.status === 'saved' ? (
            <div className="beta-saved" role="status">
              <span className="beta-saved-icon"><Check size={20} /></span>
              <div>
                <h2>Your request has been received.</h2>
                <p>Thanks for your interest in Reboot.</p>
                <p className="beta-invite-note">For privacy, this form does not reveal whether an email is already registered, queue positions, or invite details.</p>
        <VerifiedWaitlistDetails />
              </div>
              <a href="/">Enter the live app <ArrowRight size={16} /></a>
            </div>
          ) : (
            <form className="beta-form" onSubmit={submit}>
              <label htmlFor="beta-email">Register your email</label>
              <div className="beta-form-row">
                <input
                  id="beta-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  maxLength={254}
                  required
                  placeholder="builder@example.com"
                  value={email}
                  disabled={submitting}
                  onChange={event => {
                    setEmail(event.target.value);
                    if (form.status === 'error') setForm({ status: 'idle' });
                  }}
                  aria-describedby="beta-privacy beta-form-status"
                />
                <button type="submit" disabled={submitting || !email.trim()}>
                  {submitting ? <Loader2 className="beta-spin" size={17} /> : <ArrowRight size={17} />}
                  {submitting ? 'Saving…' : 'Save my spot'}
                </button>
              </div>
              <p id="beta-privacy" className="beta-privacy">Your email is used for beta access. No payment required.</p>
              <div id="beta-form-status" className="beta-form-status" role="status" aria-live="polite">
                {form.status === 'error' && form.message}
              </div>
            </form>
          )}

          <ul className="beta-features" aria-label="Included in Reboot">
            <li>Orbital world</li>
            <li>Interactive cities</li>
            <li>Project revival</li>
          </ul>
        </div>

        <div className="beta-film" id="film">
          <div className="beta-film-bar">
            <span><Play size={12} fill="currentColor" /> REBOOT / FIELD FOOTAGE</span>
            <span>REAL APP CAPTURE</span>
          </div>
          <div className="beta-video-wrap">
            <video
              controls
              playsInline
              preload="metadata"
              poster="/reboot-demo-poster.jpg"
              aria-label="Reboot app walkthrough showing the archive, Reboot Planet, and interactive cities"
            >
              <source src="/reboot-demo.mp4" type="video/mp4" />
              Your browser does not support the video. <a href="/reboot-demo.mp4">Download the Reboot walkthrough.</a>
            </video>
          </div>
          <div className="beta-film-caption">
            <span>INSIDE THE WORLD</span>
            <p>From the idea archive to Reboot Planet and its city districts.</p>
          </div>
        </div>
      </section>

      <div className="beta-ticker" aria-hidden="true">
        <div className="beta-ticker-track">
          {[0, 1].map(dup => (
            <span className="beta-ticker-run" key={dup}>
              <b style={{ color: '#00FFFF' }}>☠ THE AI WINTER</b><i>✦</i>
              <b style={{ color: '#FF00CC' }}>📱 MOBILE GHOSTS</b><i>✦</i>
              <b style={{ color: '#FFE000' }}>🎮 UNPLAYED WORLDS</b><i>✦</i>
              <b style={{ color: '#00FF88' }}>💼 MARKET MISFIRES</b><i>✦</i>
              <b style={{ color: '#AA44FF' }}>📚 THE LEARNING DEAD</b><i>✦</i>
              <b style={{ color: '#FF6600' }}>🎨 LOST CANVASES</b><i>✦</i>
            </span>
          ))}
        </div>
      </div>

      <footer className="beta-footer">
        <p>Want to look around first?</p>
        <a href="/">Explore the public app <ArrowUpRight size={15} /></a>
      </footer>
    </main>
  );
}
