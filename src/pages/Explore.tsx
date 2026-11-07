import { useEffect, useState, useCallback, useRef } from 'react';
import { ArrowRight, Heart, Zap, ChevronLeft, ChevronRight, Eye, TrendingUp, Keyboard, X, Target, GitBranch, DollarSign } from 'lucide-react';
import type { Idea } from '../lib/supabase';
import { supabase } from '../lib/supabase';

const MONO = "'Share Tech Mono', monospace";
const CATS = ['all','apps','games','ai','business','education','art','research','open-source','hardware','health'];

const STATUS_LABEL: Record<string, string> = {
  abandoned: '☠ Dead', seeking: '⚡ Seeking', in_progress: '🛠 Paused', revived: '🟢 Revived',
};
const EMOTION_MAP: Record<string, string> = {
  burnout: '😔', money: '💸', interest: '❤️', team: '👥', school: '📚',
  family: '👶', job: '💼', legal: '⚖️', market: '🧪', technical: '🔧',
};

interface Props { onIdeaSelect: (i: Idea) => void; initialStatus?: string; initialCategory?: string; }

// ── 3D HOLOGRAPHIC CARD ──────────────────────────────────────────
function HoloCard({ idea, onExamine, onRevive }: { idea: Idea; onExamine: () => void; onRevive: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const mouse = useRef({ x: 0.5, y: 0.5 });
  const current = useRef({ rx: 0, ry: 0, gx: 50, gy: 50 });
  const [saved, setSaved] = useState(false);
  const [hovering, setHovering] = useState(false);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouse.current = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  }, []);

  useEffect(() => {
    let running = true;
    const animate = () => {
      if (!running || !cardRef.current) return;
      const target = hovering
        ? { rx: (mouse.current.y - 0.5) * -20, ry: (mouse.current.x - 0.5) * 20, gx: mouse.current.x * 100, gy: mouse.current.y * 100 }
        : { rx: 0, ry: 0, gx: 50, gy: 50 };
      const k = 0.1;
      current.current.rx += (target.rx - current.current.rx) * k;
      current.current.ry += (target.ry - current.current.ry) * k;
      current.current.gx += (target.gx - current.current.gx) * k;
      current.current.gy += (target.gy - current.current.gy) * k;
      const { rx, ry, gx, gy } = current.current;
      cardRef.current.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${hovering ? 1.03 : 1})`;
      cardRef.current.style.setProperty('--gx', `${gx}%`);
      cardRef.current.style.setProperty('--gy', `${gy}%`);
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => { running = false; cancelAnimationFrame(frameRef.current); };
  }, [hovering]);

  const catGrad: Record<string, string> = {
    ai: 'radial-gradient(ellipse at 40% 30%, rgba(68,136,255,0.3) 0%, rgba(170,68,255,0.2) 50%, transparent 80%)',
    games: 'radial-gradient(ellipse at 40% 30%, rgba(255,102,0,0.25) 0%, rgba(255,0,204,0.15) 50%, transparent 80%)',
    apps: 'radial-gradient(ellipse at 40% 30%, rgba(0,255,255,0.2) 0%, rgba(68,136,255,0.15) 50%, transparent 80%)',
    business: 'radial-gradient(ellipse at 40% 30%, rgba(255,224,0,0.2) 0%, rgba(255,102,0,0.15) 50%, transparent 80%)',
    education: 'radial-gradient(ellipse at 40% 30%, rgba(0,255,136,0.2) 0%, rgba(0,255,255,0.15) 50%, transparent 80%)',
    art: 'radial-gradient(ellipse at 40% 30%, rgba(255,0,204,0.2) 0%, rgba(170,68,255,0.15) 50%, transparent 80%)',
  };

  return (
    <div ref={cardRef} onMouseMove={onMove} onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}
      style={{ width: '100%', maxWidth: 620, borderRadius: 20, overflow: 'hidden', background: 'var(--surface)', border: `1px solid ${hovering ? 'rgba(0,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`, transformStyle: 'preserve-3d', position: 'relative', transition: 'border-color 0.3s' }}>

      {/* Holographic sheen overlay */}
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at var(--gx,50%) var(--gy,50%), rgba(255,255,255,0.06) 0%, transparent 50%)`, pointerEvents: 'none', zIndex: 10, mixBlendMode: 'screen', transition: 'none', borderRadius: 20 }} />
      {/* Top edge glow */}
      {hovering && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(0,255,255,0.6),transparent)', zIndex: 11 }} />}

      {/* Visual area */}
      <div style={{ position: 'relative', height: 230, overflow: 'hidden' }}>
        {idea.cover_url ? (
          <img src={idea.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.4) saturate(0.5) hue-rotate(200deg)', transform: hovering ? 'scale(1.05)' : 'scale(1)', transition: 'transform 0.6s ease' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: catGrad[idea.category] ?? catGrad.apps, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64 }}>
            {idea.category === 'ai' ? '🤖' : idea.category === 'games' ? '🎮' : idea.category === 'apps' ? '📱' : idea.category === 'education' ? '📚' : '💡'}
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(10,10,22,0) 0%, rgba(10,10,22,0.4) 50%, rgba(10,10,22,1) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.05) 3px,rgba(0,0,0,0.05) 4px)', pointerEvents: 'none' }} />

        {/* Badges */}
        <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 7 }}>
          <span className={`chip chip-${idea.status}`} style={{ fontSize: 10 }}>{STATUS_LABEL[idea.status]}</span>
          <span className={`chip chip-${idea.difficulty}`} style={{ fontSize: 9 }}>{idea.difficulty}</span>
          {idea.almost_made_it && <span style={{ padding: '2px 8px', borderRadius: 3, fontSize: 9, fontFamily: MONO, fontWeight: 700, background: 'rgba(255,102,0,0.1)', border: '1px solid rgba(255,102,0,0.3)', color: '#FF6600', letterSpacing: '0.06em' }}>🎯 CLOSE</span>}
        </div>

        {/* Year */}
        {idea.founded_year && <div style={{ position: 'absolute', bottom: 14, right: 14, fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: MONO }}>{idea.founded_year}–{idea.abandoned_year ?? '?'}</div>}

        {/* Emotion */}
        {idea.failure_emotion && <div style={{ position: 'absolute', bottom: 14, left: 14, fontSize: 18 }} title={idea.failure_emotion}>{EMOTION_MAP[idea.failure_emotion] ?? ''}</div>}
      </div>

      {/* Content */}
      <div style={{ padding: '20px 24px 22px' }}>
        <p style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>{idea.category} · {idea.creator_name}</p>
        <h2 style={{ fontSize: 24, fontWeight: 300, letterSpacing: '-0.02em', color: '#E8E8FF', lineHeight: 1.15, marginBottom: 10 }}>{idea.title}</h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.65, marginBottom: 18, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{idea.short_desc}</p>

        {/* DNA mini stats */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
          {[
            { Icon: TrendingUp, val: idea.upvotes.toLocaleString(),    color: '#00FFFF' },
            { Icon: Eye,        val: idea.views.toLocaleString(),       color: '#AA44FF' },
            { Icon: Zap,        val: `${idea.revival_count} revivals`, color: '#00FF88' },
            ...(idea.months_built ? [{ Icon: GitBranch, val: `${idea.months_built}mo`, color: '#FFE000' }] : []),
            ...(idea.revenue_made ? [{ Icon: DollarSign, val: `$${idea.revenue_made}`, color: '#FF6600' }] : []),
          ].map(({ Icon, val, color }, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon size={11} style={{ color }} />
              <span style={{ fontSize: 11, fontFamily: MONO, color: 'rgba(255,255,255,0.4)' }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Timeline bar */}
        {idea.founded_year && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <span style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,255,255,0.25)' }}>{idea.founded_year}</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,#00FFFF,#FF00CC)', transform: `scaleX(${Math.min(1, (idea.potential_score / 5))})`, transformOrigin: 'left', boxShadow: '0 0 6px #00FFFF' }} />
            </div>
            <span style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,255,255,0.25)' }}>{idea.abandoned_year ?? '?'}</span>
          </div>
        )}

        {/* Score bars */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
          {[
            { label: 'Potential',   val: idea.potential_score, color: '#00FFFF' },
            { label: 'Revival Fit', val: idea.revival_score,   color: '#00FF88' },
          ].map(s => (
            <div key={s.label} style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.label}</span>
                <span style={{ fontSize: 9, fontFamily: MONO, color: s.color, fontWeight: 700 }}>{s.val}/5</span>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(s.val / 5) * 100}%`, background: `linear-gradient(90deg,${s.color},${s.color}66)`, boxShadow: `0 0 6px ${s.color}`, borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Tech tags */}
        {idea.tech_stack?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 18 }}>
            {idea.tech_stack.slice(0, 4).map(t => (
              <span key={t} style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(170,68,255,0.06)', border: '1px solid rgba(170,68,255,0.2)', fontSize: 10, fontFamily: MONO, color: '#AA44FF' }}>{t}</span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={onExamine} className="btn-primary" style={{ flex: 2, padding: '10px', fontSize: 11, justifyContent: 'center' }}>
            Examine <ArrowRight size={12} />
          </button>
          <button onClick={onRevive} style={{
            flex: 1, padding: '10px', borderRadius: 6, fontSize: 11, fontFamily: MONO, letterSpacing: '0.08em', fontWeight: 700,
            background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)', color: '#00FF88',
            transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,255,136,0.1)'; e.currentTarget.style.borderColor = 'rgba(0,255,136,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,255,136,0.05)'; e.currentTarget.style.borderColor = 'rgba(0,255,136,0.2)'; }}
          >
            <Zap size={11} /> Revive
          </button>
          <button onClick={() => setSaved(s => !s)} style={{
            width: 40, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: saved ? 'rgba(255,0,204,0.08)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${saved ? 'rgba(255,0,204,0.3)' : 'rgba(255,255,255,0.06)'}`,
            transition: 'all 0.15s',
          }}>
            <Heart size={13} style={{ color: saved ? '#FF00CC' : 'rgba(255,255,255,0.2)', fill: saved ? '#FF00CC' : 'none' }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── GHOST CARD (side) ─────────────────────────────────────────────
function GhostCard({ idea, which }: { idea: Idea; which: 'prev' | 'next' }) {
  const rot = which === 'prev' ? '12deg' : '-12deg';
  const tx  = which === 'prev' ? '-56%'  : '56%';
  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: `translate(${tx}, -50%) scale(0.85) perspective(1000px) rotateY(${rot})`, opacity: 0.25, pointerEvents: 'none', zIndex: 0, width: '100%', maxWidth: 620, filter: 'blur(1px)' }}>
      <div style={{ borderRadius: 20, overflow: 'hidden', background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.04)', height: 400 }}>
        {idea.cover_url && <img src={idea.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.3) saturate(0.3)' }} />}
      </div>
    </div>
  );
}

// ── KEYBOARD HELP ─────────────────────────────────────────────────
function KBHelp({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(20px)' }} />
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid rgba(0,255,255,0.15)', borderRadius: 14, padding: '24px 28px', width: 320, position: 'relative', zIndex: 1, animation: 'scaleIn 0.25s cubic-bezier(0.16,1,0.3,1) both' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, color: '#00FFFF', letterSpacing: '0.08em' }}>KEYBOARD SHORTCUTS</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)' }}><X size={14} /></button>
        </div>
        {[['→ / J','Next idea'],['← / K','Previous idea'],['E','Examine'],['S','Save'],['?','This help'],].map(([k, d]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{d}</span>
            <kbd style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(0,255,255,0.06)', border: '1px solid rgba(0,255,255,0.2)', borderRadius: 5, color: '#00FFFF', fontFamily: MONO }}>{k}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN EXPLORE ──────────────────────────────────────────────────
export default function Explore({ onIdeaSelect, initialStatus, initialCategory }: Props) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [idx, setIdx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [animDir, setAnimDir] = useState<1 | -1>(1);
  const [category, setCategory] = useState(initialCategory ?? 'all');
  const [status, setStatus] = useState(initialStatus ?? '');
  const [emotion, setEmotion] = useState('');
  const [almostOnly, setAlmostOnly] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dragStart = useRef<number | null>(null);

  const fetchIdeas = useCallback(async () => {
    setLoaded(false);
    let q = supabase.from('ideas').select('*');
    if (category !== 'all') q = q.eq('category', category);
    if (status) q = q.eq('status', status);
    if (emotion) q = q.eq('failure_emotion', emotion);
    if (almostOnly) q = q.eq('almost_made_it', true);
    q = q.order('upvotes', { ascending: false }).limit(60);
    const { data } = await q;
    setIdeas((data as Idea[]) ?? []);
    setIdx(0);
    setLoaded(true);
  }, [category, status, emotion, almostOnly]);

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);

  const navigate = useCallback((dir: 1 | -1) => {
    if (animating || ideas.length < 2) return;
    setAnimDir(dir);
    setAnimating(true);
    setTimeout(() => { setIdx(i => (i + dir + ideas.length) % ideas.length); setAnimating(false); }, 350);
  }, [animating, ideas.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === 'j') navigate(1);
      if (e.key === 'ArrowLeft'  || e.key === 'k') navigate(-1);
      if ((e.key === 'e' || e.key === 'E') && ideas[idx]) onIdeaSelect(ideas[idx]);
      if (e.key === '?') setShowHelp(true);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [navigate, idx, ideas, onIdeaSelect]);

  const idea = ideas[idx];
  const prevIdea = ideas[(idx - 1 + ideas.length) % ideas.length];
  const nextIdea = ideas[(idx + 1) % ideas.length];

  const EMOTIONS = [
    { id: 'burnout', icon: '😔' }, { id: 'money', icon: '💸' }, { id: 'team', icon: '👥' },
    { id: 'market', icon: '🧪' }, { id: 'school', icon: '📚' }, { id: 'job', icon: '💼' },
  ];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', background: 'var(--bg)' }}>
      {/* Ambient */}
      <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 800, height: 500, background: 'radial-gradient(ellipse, rgba(0,255,255,0.03) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* ── FILTER BAR ── */}
      <div style={{ flexShrink: 0, padding: '12px 28px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(2,2,12,0.7)', backdropFilter: 'blur(16px)', zIndex: 5, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Category pills */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', alignItems: 'center' }}>
          {CATS.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)} style={{
              flexShrink: 0, padding: '4px 13px', borderRadius: 99, fontSize: 11, fontFamily: MONO, letterSpacing: '0.06em', fontWeight: 600,
              background: category === cat ? 'rgba(0,255,255,0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${category === cat ? 'rgba(0,255,255,0.4)' : 'rgba(255,255,255,0.06)'}`,
              color: category === cat ? '#00FFFF' : 'rgba(255,255,255,0.3)',
              textShadow: category === cat ? '0 0 8px #00FFFF' : 'none',
              transition: 'all 0.15s',
            }}>
              {cat === 'all' ? 'ALL' : cat.toUpperCase()}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>{idx + 1} / {ideas.length}</span>
        </div>

        {/* Emotion + Almost Made It filters */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', marginRight: 2 }}>DIED FROM:</span>
          {EMOTIONS.map(e => (
            <button key={e.id} onClick={() => setEmotion(emotion === e.id ? '' : e.id)} style={{
              padding: '3px 8px', borderRadius: 4, fontSize: 12,
              background: emotion === e.id ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: `1px solid ${emotion === e.id ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.04)'}`,
              transition: 'all 0.15s',
            }}>
              {e.icon}
            </button>
          ))}
          <button onClick={() => setAlmostOnly(a => !a)} style={{
            padding: '3px 10px', borderRadius: 4, fontSize: 10, fontFamily: MONO, letterSpacing: '0.06em', fontWeight: 700,
            background: almostOnly ? 'rgba(255,102,0,0.1)' : 'transparent',
            border: `1px solid ${almostOnly ? 'rgba(255,102,0,0.35)' : 'rgba(255,255,255,0.04)'}`,
            color: almostOnly ? '#FF6600' : 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
          }}>
            <Target size={10} /> ALMOST MADE IT
          </button>
          {/* Status filter */}
          {['seeking','revived'].map(s => (
            <button key={s} onClick={() => setStatus(status === s ? '' : s)} style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 10, fontFamily: MONO, letterSpacing: '0.06em', fontWeight: 700,
              background: status === s ? 'rgba(0,255,255,0.08)' : 'transparent',
              border: `1px solid ${status === s ? 'rgba(0,255,255,0.25)' : 'rgba(255,255,255,0.04)'}`,
              color: status === s ? '#00FFFF' : 'rgba(255,255,255,0.2)',
              transition: 'all 0.15s',
            }}>
              {s === 'seeking' ? '⚡ Seeking' : '🟢 Revived'}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3D STAGE ── */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', perspective: '1400px', zIndex: 1 }}
        onMouseDown={e => { dragStart.current = e.clientX; }}
        onMouseUp={e => { if (dragStart.current !== null && Math.abs(e.clientX - dragStart.current) > 80) navigate(e.clientX < dragStart.current ? 1 : -1); dragStart.current = null; }}
        onTouchStart={e => { dragStart.current = e.touches[0].clientX; }}
        onTouchEnd={e => { if (dragStart.current !== null && Math.abs(e.changedTouches[0].clientX - dragStart.current) > 80) navigate(e.changedTouches[0].clientX < dragStart.current ? 1 : -1); dragStart.current = null; }}
      >
        {/* Ghost cards */}
        {ideas.length > 1 && prevIdea && <GhostCard idea={prevIdea} which="prev" />}
        {ideas.length > 1 && nextIdea && <GhostCard idea={nextIdea} which="next" />}

        {/* Main card */}
        {idea && !loaded ? null : idea ? (
          <div key={idea.id} style={{
            position: 'relative', zIndex: 5, width: '100%', padding: '0 80px',
            animation: animating ? (animDir === 1 ? 'exitLeft 0.35s ease both' : 'exitRight 0.35s ease both') : 'cardEnter 0.4s cubic-bezier(0.16,1,0.3,1) both',
          }}>
            <HoloCard idea={idea} onExamine={() => onIdeaSelect(idea)} onRevive={() => onIdeaSelect(idea)} />
          </div>
        ) : null}

        {/* Nav arrows */}
        {[
          { dir: -1 as const, Icon: ChevronLeft,  side: 'left',  label: 'K' },
          { dir:  1 as const, Icon: ChevronRight, side: 'right', label: 'J' },
        ].map(({ dir, Icon, side, label }) => (
          <button key={side} onClick={() => navigate(dir)} style={{
            position: 'absolute', [side]: 16, top: '50%', transform: 'translateY(-50%)',
            width: 44, height: 44, borderRadius: 14, zIndex: 6,
            background: 'rgba(2,2,12,0.9)', border: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
            color: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(16px)', transition: 'all 0.18s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#00FFFF'; e.currentTarget.style.borderColor = 'rgba(0,255,255,0.3)'; e.currentTarget.style.boxShadow = '0 0 16px rgba(0,255,255,0.12)'; e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(-50%)'; }}
          >
            <Icon size={18} />
            <span style={{ fontSize: 8, fontFamily: MONO, letterSpacing: '0.08em', color: 'inherit', opacity: 0.5 }}>{label}</span>
          </button>
        ))}
      </div>

      {/* ── BOTTOM BAR ── */}
      <div style={{ flexShrink: 0, padding: '12px 28px', borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(2,2,12,0.7)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 5 }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 4 }}>
          {Array.from({ length: Math.min(ideas.length, 9) }, (_, i) => {
            const offset = Math.max(0, Math.min(idx - 4, ideas.length - 9));
            const active = i + offset === idx;
            return <div key={i} style={{ width: active ? 20 : 5, height: 5, borderRadius: 99, background: active ? 'linear-gradient(90deg,#00FFFF,#FF00CC)' : 'rgba(255,255,255,0.08)', boxShadow: active ? '0 0 6px #00FFFF' : 'none', transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)' }} />;
          })}
        </div>

        <button onClick={() => setShowHelp(true)} style={{ position: 'absolute', right: 20, width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#00FFFF'; e.currentTarget.style.borderColor = 'rgba(0,255,255,0.2)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
        >
          <Keyboard size={12} />
        </button>
      </div>

      {showHelp && <KBHelp onClose={() => setShowHelp(false)} />}

      {(!loaded || ideas.length === 0) && loaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 20 }}>
          <p style={{ fontFamily: MONO, fontSize: 14, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em' }}>NO IDEAS MATCH THESE FILTERS</p>
          <button onClick={() => { setCategory('all'); setStatus(''); setEmotion(''); setAlmostOnly(false); }} className="btn-ghost" style={{ fontSize: 12 }}>CLEAR FILTERS</button>
        </div>
      )}

      <style>{`
        @keyframes cardEnter  { from{opacity:0;transform:scale(0.94) translateY(16px)} to{opacity:1;transform:none} }
        @keyframes exitLeft   { to{opacity:0;transform:translateX(-60px) scale(0.95)} }
        @keyframes exitRight  { to{opacity:0;transform:translateX(60px) scale(0.95)} }
        @keyframes scaleIn    { from{opacity:0;transform:scale(0.94)} to{opacity:1;transform:none} }
      `}</style>
    </div>
  );
}
