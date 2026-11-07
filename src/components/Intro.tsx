import { useEffect, useRef, useState, useCallback } from 'react';
import { Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { fetchLandingStats, type LandingStat } from '../lib/landing-stats';

const MONO = "'Share Tech Mono', monospace";
const rand = (a: number, b: number) => Math.random() * (b - a) + a;
const GLITCH = '!@#$%^░▒▓█▄▀■◆○●∅∞≠±×☠⚡∇Ω∆ΣΞΨ';

// ── NEON COLORS cycling per render
const NEONS = ['#00FFFF','#FF00CC','#00FF88','#FFE000','#FF6600','#AA44FF'];
const N0 = '#00FFFF';

// ── 3D VOID CANVAS ─────────────────────────────────────────────
function VoidCanvas3D() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let W = 0, H = 0, raf = 0, frame = 0;
    const mouse = { x: 0, y: 0 };

    const resize = () => { W = cv.width = cv.offsetWidth; H = cv.height = cv.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);
    const onMouse = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    window.addEventListener('mousemove', onMouse);

    // ── Stars in 3D space
    type Star3D = { x: number; y: number; z: number; px: number; py: number };
    const COUNT = 500;
    const stars: Star3D[] = Array.from({ length: COUNT }, () => ({
      x: rand(-1, 1), y: rand(-1, 1), z: rand(0.1, 1),
      px: 0, py: 0,
    }));

    // ── Wormhole rings
    type Ring = { z: number; alpha: number; hue: number };
    const rings: Ring[] = Array.from({ length: 24 }, (_, i) => ({
      z: i / 24, alpha: 0, hue: i * 15,
    }));

    // ── Floating glitch debris
    type Debris = { x: number; y: number; vx: number; vy: number; char: string; alpha: number; size: number; color: string };
    const WORDS = '☠ VOID NULL ERR 404 DEAD LOST NaN Ω∅'.split(' ');
    const debris: Debris[] = Array.from({ length: 40 }, () => ({
      x: rand(0, 1), y: rand(0, 1),
      vx: rand(-0.0003, 0.0003), vy: rand(-0.0004, -0.0001),
      char: WORDS[Math.floor(rand(0, WORDS.length))],
      alpha: rand(0.03, 0.12), size: rand(9, 22),
      color: NEONS[Math.floor(rand(0, NEONS.length))],
    }));

    // ── Glitch blocks
    type Block = { x: number; y: number; w: number; h: number; life: number; color: string };
    const blocks: Block[] = [];
    let glitchCD = 0;

    // ── Tombstones (3D projected)
    type Stone = { ax: number; ay: number; az: number; scale: number; rot: number; label: string };
    const STONE_LABELS = ['AI Resume\nBuilder', 'CryptoExchange\n2.0', 'SocialVR\nAlpha', 'DeepLearn\nIDE', 'MetaShop\n2023', 'VoiceNote\nAI', 'CodeReview\nBot', 'GameFi\nProtocol'];
    const stones: Stone[] = Array.from({ length: 8 }, (_, i) => ({
      ax: rand(-0.8, 0.8), ay: rand(0.1, 0.7), az: rand(0.3, 0.9),
      scale: rand(0.5, 1.2), rot: rand(-0.2, 0.2),
      label: STONE_LABELS[i],
    }));

    // project 3D → 2D
    const project = (ax: number, ay: number, az: number) => {
      const fov = 0.6;
      const cx = W / 2 + (mouse.x - W / 2) * 0.04;
      const cy = H / 2 + (mouse.y - H / 2) * 0.04;
      const scale = fov / (fov + az);
      return {
        x: cx + ax * W * scale * 0.5,
        y: cy + ay * H * scale * 0.4,
        s: scale,
      };
    };

    const drawTombstone = (x: number, y: number, sc: number, rot: number, label: string, alpha: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      ctx.scale(sc, sc);

      const w = 44, h = 60, r = 22;
      ctx.strokeStyle = `rgba(0,255,255,${alpha})`;
      ctx.fillStyle = `rgba(0,10,20,${alpha * 0.8})`;
      ctx.lineWidth = 1.2;
      ctx.shadowColor = N0;
      ctx.shadowBlur = 8;

      // Stone body
      ctx.beginPath();
      ctx.moveTo(-w/2, h/2);
      ctx.lineTo(-w/2, -h/2 + r);
      ctx.arc(0, -h/2 + r, r, Math.PI, 0);
      ctx.lineTo(w/2, h/2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cross
      ctx.beginPath();
      ctx.moveTo(0, -h/2 + r + 5);
      ctx.lineTo(0, h/2 - 12);
      ctx.moveTo(-10, -h/2 + r + 16);
      ctx.lineTo(10, -h/2 + r + 16);
      ctx.strokeStyle = `rgba(0,255,255,${alpha * 0.6})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // RIP text
      ctx.fillStyle = `rgba(0,255,255,${alpha * 0.5})`;
      ctx.font = `bold 8px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText('R.I.P.', 0, -h/2 + r + 10);

      // Label
      ctx.font = `6px ${MONO}`;
      ctx.fillStyle = `rgba(255,255,255,${alpha * 0.35})`;
      label.split('\n').forEach((line, i) => ctx.fillText(line, 0, 8 + i * 9));

      ctx.restore();
    };

    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, W, H);

      // Background gradient
      const bgGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W, H));
      bgGrad.addColorStop(0, 'rgba(2,2,12,1)');
      bgGrad.addColorStop(0.6, 'rgba(1,1,8,1)');
      bgGrad.addColorStop(1, 'rgba(0,0,4,1)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // ── Wormhole rings
      const cx = W/2, cy = H/2;
      rings.forEach((ring) => {
        ring.z = (ring.z + 0.004) % 1;
        const sc = 1 - ring.z;
        const rx = cx * sc * 1.8;
        const ry = cy * sc * 0.9;
        const a = (1 - ring.z) * 0.25;
        const hue = (ring.hue + frame * 0.3) % 360;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hue},100%,60%,${a})`;
        ctx.lineWidth = 0.5 + sc * 1.5;
        ctx.shadowColor = `hsl(${hue},100%,60%)`;
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      // ── 3D star field
      const speed = 0.003 + Math.sin(frame * 0.01) * 0.001;
      stars.forEach(s => {
        s.z -= speed;
        if (s.z <= 0) { s.x = rand(-1, 1); s.y = rand(-1, 1); s.z = 1; }
        const k = 0.5 / s.z;
        const sx = W/2 + s.x * W * k;
        const sy = H/2 + s.y * H * k;
        if (sx < 0 || sx > W || sy < 0 || sy > H) { s.z = 1; return; }
        const r = Math.max(0.3, (1 - s.z) * 2.5);
        const a = Math.min(1, (1 - s.z) * 1.8);
        const hue = ((s.x * 60 + s.y * 60 + frame * 0.1) % 360 + 360) % 360;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue},80%,80%,${a})`;
        ctx.fill();
        // streak
        if (a > 0.5) {
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(W/2 + s.x * W * (k * 0.7), H/2 + s.y * H * (k * 0.7));
          ctx.strokeStyle = `hsla(${hue},80%,70%,${a * 0.3})`;
          ctx.lineWidth = r * 0.5;
          ctx.stroke();
        }
      });

      // ── Debris
      debris.forEach(d => {
        d.x += d.vx; d.y += d.vy;
        if (d.y < -0.05) { d.y = 1.05; d.x = rand(0, 1); }
        if (d.x < -0.05 || d.x > 1.05) { d.x = rand(0.1, 0.9); }
        ctx.font = `${d.size}px ${MONO}`;
        ctx.fillStyle = d.color + Math.round(d.alpha * 255).toString(16).padStart(2,'0');
        ctx.fillText(d.char, d.x * W, d.y * H);
      });

      // ── Tombstones (3D)
      const sorted = [...stones].sort((a, b) => b.az - a.az);
      sorted.forEach((st, i) => {
        st.rot += 0.0003;
        const bob = Math.sin(frame * 0.008 + i) * 0.015;
        const { x, y, s: sc } = project(st.ax, st.ay + bob, st.az);
        const alpha = Math.min(0.6, sc * 0.8);
        drawTombstone(x, y, st.scale * sc * 120, st.rot, st.label, alpha);
      });

      // ── Grid floor
      ctx.save();
      ctx.globalAlpha = 0.08;
      const vanishY = H * 0.72;
      const gridLines = 16;
      for (let i = 0; i <= gridLines; i++) {
        const t = i / gridLines;
        const gx = W * t;
        ctx.beginPath();
        ctx.moveTo(gx, vanishY);
        ctx.lineTo(W/2 + (gx - W/2) * 0.05, H * 0.85);
        ctx.strokeStyle = `rgba(0,255,255,${0.15 + t * 0.05})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const y2 = vanishY + (H * 0.85 - vanishY) * t;
        const spread = 0.05 + t * 0.95;
        const x1 = W/2 - (W/2) * spread;
        const x2 = W/2 + (W/2) * spread;
        ctx.beginPath();
        ctx.moveTo(x1, y2);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(0,255,255,${0.1 + t * 0.12})`;
        ctx.stroke();
      }
      ctx.restore();

      // ── Glitch blocks
      glitchCD++;
      if (glitchCD > rand(40, 120)) {
        glitchCD = 0;
        for (let i = 0; i < rand(1, 5); i++) {
          blocks.push({ x: rand(0, W), y: rand(0, H), w: rand(30, 300), h: rand(1, 6), life: 1, color: NEONS[Math.floor(rand(0, NEONS.length))] });
        }
      }
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        b.life -= 0.08;
        if (b.life <= 0) { blocks.splice(i, 1); continue; }
        ctx.globalAlpha = b.life * 0.7;
        ctx.fillStyle = b.color;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = 'rgba(255,0,80,0.4)';
        ctx.fillRect(b.x + 3, b.y, b.w, b.h);
        ctx.fillStyle = 'rgba(0,220,255,0.4)';
        ctx.fillRect(b.x - 3, b.y, b.w, b.h);
        ctx.globalAlpha = 1;
      }

      // ── CRT scanline sweep
      const sweep = (frame * 0.7) % H;
      const sg = ctx.createLinearGradient(0, sweep - 30, 0, sweep + 30);
      sg.addColorStop(0, 'transparent');
      sg.addColorStop(0.5, 'rgba(0,255,255,0.025)');
      sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, H);

      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('mousemove', onMouse); };
  }, []);

  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}

// ── GLITCH TEXT COMPONENT ──────────────────────────────────────
function GlitchText({ text, style, delay = 0 }: { text: string; style?: React.CSSProperties; delay?: number }) {
  const [display, setDisplay] = useState(text.split('').map(() => '█'));
  const [glitching, setGlitching] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      let f = 0; const FRAMES = 28;
      const iv = setInterval(() => {
        f++;
        const revealed = Math.floor((f / FRAMES) * text.length);
        if (f >= FRAMES) { setDisplay(text.split('')); setDone(true); clearInterval(iv); return; }
        setDisplay(text.split('').map((ch, i) => i < revealed ? ch : GLITCH[Math.floor(rand(0, GLITCH.length))]));
      }, 45);
    }, delay);
    return () => clearTimeout(t);
  }, [text, delay]);

  // random glitch after done
  useEffect(() => {
    if (!done) return;
    const iv = setInterval(() => {
      setGlitching(true);
      setTimeout(() => setGlitching(false), 80 + rand(0, 100));
    }, rand(2000, 6000));
    return () => clearInterval(iv);
  }, [done]);

  return (
    <span style={{ position: 'relative', display: 'inline-block', ...style }}>
      <span>{display.join('')}</span>
      {glitching && <>
        <span style={{ position: 'absolute', inset: 0, color: '#FF00CC', transform: 'translate(3px,0)', opacity: 0.7, mixBlendMode: 'screen' }}>{text}</span>
        <span style={{ position: 'absolute', inset: 0, color: '#00FFFF', transform: 'translate(-3px,0)', opacity: 0.7, mixBlendMode: 'screen' }}>{text}</span>
      </>}
    </span>
  );
}

// ── HOLOGRAPHIC GHOST LOGO ─────────────────────────────────────
function HoloGhost({ size = 100 }: { size?: number }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setFrame(f => f + 1), 50);
    return () => clearInterval(iv);
  }, []);

  const hue = (frame * 2) % 360;
  const glitch = frame % 60 < 3;
  const flicker = frame % 40 < 2;

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* Orbital rings */}
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          position: 'absolute',
          width: size * (1.3 + i * 0.35),
          height: size * (1.3 + i * 0.35),
          borderRadius: '50%',
          border: `1px solid hsla(${(hue + i * 40) % 360},100%,60%,${0.35 - i * 0.08})`,
          animation: `orbit${i % 2 ? 'Rev' : 'Fwd'} ${3 + i * 1.5}s linear infinite`,
          boxShadow: `0 0 ${6 + i * 4}px hsla(${(hue + i * 40) % 360},100%,60%,0.3)`,
        }} />
      ))}

      <svg width={size} height={size} viewBox="0 0 100 100" style={{
        position: 'relative', zIndex: 1,
        filter: glitch
          ? `drop-shadow(4px 0 0 #FF00CC) drop-shadow(-4px 0 0 #00FFFF)`
          : `drop-shadow(0 0 ${size * 0.12}px hsl(${hue},100%,60%)) drop-shadow(0 0 ${size * 0.25}px hsl(${hue},100%,60%,0.4))`,
        opacity: flicker ? 0.7 : 1,
        transition: 'filter 0.05s',
      }}>
        {/* Holo fill */}
        <defs>
          <linearGradient id="holo" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={`hsl(${hue},100%,70%)`} stopOpacity="0.15"/>
            <stop offset="100%" stopColor={`hsl(${(hue+120)%360},100%,70%)`} stopOpacity="0.05"/>
          </linearGradient>
        </defs>
        <path d="M50 6C27 6 14 23 14 42L14 82L22 75L31 82L40 75L50 82L60 75L69 82L78 75L86 82L86 42C86 23 73 6 50 6Z"
          fill="url(#holo)" stroke={`hsl(${hue},100%,65%)`} strokeWidth="2" strokeLinejoin="round"/>
        {glitch && (
          <path d="M50 6C27 6 14 23 14 42L14 82L22 75L31 82L40 75L50 82L60 75L69 82L78 75L86 82L86 42C86 23 73 6 50 6Z"
            fill="none" stroke="#FF00CC" strokeWidth="2" strokeLinejoin="round" transform="translate(3,0)" opacity="0.5"/>
        )}
        {/* Eyes */}
        <ellipse cx="37" cy="44" rx="7" ry="7" fill={`hsl(${hue},100%,65%)`} style={{ filter: `drop-shadow(0 0 5px hsl(${hue},100%,65%))` }}/>
        <ellipse cx="63" cy="44" rx="7" ry="7" fill={`hsl(${hue},100%,65%)`} style={{ filter: `drop-shadow(0 0 5px hsl(${hue},100%,65%))` }}/>
        <circle cx="39" cy="46" r="3" fill="#000"/>
        <circle cx="65" cy="46" r="3" fill="#000"/>
        {/* Signal bars */}
        <rect x="43" y="57" width="4" height="7"  rx="2" fill={`hsl(${hue},100%,70%)`} opacity="0.5"/>
        <rect x="49" y="54" width="4" height="10" rx="2" fill={`hsl(${hue},100%,70%)`} opacity="0.75"/>
        <rect x="55" y="51" width="4" height="13" rx="2" fill={`hsl(${hue},100%,70%)`}/>
        {/* Scan line */}
        {frame % 30 < 12 && <rect x="14" y={38 + (frame % 30) * 2.5} width="72" height="1" fill={`hsl(${hue},100%,80%)`} opacity="0.15"/>}
      </svg>
    </div>
  );
}

// ── TERMINAL BOOT ──────────────────────────────────────────────
function Terminal({ onDone }: { onDone: () => void }) {
  const [lines, setLines] = useState<{ text: string; color: string }[]>([]);
  // Boot flavour only. The earlier script narrated invented archive figures
  // (12,847 projects, 394 revivals, 97 founder slots) as if they were scan
  // results, which is the same fabricated proof the hero no longer prints.
  const SCRIPT = [
    { text: 'REBOOT_OS v4.0.0 — INITIALIZING...', color: '#00FFFF', t: 0 },
    { text: '> mounting /graveyard/ideas...', color: 'rgba(255,255,255,0.45)', t: 500 },
    { text: '> scanning the graveyard for unfinished work...', color: 'rgba(255,255,255,0.45)', t: 1000 },
    { text: '> [ERROR] some ideas refuse to stay dead', color: '#FF4444', t: 1500 },
    { text: '> loading revival module...', color: 'rgba(255,255,255,0.45)', t: 2000 },
    { text: '> [WARN] the archive is empty until someone buries something here', color: '#FFE000', t: 2400 },
    { text: '> connecting to the void...', color: 'rgba(255,255,255,0.45)', t: 2800 },
    { text: '> [OK] GRAVEYARD ONLINE. welcome back.', color: '#00FF88', t: 3200 },
  ];
  useEffect(() => {
    setLines([]);
    const timers: number[] = [];
    SCRIPT.forEach((l, i) => {
      timers.push(window.setTimeout(() => {
        setLines(p => [...p, { text: l.text, color: l.color }]);
        if (i === SCRIPT.length - 1) timers.push(window.setTimeout(onDone, 500));
      }, l.t));
    });
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [onDone]);

  return (
    <div style={{
      fontFamily: MONO, fontSize: 13, lineHeight: 2.1,
      maxWidth: 540, textAlign: 'left',
      background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0,255,255,0.15)',
      borderRadius: 8, padding: '20px 24px',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 0 40px rgba(0,255,255,0.08)',
    }}>
      {/* Terminal header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {['#FF4444','#FFE000','#00FF88'].map(c => (
          <div key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c, boxShadow: `0 0 4px ${c}` }} />
        ))}
        <span style={{ marginLeft: 8, fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>reboot_os — bash</span>
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ color: l.color, textShadow: l.color !== 'rgba(255,255,255,0.45)' ? `0 0 8px ${l.color}` : 'none', animation: 'slideRight 0.2s ease both' }}>
          {l.text}
          {i === lines.length - 1 && <span style={{ display: 'inline-block', width: 8, height: 14, background: l.color, marginLeft: 4, animation: 'blink 0.7s step-end infinite', verticalAlign: 'middle' }} />}
        </div>
      ))}
    </div>
  );
}

// ── COUNT UP ───────────────────────────────────────────────────
function CountUp({ to, prefix = '', suffix = '' }: { to: number; prefix?: string; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const s = Date.now(); const D = 1600;
    const iv = setInterval(() => {
      const p = Math.min(1, (Date.now() - s) / D);
      setV(Math.floor((1 - Math.pow(1 - p, 3)) * to));
      if (p >= 1) clearInterval(iv);
    }, 16);
    return () => clearInterval(iv);
  }, [to]);
  return <>{prefix}{v.toLocaleString()}{suffix}</>;
}

// ── AUTH FORM ──────────────────────────────────────────────────
export function AuthForm({ mode, onSuccess, onGuest, onToggle, guestLabel = 'browse as ghost — no account' }: {
  mode: 'signin' | 'signup'; onSuccess: () => void; onGuest: () => void; onToggle: () => void; guestLabel?: string;
}) {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setLoading(true);
    const error = mode === 'signin' ? await signIn(email, password) : await signUp(email, password, username);
    setLoading(false);
    if (error) setErr(error); else onSuccess();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'rgba(0,255,255,0.03)',
    border: '1px solid rgba(0,255,255,0.15)',
    borderRadius: 6, padding: '11px 14px',
    color: '#E8E8FF', fontSize: 13, outline: 'none',
    fontFamily: MONO, letterSpacing: '0.04em',
    transition: 'all 0.2s',
  };
  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = '#00FFFF';
    e.target.style.boxShadow = '0 0 0 2px rgba(0,255,255,0.1), 0 0 16px rgba(0,255,255,0.08)';
  };
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = 'rgba(0,255,255,0.15)';
    e.target.style.boxShadow = 'none';
  };

  return (
    <div style={{
      background: 'rgba(3,3,12,0.97)',
      border: '1px solid rgba(0,255,255,0.2)',
      borderRadius: 10, padding: '32px 36px',
      width: '100%', maxWidth: 400,
      backdropFilter: 'blur(40px)',
      boxShadow: '0 0 60px rgba(0,255,255,0.06), 0 40px 100px rgba(0,0,0,0.95)',
      animation: 'authIn 0.45s cubic-bezier(0.16,1,0.3,1) both',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Animated corner brackets */}
      {(['tl','tr','bl','br'] as const).map(c => (
        <div key={c} style={{
          position: 'absolute',
          width: 20, height: 20,
          top: c[0] === 't' ? 10 : 'auto', bottom: c[0] === 'b' ? 10 : 'auto',
          left: c[1] === 'l' ? 10 : 'auto', right: c[1] === 'r' ? 10 : 'auto',
          borderTop: c[0] === 't' ? '2px solid #00FFFF' : 'none',
          borderBottom: c[0] === 'b' ? '2px solid #00FFFF' : 'none',
          borderLeft: c[1] === 'l' ? '2px solid #00FFFF' : 'none',
          borderRight: c[1] === 'r' ? '2px solid #00FFFF' : 'none',
          boxShadow: '0 0 6px rgba(0,255,255,0.4)',
          animation: 'cornerPulse 3s ease-in-out infinite',
        }} />
      ))}

      {/* Scan line */}
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.04) 3px,rgba(0,0,0,0.04) 4px)', pointerEvents: 'none', borderRadius: 10 }} />

      <div style={{ marginBottom: 24, position: 'relative' }}>
        <div style={{ fontSize: 9, fontFamily: MONO, letterSpacing: '0.15em', color: 'rgba(0,255,255,0.5)', textTransform: 'uppercase', marginBottom: 8 }}>
          SYS::AUTH_{mode === 'signin' ? 'LOGIN' : 'REGISTER'}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: '#E8E8FF', fontFamily: MONO, letterSpacing: '-0.01em', margin: 0 }}>
          {mode === 'signin' ? '> WELCOME BACK.' : '> JOIN THE GRAVEYARD.'}
        </h2>
        {mode === 'signup' && (
          <div style={{ marginTop: 10, padding: '7px 12px', background: 'rgba(255,224,0,0.06)', border: '1px solid rgba(255,224,0,0.25)', borderRadius: 5, fontSize: 11, fontFamily: MONO, color: '#FFE000', animation: 'founderAlert 2s ease-in-out infinite' }}>
            ⚡ FOUNDER CIRCLE — First 100 get legendary status
          </div>
        )}
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mode === 'signup' && (
          <div>
            <div style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', marginBottom: 5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Codename</div>
            <input style={inputStyle} placeholder="your_handle" value={username} onChange={e => setUsername(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
          </div>
        )}
        <div>
          <div style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', marginBottom: 5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Email Signal</div>
          <input style={inputStyle} type="email" placeholder="user@void.io" value={email} onChange={e => setEmail(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', marginBottom: 5, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Passkey</div>
          <div style={{ position: 'relative' }}>
            <input style={{ ...inputStyle, paddingRight: 44 }} type={showPw ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
            <button type="button" onClick={() => setShowPw(s => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(0,255,255,0.4)', display: 'flex' }}>
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {err && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'rgba(255,40,40,0.08)', border: '1px solid rgba(255,40,40,0.25)', borderRadius: 5, fontSize: 12, color: '#FF4444', fontFamily: MONO, animation: 'shake 0.35s ease' }}>
            <AlertCircle size={12} /> {err}
          </div>
        )}

        <button type="submit" disabled={loading || !email || !password} style={{
          padding: '12px', borderRadius: 6, marginTop: 4,
          background: email && password ? 'rgba(0,255,255,0.08)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${email && password ? 'rgba(0,255,255,0.4)' : 'rgba(255,255,255,0.06)'}`,
          color: email && password ? '#00FFFF' : 'rgba(255,255,255,0.15)',
          fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em',
          textShadow: email && password ? '0 0 10px #00FFFF' : 'none',
          boxShadow: email && password ? '0 0 20px rgba(0,255,255,0.15)' : 'none',
          transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {loading ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> AUTHENTICATING...</> : `► ${mode === 'signin' ? 'ENTER SYSTEM' : 'REGISTER IDENTITY'}`}
        </button>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0', opacity: 0.25 }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(0,255,255,0.3)' }} />
        <span style={{ fontSize: 9, fontFamily: MONO, letterSpacing: '0.1em' }}>OR</span>
        <div style={{ flex: 1, height: 1, background: 'rgba(0,255,255,0.3)' }} />
      </div>

      <button onClick={onGuest} style={{
        width: '100%', padding: '10px', borderRadius: 6,
        background: 'transparent', border: '1px solid rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.25)', fontSize: 11, fontFamily: MONO,
        letterSpacing: '0.1em', transition: 'all 0.15s', textTransform: 'uppercase',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,255,255,0.2)'; e.currentTarget.style.color = 'rgba(0,255,255,0.5)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
      >
        {guestLabel}
      </button>

      <p style={{ textAlign: 'center', marginTop: 14, fontSize: 10, fontFamily: MONO, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.06em' }}>
        {mode === 'signin' ? 'NO ACCOUNT? ' : 'HAVE ACCOUNT? '}
        <button onClick={onToggle} style={{ background: 'none', border: 'none', color: '#00FFFF', fontFamily: MONO, fontSize: 10, fontWeight: 700, textDecoration: 'underline', textShadow: '0 0 8px #00FFFF' }}>
          {mode === 'signin' ? 'REGISTER FREE' : 'SIGN IN'}
        </button>
      </p>
    </div>
  );
}

// ── MAIN INTRO ─────────────────────────────────────────────────
type Phase = 'boot' | 'hero' | 'auth';

export default function Intro({ onEnter }: { onEnter: () => void }) {
  const [phase, setPhase] = useState<Phase>('boot');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [stats, setStats] = useState<LandingStat[]>([]);

  const onDone = useCallback(() => setPhase('hero'), []);

  // The stat strip is whatever the archive can actually prove about itself, so
  // an empty array here means "nothing to claim yet" and the row is not drawn.
  useEffect(() => {
    let alive = true;
    void fetchLandingStats().then(rows => { if (alive) setStats(rows); });
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, overflow: 'hidden', background: '#02020C' }}>
      <VoidCanvas3D />

      {/* CRT vignette */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 110% 110% at 50% 50%, transparent 55%, rgba(0,0,0,0.75) 100%)', pointerEvents: 'none', zIndex: 2 }} />
      {/* Scanlines */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.07) 2px,rgba(0,0,0,0.07) 4px)', pointerEvents: 'none', zIndex: 2, opacity: 0.6 }} />

      {/* Status bar */}
      <div style={{ position: 'absolute', top: 14, left: 18, right: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, fontFamily: MONO, fontSize: 10, color: 'rgba(0,255,255,0.4)', letterSpacing: '0.1em' }}>
        <span style={{ animation: 'statusBlink 4s step-end infinite' }}>REBOOT_OS v4.0.0</span>
        <div style={{ display: 'flex', gap: 18 }}>
          <span><span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#00FF88', marginRight: 5, boxShadow: '0 0 5px #00FF88', animation: 'blink 2s step-end infinite' }} />ONLINE</span>
          <span>GRAVEYARD NODE</span>
          <span>{new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* ── BOOT ── */}
      {phase === 'boot' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, gap: 40 }}>
          <HoloGhost size={80} />
          <Terminal onDone={onDone} />
        </div>
      )}

      {/* ── HERO — SPLIT SCREEN ── */}
      {phase === 'hero' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>

          {/* Giant split-screen text */}
          <div style={{ width: '100%', maxWidth: 900, position: 'relative' }}>

            {/* SOME PROJECTS */}
            <div style={{ animation: 'slideFromLeft 0.8s cubic-bezier(0.16,1,0.3,1) both', overflow: 'hidden' }}>
              <p style={{
                fontFamily: MONO, fontSize: 'clamp(11px,1.4vw,18px)',
                letterSpacing: '0.35em', color: 'rgba(255,255,255,0.25)',
                textTransform: 'uppercase', marginBottom: 6,
              }}>
                SOME PROJECTS DIE.
              </p>
            </div>

            {/* REBOOT mega title */}
            <div style={{ position: 'relative', marginBottom: 16, lineHeight: 0.9 }}>
              <h1 style={{ fontSize: 'clamp(80px,13vw,160px)', fontWeight: 900, lineHeight: 0.9, letterSpacing: '-0.05em', margin: 0, position: 'relative' }}>
                <GlitchText text="REBOOT" delay={200} style={{
                  background: 'linear-gradient(135deg, #fff 0%, #00FFFF 35%, #FF00CC 65%, #00FF88 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  fontFamily: MONO, display: 'block',
                  filter: 'drop-shadow(0 0 40px rgba(0,255,255,0.3))',
                  animation: 'heroBurst 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s both',
                }} />
              </h1>
              {/* Ghost subtitle behind title */}
              <div style={{
                position: 'absolute', bottom: -8, right: 0,
                fontFamily: MONO, fontSize: 'clamp(60px,9vw,120px)',
                fontWeight: 900, letterSpacing: '-0.05em',
                color: 'transparent',
                WebkitTextStroke: '1px rgba(255,0,204,0.12)',
                animation: 'ghostTitle 0.9s cubic-bezier(0.16,1,0.3,1) 0.2s both',
                lineHeight: 0.9, userSelect: 'none',
              }}>REBOOT</div>
            </div>

            {/* Tagline */}
            <div style={{ animation: 'fadeUp 0.6s ease 0.5s both' }}>
              <p style={{ fontFamily: MONO, fontSize: 'clamp(13px,1.6vw,20px)', letterSpacing: '0.12em', color: '#00FFFF', textTransform: 'uppercase', fontWeight: 700, textShadow: '0 0 20px #00FFFF, 0 0 40px rgba(0,255,255,0.3)', animation: 'neonFlicker 8s infinite 2s' }}>
                SOME DESERVE A SECOND CHANCE.
              </p>
            </div>

            {/* Stats row — only drawn when the archive has real rows to count */}
            {stats.length > 0 && (
              <div style={{ display: 'flex', gap: 'clamp(20px,4vw,56px)', margin: '32px 0', animation: 'fadeUp 0.6s ease 0.65s both', flexWrap: 'wrap' }}>
                {stats.map(({ n, label, color }, i) => (
                  <div key={label} style={{ textAlign: 'center', position: 'relative' }}>
                    <div style={{ fontSize: 'clamp(24px,3.5vw,42px)', fontWeight: 900, fontFamily: MONO, color, textShadow: `0 0 20px ${color}`, letterSpacing: '-0.03em', lineHeight: 1 }}>
                      <CountUp to={n} />
                    </div>
                    <div style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em', marginTop: 6, textTransform: 'uppercase' }}>{label}</div>
                    {/* Underline accent */}
                    <div style={{ position: 'absolute', bottom: -8, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${color},transparent)`, animation: `statLine 1.5s ease ${0.8 + i * 0.15}s both` }} />
                  </div>
                ))}
              </div>
            )}

            {/* CTAs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, animation: 'fadeUp 0.6s ease 0.8s both', flexWrap: 'wrap' }}>
              <button onClick={() => setPhase('auth')} style={{
                padding: '14px 40px', borderRadius: 4,
                background: 'transparent', border: '1px solid #00FFFF',
                color: '#00FFFF', fontFamily: MONO, fontSize: 14, fontWeight: 700,
                letterSpacing: '0.15em', textTransform: 'uppercase',
                textShadow: '0 0 10px #00FFFF', cursor: 'none',
                boxShadow: '0 0 20px rgba(0,255,255,0.2), inset 0 0 20px rgba(0,255,255,0.04)',
                transition: 'all 0.2s', position: 'relative', overflow: 'hidden',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,255,255,0.08)'; e.currentTarget.style.boxShadow = '0 0 40px rgba(0,255,255,0.4), inset 0 0 30px rgba(0,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = '0 0 20px rgba(0,255,255,0.2), inset 0 0 20px rgba(0,255,255,0.04)'; e.currentTarget.style.transform = 'none'; }}
              >
                ► ENTER THE GRAVEYARD
              </button>
              <button onClick={onEnter} style={{
                background: 'none', border: 'none', fontFamily: MONO,
                fontSize: 11, letterSpacing: '0.12em', color: 'rgba(0,255,255,0.2)',
                textTransform: 'uppercase', transition: 'color 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.color = 'rgba(0,255,255,0.5)'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(0,255,255,0.2)'}
              >
                continue as ghost →
              </button>
              <a href="/beta/" style={{
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em',
                color: 'rgba(255,224,0,0.55)', textTransform: 'uppercase',
                textDecoration: 'none', transition: 'color 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.color = '#FFE000'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,224,0,0.55)'; }}
              >
                beta pre-registration ↗
              </a>
            </div>
          </div>

          {/* Rotating side label */}
          {[
            { text: 'A GRAVEYARD OF IDEAS', style: { left: '1.5%', top: '28%', transform: 'rotate(-90deg)' } },
            { text: 'A LAUNCHPAD FOR RESURRECTION', style: { right: '1.5%', top: '35%', transform: 'rotate(90deg)' } },
          ].map(({ text, style }) => (
            <div key={text} style={{ position: 'absolute', fontFamily: MONO, fontSize: 8, color: 'rgba(0,255,255,0.15)', letterSpacing: '0.25em', textTransform: 'uppercase', pointerEvents: 'none', whiteSpace: 'nowrap', ...style }}>{text}</div>
          ))}

          {/* Bottom ghost logo */}
          <div style={{ position: 'absolute', bottom: 24, right: 28, opacity: 0.15, animation: 'float 4s ease-in-out infinite' }}>
            <HoloGhost size={40} />
          </div>
        </div>
      )}

      {/* ── AUTH ── */}
      {phase === 'auth' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '0 24px' }}>
          <div style={{ opacity: 0.6, animation: 'fadeUp 0.3s ease both' }}><HoloGhost size={48} /></div>
          <AuthForm mode={authMode} onSuccess={onEnter} onGuest={onEnter} onToggle={() => setAuthMode(m => m === 'signin' ? 'signup' : 'signin')} />
          <button onClick={() => setPhase('hero')} style={{ background: 'none', border: 'none', fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: 'rgba(0,255,255,0.2)', textTransform: 'uppercase', transition: 'color 0.15s', animation: 'fadeUp 0.4s ease 0.2s both' }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(0,255,255,0.5)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(0,255,255,0.2)'}
          >
            ← BACK TO VOID
          </button>
        </div>
      )}

      <style>{`
        @keyframes blink        { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin         { to{transform:rotate(360deg)} }
        @keyframes orbitFwd     { to{transform:rotate(360deg)} }
        @keyframes orbitRev     { to{transform:rotate(-360deg)} }
        @keyframes heroBurst    { from{opacity:0;transform:scale(0.92) translateY(24px)} to{opacity:1;transform:none} }
        @keyframes ghostTitle   { from{opacity:0;transform:translateX(40px)} to{opacity:1;transform:none} }
        @keyframes fadeUp       { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideFromLeft{ from{opacity:0;transform:translateX(-30px)} to{opacity:1;transform:none} }
        @keyframes slideRight   { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:none} }
        @keyframes authIn       { from{opacity:0;transform:translateY(20px) scale(0.97)} to{opacity:1;transform:none} }
        @keyframes statusBlink  { 0%,94%{opacity:1} 95%,98%{opacity:0} 99%,100%{opacity:1} }
        @keyframes shake        { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
        @keyframes float        { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes statLine     { from{transform:scaleX(0)} to{transform:scaleX(1)} }
        @keyframes neonFlicker  { 0%,19%,21%,23%,25%,54%,56%,100%{opacity:1} 20%,24%,55%{opacity:0.5} }
        @keyframes founderAlert { 0%,100%{box-shadow:0 0 8px rgba(255,224,0,0.1)} 50%{box-shadow:0 0 20px rgba(255,224,0,0.3)} }
        @keyframes cornerPulse  { 0%,100%{opacity:0.7} 50%{opacity:1;box-shadow:0 0 10px rgba(0,255,255,0.6)} }
      `}</style>
    </div>
  );
}
