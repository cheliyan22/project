import { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowRight, Eye, TrendingUp, ChevronLeft, ChevronRight, Clock, Zap, Skull } from 'lucide-react';
import type { Idea } from '../lib/supabase';
import { supabase } from '../lib/supabase';

const MONO = "'Share Tech Mono', monospace";

const WINGS = [
  { id: 'ai',        label: 'The AI Winter',       sub: 'Too early for their time',       color: '#00FFFF', glyph: '🤖', num: '01' },
  { id: 'apps',      label: 'Mobile Ghosts',        sub: 'Apps the world rejected',        color: '#FF00CC', glyph: '📱', num: '02' },
  { id: 'games',     label: 'Unplayed Worlds',      sub: 'Games that never shipped',       color: '#FFE000', glyph: '🎮', num: '03' },
  { id: 'business',  label: 'Market Misfires',      sub: 'Fatal timing & bad luck',        color: '#00FF88', glyph: '💼', num: '04' },
  { id: 'education', label: 'The Learning Dead',    sub: 'EdTech that never scaled',       color: '#AA44FF', glyph: '📚', num: '05' },
  { id: 'art',       label: 'Lost Canvases',        sub: 'Creative visions abandoned',     color: '#FF6600', glyph: '🎨', num: '06' },
];

const STATUS_LABELS: Record<string, string> = {
  abandoned: '☠ Dead', seeking: '⚡ Seeking', in_progress: '🛠 Paused', revived: '🟢 Revived',
};

interface Props { onIdeaSelect: (i: Idea) => void; onExplore: (cat?: string) => void; }

// ── 3D TILT CARD ────────────────────────────────────────────────
function TiltCard({ children, className = '', style = {}, onMouseEnter, onMouseLeave, onClick }: {
  children: React.ReactNode; className?: string; style?: React.CSSProperties;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width  - 0.5;
    const y = (e.clientY - rect.top)  / rect.height - 0.5;
    el.style.transform = `perspective(700px) rotateY(${x * 14}deg) rotateX(${-y * 14}deg) translateZ(8px) scale(1.02)`;
    el.style.boxShadow = `${-x * 20}px ${-y * 20}px 40px rgba(0,0,0,0.6), 0 0 30px rgba(0,255,255,0.08)`;
  };
  const onLeave = () => {
    const el = ref.current; if (!el) return;
    el.style.transform = '';
    el.style.boxShadow = '';
  };

  return (
    <div ref={ref} className={className} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); e.currentTarget.click(); } }} style={{ transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s', transformStyle: 'preserve-3d', ...style }}
      onMouseMove={onMove} onMouseEnter={onMouseEnter} onMouseLeave={(e) => { onLeave(); onMouseLeave?.(e); }} onClick={onClick}>
      {children}
    </div>
  );
}

// ── WING CARD ────────────────────────────────────────────────────
function WingCard({ wing, count, onExplore }: { wing: typeof WINGS[0]; count: number; onExplore: () => void }) {
  const [hover, setHover] = useState(false);

  return (
    <TiltCard
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flexShrink: 0, width: 220, height: 160, borderRadius: 14,
        background: hover ? `rgba(${wing.color === '#00FFFF' ? '0,255,255' : wing.color === '#FF00CC' ? '255,0,204' : wing.color === '#FFE000' ? '255,224,0' : wing.color === '#00FF88' ? '0,255,136' : wing.color === '#AA44FF' ? '170,68,255' : '255,102,0'},0.06)` : 'rgba(255,255,255,0.02)',
        border: `1px solid ${hover ? wing.color + '40' : 'rgba(255,255,255,0.06)'}`,
        cursor: 'none', position: 'relative', overflow: 'hidden',
      } as React.CSSProperties}
      onClick={onExplore}
    >
      {/* Big ghost number */}
      <div style={{ position: 'absolute', top: -10, right: 10, fontSize: 72, fontWeight: 900, color: wing.color, opacity: 0.07, lineHeight: 1, fontFamily: MONO, pointerEvents: 'none', transition: 'opacity 0.3s' }} className={hover ? 'opacity-15' : ''}>{wing.num}</div>

      {/* Top glow on hover */}
      {hover && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${wing.color},transparent)` }} />}

      <div style={{ position: 'absolute', inset: 0, padding: '18px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 22, marginBottom: 8 }}>{wing.glyph}</div>
          <p style={{ fontSize: 10, fontFamily: MONO, color: wing.color, letterSpacing: '0.1em', fontWeight: 700, marginBottom: 4, textShadow: hover ? `0 0 8px ${wing.color}` : 'none', transition: 'text-shadow 0.2s' }}>WING {wing.num}</p>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#E8E8FF', lineHeight: 1.2, marginBottom: 4 }}>{wing.label}</h3>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.4 }}>{wing.sub}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,255,255,0.2)' }}>{count} ideas</span>
          <ArrowRight size={13} style={{ color: wing.color, opacity: hover ? 1 : 0.4, transition: 'opacity 0.2s', transform: hover ? 'translateX(3px)' : 'none' }} />
        </div>
      </div>
    </TiltCard>
  );
}

// ── INFINITE MARQUEE ─────────────────────────────────────────────
function Marquee({ items }: { items: string[] }) {
  const track = [...items, ...items];
  return (
    <div style={{ overflow: 'hidden', position: 'relative', maskImage: 'linear-gradient(90deg,transparent,black 8%,black 92%,transparent)' }}>
      <div style={{ display: 'flex', gap: 32, animation: 'marqueeScroll 28s linear infinite', width: 'max-content' }}>
        {track.map((item, i) => (
          <span key={i} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.15em', color: 'rgba(0,255,255,0.25)', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(0,255,255,0.3)', display: 'inline-block' }} />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── SIDE CARD ────────────────────────────────────────────────────
function SideCard({ idea, active, onClick }: { idea: Idea; active: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); e.currentTarget.click(); } }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 14px', borderRadius: 10,
        background: active ? 'rgba(0,255,255,0.05)' : hover ? 'rgba(0,255,255,0.03)' : 'rgba(255,255,255,0.015)',
        border: `1px solid ${active ? 'rgba(0,255,255,0.25)' : hover ? 'rgba(0,255,255,0.12)' : 'rgba(255,255,255,0.04)'}`,
        cursor: 'none', transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
        transform: hover ? 'translateX(4px)' : 'none',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {active && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'linear-gradient(180deg,#00FFFF,#FF00CC)', borderRadius: '0 2px 2px 0', boxShadow: '0 0 8px #00FFFF' }} />}

      {/* Thumb */}
      <div style={{ width: 40, height: 40, borderRadius: 9, flexShrink: 0, overflow: 'hidden', background: 'rgba(0,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {idea.cover_url ? <img src={idea.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.55) saturate(0.6) hue-rotate(200deg)' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{idea.category === 'games' ? '🎮' : idea.category === 'ai' ? '🤖' : '💡'}</div>}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: active ? '#E8E8FF' : 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{idea.title}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,255,255,0.2)' }}>{idea.founded_year ?? '?'}–{idea.abandoned_year ?? '?'}</span>
          <span className={`chip chip-${idea.status}`} style={{ fontSize: 8, padding: '1px 6px' }}>{STATUS_LABELS[idea.status]}</span>
        </div>
      </div>
    </div>
  );
}

// ── MAIN HOME ────────────────────────────────────────────────────
export default function Home({ onIdeaSelect, onExplore }: Props) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [wingCounts, setWingCounts] = useState<Record<string, number>>({});
  const [featIdx, setFeatIdx] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const wingsRef = useRef<HTMLDivElement>(null);
  const DURATION = 8000;

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setLoadError(null);
    void (async () => {
      try {
        const { data, error } = await supabase.from('ideas').select('*').order('upvotes', { ascending: false }).limit(16);
        if (error) throw new Error('The archive could not be loaded.');
        const counts: Record<string, number> = {};
        await Promise.all(WINGS.map(async w => {
          const { count, error: countError } = await supabase.from('ideas').select('id', { count: 'exact', head: true }).eq('category', w.id);
          if (countError) throw new Error('Archive wing counts could not be loaded.');
          counts[w.id] = count ?? 0;
        }));
        if (!active) return;
        setIdeas((data ?? []) as Idea[]);
        setWingCounts(counts);
        setFeatIdx(0);
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : 'The archive could not be loaded.');
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => { active = false; };
  }, [retry]);

  const advance = useCallback((dir: 1 | -1 = 1) => {
    if (transitioning || !ideas.length) return;
    setTransitioning(true);
    setProgressPct(0);
    setTimeout(() => { setFeatIdx(i => (i + dir + ideas.length) % ideas.length); setTransitioning(false); }, 400);
  }, [transitioning, ideas.length]);

  useEffect(() => {
    if (paused || !ideas.length) return;
    setProgressPct(0);
    const s = Date.now();
    const pi = setInterval(() => setProgressPct(Math.min((Date.now() - s) / DURATION * 100, 100)), 50);
    const ai = setTimeout(() => advance(1), DURATION);
    return () => { clearInterval(pi); clearTimeout(ai); };
  }, [featIdx, paused, ideas.length, advance]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      // The archive stays mounted behind dialogs; typing and button activation
      // belong to the focused control, never to the background carousel.
      if (target instanceof Element && (target.closest('input, textarea, select, button, [role="button"], [role="dialog"], [aria-modal="true"]')
        || (target instanceof HTMLElement && target.isContentEditable))) return;
      if (e.key === 'ArrowRight') advance(1);
      if (e.key === 'ArrowLeft') advance(-1);
      if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [advance]);

  const featured = ideas[featIdx];
  const sideIdeas = ideas.filter((_, i) => i !== featIdx).slice(0, 5);

  const MARQUEE_ITEMS = ['AI Resume Builder', 'CryptoVault Pro', 'SocialVR Alpha', 'DeepLearn IDE', 'MetaShop 2023', 'VoiceNote AI', 'CodeReview Bot', 'GameFi Protocol', 'MindMap Pro', 'TaskFlow App', 'DataViz Studio', 'Chat Widget SDK'];

  if (!loaded) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ position: 'relative', width: 48, height: 48 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(0,255,255,0.3)', animation: 'spin 1.5s linear infinite' }} />
        <div style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: '1px solid rgba(255,0,204,0.3)', animation: 'spin 1s linear infinite reverse' }} />
      </div>
      <p style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(0,255,255,0.4)', letterSpacing: '0.12em' }}>LOADING ARCHIVE...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (loadError) return (
    <div role="alert" style={{ minHeight: '60vh', display: 'grid', placeContent: 'center', gap: 16, padding: 24, color: '#E8E8FF', textAlign: 'center' }}>
      <h1>Archive unavailable</h1>
      <p>{loadError}</p>
      <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button>
    </div>
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>
      {/* Ambient radial */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60%', background: 'radial-gradient(ellipse 70% 50% at 30% 20%, rgba(0,255,255,0.04) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative', zIndex: 1 }}>

        {/* ── FEATURED (58%) ── */}
        <div style={{ flex: '0 0 58%', position: 'relative', overflow: 'hidden' }}>
          {/* Progress bar */}
          {!paused && <div style={{ position: 'absolute', top: 0, left: 0, height: 2, width: `${progressPct}%`, background: 'linear-gradient(90deg, #00FFFF, #FF00CC)', boxShadow: '0 0 8px #00FFFF', transition: 'width 0.1s linear', zIndex: 10 }} />}

          {/* BG */}
          <div style={{ position: 'absolute', inset: 0 }}>
            {featured?.cover_url ? (
              <img key={featured.id} src={featured.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.3) saturate(0.5) hue-rotate(200deg)', animation: 'bgFade 0.8s ease both' }} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 80% at 30% 40%, rgba(0,255,255,0.08), transparent 70%)' }} />
            )}
            {/* Multi-layer overlay */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(2,2,12,0.2) 0%, rgba(2,2,12,0.6) 50%, rgba(2,2,12,0.97) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(2,2,12,0) 0%, rgba(2,2,12,0.8) 100%)' }} />
            {/* Scanlines */}
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.05) 3px,rgba(0,0,0,0.05) 4px)', pointerEvents: 'none' }} />
          </div>

          {/* Content */}
          {featured && (
            <div key={featured.id} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '48px 56px', animation: 'fadeUp 0.5s ease both' }}>
              {/* Tags */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                <span className={`chip chip-${featured.status}`}>{STATUS_LABELS[featured.status]}</span>
                {featured.almost_made_it && <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 9, fontFamily: MONO, fontWeight: 700, background: 'rgba(255,102,0,0.1)', border: '1px solid rgba(255,102,0,0.3)', color: '#FF6600', letterSpacing: '0.08em' }}>🎯 ALMOST MADE IT</span>}
                <span style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.08em' }}>
                  {featured.category?.toUpperCase()} · {featured.founded_year ?? '?'}–{featured.abandoned_year ?? '?'}
                </span>
              </div>

              {/* Title */}
              <h1 style={{ fontSize: 'clamp(32px,4vw,60px)', fontWeight: 200, lineHeight: 1.05, letterSpacing: '-0.03em', color: '#E8E8FF', marginBottom: 14, maxWidth: 520, textShadow: '0 2px 30px rgba(0,0,0,0.7)' }}>
                {featured.title}
              </h1>

              {/* Desc */}
              <p style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(255,255,255,0.45)', maxWidth: 460, marginBottom: 22 }}>{featured.short_desc}</p>

              {/* DNA pills */}
              <div style={{ display: 'flex', gap: 18, marginBottom: 28, flexWrap: 'wrap' }}>
                {[
                  { Icon: TrendingUp, val: featured.upvotes.toLocaleString(),  label: 'upvotes', color: '#00FFFF' },
                  { Icon: Eye,        val: featured.views.toLocaleString(),     label: 'views',   color: '#AA44FF' },
                  { Icon: Zap,        val: featured.revival_count.toString(),   label: 'revivals',color: '#00FF88' },
                  ...(featured.time_invested ? [{ Icon: Clock, val: featured.time_invested, label: 'invested', color: '#FFE000' }] : []),
                ].map(({ Icon, val, label, color }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <Icon size={12} style={{ color }} />
                    <span style={{ color: '#E8E8FF', fontWeight: 700, fontFamily: MONO }}>{val}</span>
                    <span style={{ color: 'rgba(255,255,255,0.25)', fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em' }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* CTAs */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => onIdeaSelect(featured)} className="btn-primary" style={{ fontSize: 12, padding: '10px 22px' }}>
                  Examine <ArrowRight size={13} />
                </button>
                <button onClick={() => advance(1)} className="btn-ghost" style={{ fontSize: 12, padding: '10px 18px' }}>
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* Nav arrows */}
          {[
            { dir: -1 as const, Icon: ChevronLeft, side: 'left' },
            { dir:  1 as const, Icon: ChevronRight, side: 'right' },
          ].map(({ dir, Icon, side }) => (
            <button key={side} onClick={() => advance(dir)} style={{
              position: 'absolute', [side]: 14, top: '50%', transform: 'translateY(-50%)',
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(2,2,12,0.7)', border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.3)', backdropFilter: 'blur(12px)',
              transition: 'all 0.15s', zIndex: 5,
            }}
              onMouseEnter={e => { e.currentTarget.style.color = '#00FFFF'; e.currentTarget.style.borderColor = 'rgba(0,255,255,0.3)'; e.currentTarget.style.boxShadow = '0 0 12px rgba(0,255,255,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <Icon size={16} />
            </button>
          ))}

          {/* Dot indicator */}
          <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5, zIndex: 5 }}>
            {ideas.map((idea, i) => (
              <button key={idea.id} type="button" aria-label={`Show featured project ${i + 1}: ${idea.title}`} aria-current={i === featIdx ? 'true' : undefined}
                onClick={() => { setFeatIdx(i); setProgressPct(0); }}
                style={{ padding: '9px 2px', border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <span style={{
                display: 'block', width: i === featIdx ? 20 : 5, height: 5, borderRadius: 99,
                background: i === featIdx ? 'linear-gradient(90deg,#00FFFF,#FF00CC)' : 'rgba(255,255,255,0.12)',
                boxShadow: i === featIdx ? '0 0 6px #00FFFF' : 'none',
                transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
              }} />
              </button>
            ))}
          </div>
        </div>

        {/* ── SIDE STACK (42%) ── */}
        <div style={{
          flex: '0 0 42%',
          display: 'flex', flexDirection: 'column',
          padding: '24px 24px 20px 20px',
          borderLeft: '1px solid rgba(255,255,255,0.04)',
          background: 'rgba(2,2,12,0.5)',
          overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <Skull size={11} style={{ color: 'rgba(0,255,255,0.4)' }} />
                <span style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(0,255,255,0.4)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Featured Archive</span>
              </div>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: MONO }}>
                {ideas.length} ideas loaded
              </p>
            </div>
            <button onClick={() => onExplore()} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, background: 'rgba(0,255,255,0.04)', border: '1px solid rgba(0,255,255,0.15)', color: 'var(--cyan)', fontSize: 10, fontFamily: MONO, letterSpacing: '0.08em', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(0,255,255,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(0,255,255,0.15)'; }}
            >
              VIEW ALL <ArrowRight size={10} />
            </button>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
            {sideIdeas.map(idea => (
              <SideCard key={idea.id} idea={idea} active={ideas.indexOf(idea) === featIdx} onClick={() => { setFeatIdx(ideas.indexOf(idea)); setProgressPct(0); }} />
            ))}
          </div>

          {/* Score bars for featured */}
          {featured && (
            <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Project Scores</div>
              {[
                { label: 'Potential',   val: featured.potential_score, max: 5, color: '#00FFFF' },
                { label: 'Revival Fit', val: featured.revival_score,   max: 5, color: '#00FF88' },
              ].map(s => (
                <div key={s.label} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>{s.label}</span>
                    <span style={{ fontSize: 10, fontFamily: MONO, color: s.color, fontWeight: 700 }}>{s.val}/{s.max}</span>
                  </div>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(s.val / s.max) * 100}%`, background: `linear-gradient(90deg, ${s.color}, ${s.color}88)`, boxShadow: `0 0 6px ${s.color}`, borderRadius: 99, transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── MARQUEE ── */}
      <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.4)', padding: '10px 0' }}>
        <Marquee items={MARQUEE_ITEMS.map(i => `☠ ${i}`)} />
      </div>

      {/* ── WINGS ── */}
      <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(2,2,12,0.8)', backdropFilter: 'blur(12px)', padding: '18px 0 16px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: '40px 28px', marginBottom: 12 }}>
          <span style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(0,255,255,0.4)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Thematic Wings</span>
          <div style={{ display: 'flex', gap: 5 }}>
            {[ChevronLeft, ChevronRight].map((Icon, i) => (
              <button key={i} onClick={() => wingsRef.current?.scrollBy({ left: (i ? 1 : -1) * 260, behavior: 'smooth' })} style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#00FFFF'; e.currentTarget.style.borderColor = 'rgba(0,255,255,0.25)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
              >
                <Icon size={13} />
              </button>
            ))}
          </div>
        </div>
        <div ref={wingsRef} style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingInline: '40px 28px', scrollbarWidth: 'none' }}>
          {WINGS.map(w => (
            <WingCard key={w.id} wing={w} count={wingCounts[w.id] ?? 0} onExplore={() => onExplore(w.id)} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fadeUp     { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:none} }
        @keyframes bgFade     { from{opacity:0} to{opacity:1} }
        @keyframes spin       { to{transform:rotate(360deg)} }
        @keyframes marqueeScroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }
      `}</style>
    </div>
  );
}
