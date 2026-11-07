import { useEffect, useState } from 'react';
import { Users, DollarSign, TrendingUp, CheckCircle, Loader2, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Resurrection } from '../lib/supabase';

const MONO = "'Share Tech Mono', monospace";

function CountUp({ to, prefix = '', suffix = '', duration = 1600 }: { to: number; prefix?: string; suffix?: string; duration?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const s = Date.now();
    const iv = setInterval(() => {
      const p = Math.min(1, (Date.now() - s) / duration);
      setV(Math.floor((1 - (1 - p) ** 3) * to));
      if (p >= 1) clearInterval(iv);
    }, 16);
    return () => clearInterval(iv);
  }, [to, duration]);
  return <>{prefix}{v.toLocaleString()}{suffix}</>;
}

function ResurrectionCard({ r, i }: { r: Resurrection; i: number }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '24px', borderRadius: 14,
        background: hover
          ? 'linear-gradient(135deg, rgba(0,255,136,0.04) 0%, rgba(0,255,255,0.03) 100%)'
          : 'rgba(255,255,255,0.02)',
        border: `1px solid ${hover ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.06)'}`,
        transition: 'all 0.25s cubic-bezier(0.16,1,0.3,1)',
        transform: hover ? 'translateY(-4px) translateZ(4px)' : 'none',
        boxShadow: hover ? '0 20px 60px rgba(0,0,0,0.5), 0 0 30px rgba(0,255,136,0.06)' : 'none',
        position: 'relative', overflow: 'hidden',
        animation: `fadeUp 0.5s ease ${i * 0.1}s both`,
      }}
    >
      {/* Glow accent top */}
      {hover && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,#00FF88,transparent)' }} />
      )}

      {/* Verified badge */}
      {r.verified && (
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 99, background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.2)' }}>
          <CheckCircle size={9} style={{ color: '#00FF88' }} />
          <span style={{ fontSize: 9, fontFamily: MONO, color: '#00FF88', letterSpacing: '0.08em' }}>VERIFIED</span>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
          Successfully Revived
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 800, color: '#E8E8FF', letterSpacing: '-0.02em', marginBottom: 6, lineHeight: 1.1 }}>
          {r.original_title}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: MONO }}>
            by {r.original_founder}
          </span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: MONO }}>
            abandoned
          </span>
        </div>
      </div>

      {/* Revival path */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18 }}>☠</div>
          <div style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>DEAD</div>
        </div>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg,rgba(255,40,40,0.3),var(--cyan),rgba(0,255,136,0.8))', position: 'relative' }}>
          <div style={{ position: 'absolute', top: -5, left: '50%', transform: 'translateX(-50%)', fontSize: 9, fontFamily: MONO, color: 'var(--cyan)', whiteSpace: 'nowrap' }}>
            {r.months_to_revival}mo to revival
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, filter: 'drop-shadow(0 0 8px #00FF88)' }}>⚡</div>
          <div style={{ fontSize: 9, fontFamily: MONO, color: '#00FF88', marginTop: 2, textShadow: '0 0 6px #00FF88' }}>ALIVE</div>
        </div>
      </div>

      {/* Reviver */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg,rgba(0,255,255,0.2),rgba(255,0,204,0.2))',
          border: '1px solid rgba(0,255,136,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 700, fontFamily: MONO, color: '#E8E8FF',
          boxShadow: '0 0 10px rgba(0,255,136,0.15)',
        }}>
          {r.reviver_name[0]}
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#E8E8FF' }}>Revived by {r.reviver_name}</p>
          {r.reviver_handle && <p style={{ fontSize: 11, fontFamily: MONO, color: 'var(--cyan)', marginTop: 1 }}>{r.reviver_handle}</p>}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {r.current_users > 0 && (
          <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'rgba(68,136,255,0.06)', border: '1px solid rgba(68,136,255,0.15)', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, fontFamily: MONO, color: '#4488FF', textShadow: '0 0 10px #4488FF' }}>
              <CountUp to={r.current_users} duration={1400} />
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', marginTop: 3 }}>USERS</div>
          </div>
        )}
        {r.current_mrr > 0 && (
          <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.15)', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, fontFamily: MONO, color: '#00FF88', textShadow: '0 0 10px #00FF88' }}>
              <CountUp to={r.current_mrr} prefix="$" duration={1600} />
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', marginTop: 3 }}>MRR</div>
          </div>
        )}
      </div>

      {/* Story */}
      {r.story && (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, borderLeft: '2px solid rgba(0,255,136,0.3)', paddingLeft: 12, fontStyle: 'italic' }}>
          "{r.story}"
        </p>
      )}
    </div>
  );
}

export default function Resurrections() {
  const [resurrections, setResurrections] = useState<Resurrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase.from('resurrections').select('*').order('current_users', { ascending: false });
        if (queryError) throw queryError;
        if (active) setResurrections((data as Resurrection[]) ?? []);
      } catch {
        if (active) setError('Resurrection stories could not be loaded. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [retry]);

  const totalUsers = resurrections.reduce((a, r) => a + r.current_users, 0);
  const totalMRR   = resurrections.reduce((a, r) => a + r.current_mrr,   0);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>
      {/* Ambient */}
      <div style={{ position: 'absolute', top: -80, left: '30%', width: 600, height: 300, background: 'radial-gradient(ellipse,rgba(0,255,136,0.05),transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />
      <div className="grid-bg scan-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '24px 32px 0', position: 'relative', zIndex: 2 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 22, filter: 'drop-shadow(0 0 12px #00FF88)', animation: 'legendFloat 3s ease-in-out infinite' }}>⚡</span>
            <h1 style={{ fontSize: 22, fontWeight: 900, fontFamily: MONO, letterSpacing: '0.06em' }}>
              <span style={{ background: 'linear-gradient(135deg,#00FF88,var(--cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                HALL OF RESURRECTIONS
              </span>
            </h1>
          </div>
          <p style={{ fontSize: 11, fontFamily: MONO, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.06em' }}>
            Projects brought back from the dead. These stories sell Reboot better than any landing page.
          </p>
        </div>

        {/* Global stats */}
        {!loading && !error && resurrections.length > 0 && (
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { icon: Star,        val: resurrections.length,       suffix: '',    label: 'REVIVED',     color: '#00FF88' },
              { icon: Users,       val: totalUsers,                 suffix: '',    label: 'TOTAL USERS', color: '#4488FF' },
              { icon: DollarSign,  val: totalMRR,                   suffix: '',    label: 'TOTAL MRR',   color: '#FFE000', prefix: '$' },
              { icon: TrendingUp,  val: resurrections.filter(r=>r.verified).length, suffix: '', label: 'VERIFIED', color: '#AA44FF' },
            ].map(s => (
              <div key={s.label} style={{
                padding: '10px 18px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10,
                background: `rgba(${s.color === '#00FF88' ? '0,255,136' : s.color === '#4488FF' ? '68,136,255' : s.color === '#FFE000' ? '255,224,0' : '170,68,255'},0.05)`,
                border: `1px solid ${s.color}22`,
              }}>
                <s.icon size={13} style={{ color: s.color }} />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, fontFamily: MONO, color: s.color, textShadow: `0 0 8px ${s.color}`, lineHeight: 1 }}>
                    {s.prefix ?? ''}<CountUp to={s.val} suffix={s.suffix} />
                  </div>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em' }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 32px 32px', position: 'relative', zIndex: 2 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 16 }}>
            <div style={{ position: 'relative', width: 48, height: 48 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(0,255,136,0.3)', animation: 'spin 1.5s linear infinite' }} />
              <Loader2 size={18} style={{ position: 'absolute', inset: 0, margin: 'auto', color: '#00FF88' }} />
            </div>
            <p style={{ fontSize: 11, fontFamily: MONO, color: 'rgba(0,255,136,0.4)', letterSpacing: '0.12em' }}>LOADING RESURRECTIONS...</p>
          </div>
        ) : error ? (
          <div role="alert" style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontFamily: MONO, fontSize: 13, color: '#E8E8FF' }}>{error}</p>
            <button type="button" onClick={() => setRetry(value => value + 1)} style={{ marginTop: 16, padding: '10px 18px', borderRadius: 8, border: '1px solid rgba(0,255,136,0.4)', background: 'rgba(0,255,136,0.08)', color: '#00FF88', cursor: 'pointer' }}>
              Try again
            </button>
          </div>
        ) : resurrections.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🧟</div>
            <p style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(255,255,255,0.15)', letterSpacing: '0.1em' }}>NO RESURRECTIONS YET.</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.1)', marginTop: 8 }}>Be the first to revive something.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 16 }}>
            {resurrections.map((r, i) => (
              <ResurrectionCard key={r.id} r={r} i={i} />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin        { to { transform: rotate(360deg); } }
        @keyframes legendFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes fadeUp      { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
