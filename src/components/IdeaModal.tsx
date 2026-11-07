import { useEffect, useRef, useState } from 'react';
import {
  X, TrendingUp, Eye, Users, Clock, Zap,
  GitBranch, DollarSign, Calendar, AlertTriangle,
  CheckCircle, XCircle, Gift, Package, ArrowRight, Send,
  Loader2, MessageSquare, ThumbsUp, Cpu, Target
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useAccountGate } from '../lib/auth-gate';
import type { Idea, TimelineEvent, RevivalBounty, TimeCapsule } from '../lib/supabase';

/* ─── helpers ─────────────────────── */
const MONO = "'Share Tech Mono', monospace";

const FAILURE_EMOTION_MAP: Record<string, { icon: string; label: string; color: string }> = {
  burnout:    { icon: '😔', label: 'Burnout',        color: '#FF6B6B' },
  money:      { icon: '💸', label: 'Funding',         color: '#FFE000' },
  interest:   { icon: '❤️', label: 'Lost Interest',  color: '#FF88AA' },
  team:       { icon: '👥', label: 'Team Split',      color: '#AA44FF' },
  school:     { icon: '📚', label: 'School',          color: '#4488FF' },
  family:     { icon: '👶', label: 'Family',          color: '#00FF88' },
  job:        { icon: '💼', label: 'Got a Job',       color: '#00FFCC' },
  legal:      { icon: '⚖️', label: 'Legal Issues',   color: '#FF4444' },
  market:     { icon: '🧪', label: 'Bad Market',      color: '#FF8800' },
  technical:  { icon: '🔧', label: 'Technical Debt',  color: '#8890B0' },
};

/* ─── TAB TYPES ───────────────────── */
type Tab = 'story' | 'capsule' | 'ai' | 'revive';

/* ─── COMPONENT: Timeline ─────────── */
function LifelineTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return (
    <div style={{ textAlign: 'center', padding: '20px 0', opacity: 0.3 }}>
      <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em' }}>NO TIMELINE RECORDED</p>
    </div>
  );
  return (
    <div style={{ position: 'relative', padding: '0 0 8px' }}>
      {/* Vertical line */}
      <div style={{
        position: 'absolute', left: 20, top: 8, bottom: 8, width: 1,
        background: 'linear-gradient(180deg, var(--cyan), var(--pink), transparent)',
        opacity: 0.3,
      }} />

      {events.map((ev, i) => (
        <div key={ev.id ?? i} style={{
          display: 'flex', gap: 16, marginBottom: 20, position: 'relative',
          animation: `fadeUp 0.4s ease ${i * 0.06}s both`,
        }}>
          {/* Node */}
          <div style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
            background: 'var(--surface2)',
            border: ev.label.toLowerCase().includes('archive') || ev.label.toLowerCase().includes('dead')
              ? '1px solid rgba(255,40,40,0.4)'
              : ev.label.toLowerCase().includes('reviv') || ev.label.toLowerCase().includes('launch')
              ? '1px solid rgba(0,255,136,0.4)'
              : '1px solid rgba(0,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, position: 'relative', zIndex: 1,
            boxShadow: '0 0 12px rgba(0,0,0,0.5)',
          }}>
            {ev.emoji}
          </div>

          {/* Content */}
          <div style={{ flex: 1, paddingTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#E8E8FF', fontFamily: MONO }}>{ev.label}</span>
              {ev.milestone_date && (
                <span style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.4)', letterSpacing: '0.06em' }}>
                  {ev.milestone_date}
                </span>
              )}
            </div>
            {ev.description && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{ev.description}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── COMPONENT: Surviving Assets ─── */
function SurvivingAssets({ assets }: { assets: { label: string; exists: boolean }[] }) {
  if (!assets.length) return null;
  return (
    <div>
      <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.12em', marginBottom: 10, textTransform: 'uppercase' }}>
        What Survived
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {assets.map((a, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 6,
            background: a.exists ? 'rgba(0,255,136,0.04)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${a.exists ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.06)'}`,
          }}>
            {a.exists
              ? <CheckCircle size={12} style={{ color: '#00FF88', flexShrink: 0 }} />
              : <XCircle size={12} style={{ color: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
            }
            <span style={{
              fontSize: 12, fontFamily: MONO, letterSpacing: '0.04em',
              color: a.exists ? '#E8E8FF' : 'rgba(255,255,255,0.2)',
            }}>{a.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── COMPONENT: Revival Bounty ───── */
function BountyCard({ bounty }: { bounty: RevivalBounty }) {
  const hasBounty = bounty.mentorship || bounty.domain_handover || bounty.github_handover || bounty.equity_offer || bounty.cash_bounty > 0 || bounty.custom_offer;
  if (!hasBounty) return null;

  return (
    <div style={{
      padding: '16px 20px', borderRadius: 10,
      background: 'linear-gradient(135deg, rgba(255,224,0,0.05) 0%, rgba(255,102,0,0.03) 100%)',
      border: '1px solid rgba(255,224,0,0.25)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,224,0,0.08), transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Gift size={16} style={{ color: '#FFE000', filter: 'drop-shadow(0 0 6px #FFE000)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: '#FFE000', textShadow: '0 0 8px #FFE000', letterSpacing: '0.06em' }}>
          REVIVAL BOUNTY AVAILABLE
        </span>
      </div>

      {bounty.milestone_trigger && (
        <p style={{ fontSize: 11, color: 'rgba(255,224,0,0.6)', fontFamily: MONO, marginBottom: 10, letterSpacing: '0.04em' }}>
          If you: <span style={{ color: '#FFE000' }}>{bounty.milestone_trigger}</span>
        </p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {bounty.mentorship && (
          <span style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(255,224,0,0.08)', border: '1px solid rgba(255,224,0,0.2)', fontSize: 11, fontFamily: MONO, color: '#FFE000' }}>
            🤝 Mentorship
          </span>
        )}
        {bounty.domain_handover && (
          <span style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(255,224,0,0.08)', border: '1px solid rgba(255,224,0,0.2)', fontSize: 11, fontFamily: MONO, color: '#FFE000' }}>
            🌐 Domain Handover
          </span>
        )}
        {bounty.github_handover && (
          <span style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(255,224,0,0.08)', border: '1px solid rgba(255,224,0,0.2)', fontSize: 11, fontFamily: MONO, color: '#FFE000' }}>
            🐙 GitHub Repo
          </span>
        )}
        {bounty.cash_bounty > 0 && (
          <span style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(255,224,0,0.08)', border: '1px solid rgba(255,224,0,0.2)', fontSize: 11, fontFamily: MONO, color: '#FFE000' }}>
            💰 ${bounty.cash_bounty.toLocaleString()} Cash
          </span>
        )}
        {bounty.equity_offer && (
          <span style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(255,224,0,0.08)', border: '1px solid rgba(255,224,0,0.2)', fontSize: 11, fontFamily: MONO, color: '#FFE000' }}>
            📈 {bounty.equity_offer}
          </span>
        )}
        {bounty.custom_offer && (
          <span style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(255,224,0,0.08)', border: '1px solid rgba(255,224,0,0.2)', fontSize: 11, fontFamily: MONO, color: 'rgba(255,224,0,0.7)' }}>
            {bounty.custom_offer}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── COMPONENT: DNA Stats ──────────*/
function DNAStats({ idea }: { idea: Idea }) {
  const stats = [
    { icon: Calendar,    label: 'MONTHS BUILT',   val: idea.months_built   ? `${idea.months_built}mo`       : idea.time_invested || '—',    color: '#00FFCC' },
    { icon: GitBranch,   label: 'COMMITS',         val: idea.commits_count  ? idea.commits_count.toLocaleString() : '—',                      color: '#AA44FF' },
    { icon: Users,       label: 'USERS REACHED',   val: idea.users_count    ? idea.users_count.toLocaleString()  : '—',                      color: '#4488FF' },
    { icon: DollarSign,  label: 'REVENUE MADE',    val: idea.revenue_made   ? `$${idea.revenue_made.toLocaleString()}` : '—',                 color: '#FFE000' },
  ];
  return (
    <div>
      <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.12em', marginBottom: 10, textTransform: 'uppercase' }}>
        Project DNA
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
        {stats.map(s => (
          <div key={s.label} style={{
            padding: '12px 14px', borderRadius: 8,
            background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <s.icon size={14} style={{ color: s.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: MONO, color: s.color, textShadow: `0 0 8px ${s.color}` }}>{s.val}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', marginTop: 1 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── COMPONENT: Letter to Founder ── */
function LetterToFounder({ text, creator }: { text: string; creator: string }) {
  if (!text) return null;
  return (
    <div style={{
      padding: '18px 20px 14px', borderRadius: 10,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.08)',
      position: 'relative',
    }}>
      <div style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(0,255,255,0.4)', letterSpacing: '0.12em', marginBottom: 12, textTransform: 'uppercase' }}>
        ✉️ Letter to the Next Founder
      </div>
      <blockquote style={{
        fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.6)',
        fontStyle: 'italic', borderLeft: '2px solid var(--cyan)',
        paddingLeft: 14, margin: 0,
      }}>
        "{text}"
      </blockquote>
      <p style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,255,255,0.2)', marginTop: 10, textAlign: 'right' }}>
        — {creator}
      </p>
    </div>
  );
}

/* ─── COMPONENT: Comments ────────── */
interface CommentRow {
  id: string
  author_name: string
  content: string
  created_at: string
}

function Comments({ ideaId }: { ideaId: string }) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const { requireAccount } = useAccountGate();

  useEffect(() => {
    supabase.from('comments').select('*').eq('idea_id', ideaId).order('created_at', { ascending: false })
      .then(({ data }) => setComments(data ?? []));
  }, [ideaId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    if (!requireAccount('comment')) return;
    setSubmitting(true);
    await supabase.from('comments').insert({ idea_id: ideaId, author_name: name || 'Anonymous', content });
    const { data } = await supabase.from('comments').select('*').eq('idea_id', ideaId).order('created_at', { ascending: false });
    setComments(data ?? []);
    setContent(''); setName('');
    setSubmitting(false);
  };

  return (
    <div>
      <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.12em', marginBottom: 12, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
        <MessageSquare size={12} /> {comments.length} Comments
      </div>

      <form onSubmit={submit} style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input className="input" style={{ fontSize: 12 }} placeholder="Your name (optional)" value={name} onChange={e => setName(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" style={{ flex: 1, fontSize: 12 }} placeholder="Leave a comment..." value={content} onChange={e => setContent(e.target.value)} />
          <button type="submit" disabled={!content.trim() || submitting} style={{
            padding: '0 16px', borderRadius: 6,
            background: content.trim() ? 'rgba(0,255,255,0.08)' : 'transparent',
            border: `1px solid ${content.trim() ? 'rgba(0,255,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
            color: content.trim() ? 'var(--cyan)' : 'rgba(255,255,255,0.15)',
            cursor: content.trim() ? 'none' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6,
            transition: 'all 0.15s',
          }}>
            {submitting ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Send size={13} />}
          </button>
        </div>
      </form>

      {!user && (
        <p style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,224,0,0.5)', letterSpacing: '0.05em', marginTop: -4, marginBottom: 14, lineHeight: 1.6 }}>
          COMMENTS NEED A FREE ACCOUNT — PRESS SEND AND THE SIGN-IN PANEL OPENS. YOUR TEXT STAYS PUT.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {comments.map(c => (
          <div key={c.id} style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: MONO, color: 'var(--cyan)' }}>{c.author_name}</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: MONO }}>
                {new Date(c.created_at).toLocaleDateString()}
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{c.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── COMPONENT: Time Capsule tab ─── */
function TimeCapsuleView({ capsule }: { capsule: TimeCapsule | null }) {
  if (!capsule) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.15)' }}>
      <Package size={36} style={{ margin: '0 auto 16px' }} />
      <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em' }}>NO TIME CAPSULE PRESERVED</p>
      <p style={{ fontSize: 12, marginTop: 8, color: 'rgba(255,255,255,0.1)' }}>The founder didn't leave a capsule for this project.</p>
    </div>
  );

  const links = [
    { icon: '🐙', label: 'GitHub Repo',  url: capsule.repo_url },
    { icon: '▶️', label: 'Demo',         url: capsule.demo_url },
    { icon: '🎨', label: 'Figma',        url: capsule.figma_url },
    { icon: '🌐', label: 'Domain',       url: capsule.domain ? `https://${capsule.domain}` : '' },
  ].filter(l => l.url);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderRadius: 10,
        background: 'linear-gradient(135deg, rgba(0,255,255,0.04) 0%, rgba(170,68,255,0.04) 100%)',
        border: '1px solid rgba(0,255,255,0.15)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Package size={20} style={{ color: 'var(--cyan)', flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: 'var(--cyan)', letterSpacing: '0.06em' }}>TIME CAPSULE</p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Everything you need to understand what this project was.</p>
        </div>
      </div>

      {/* Links */}
      {links.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>Assets</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {links.map(l => (
              <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 6,
                background: 'rgba(0,255,255,0.04)', border: '1px solid rgba(0,255,255,0.2)',
                fontSize: 12, fontFamily: MONO, color: 'var(--cyan)',
                textDecoration: 'none', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,255,255,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,255,255,0.04)'; }}
              >
                <span>{l.icon}</span> {l.label}
                <ArrowRight size={10} />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Last commit */}
      {capsule.last_commit_date && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: MONO }}>
          <GitBranch size={13} />
          Last commit: <span style={{ color: 'var(--cyan)' }}>{capsule.last_commit_date}</span>
        </div>
      )}

      {/* Lessons learned */}
      {capsule.lessons_learned && (
        <div>
          <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>Lessons Learned</div>
          <div style={{ padding: '14px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
            {capsule.lessons_learned}
          </div>
        </div>
      )}

      {/* README */}
      {capsule.readme_text && (
        <div>
          <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>README / Notes</div>
          <div style={{ padding: '14px 16px', borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, fontFamily: MONO, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
            {capsule.readme_text}
          </div>
        </div>
      )}

      {/* Final message */}
      {capsule.final_message && (
        <div style={{ padding: '16px 18px', borderRadius: 10, background: 'rgba(255,0,204,0.04)', border: '1px solid rgba(255,0,204,0.2)' }}>
          <div style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(255,0,204,0.5)', letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase' }}>📡 Final Transmission</div>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' }}>"{capsule.final_message}"</p>
        </div>
      )}
    </div>
  );
}

/* ─── COMPONENT: Revive tab ──────── */
function ReviveTab({ idea }: { idea: Idea }) {
  const [form, setForm] = useState({ name: '', email: '', message: '', plan: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const { user } = useAuth();
  const { requireAccount } = useAccountGate();

  // Signing in through the account panel keeps this form mounted, so the
  // identity fields fill themselves in and the pitch survives.
  useEffect(() => {
    if (!user) return;
    setForm(f => ({
      ...f,
      name: f.name || (user.user_metadata?.username as string | undefined) || '',
      email: f.email || user.email || '',
    }));
  }, [user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAccount('revive')) return;
    if (!form.name || !form.email || !form.message) { setErr('Fill in the required fields.'); return; }
    setSubmitting(true); setErr('');
    const { error } = await supabase.from('revivals').insert({
      idea_id: idea.id, reviver_name: form.name, reviver_email: form.email,
      message: form.message, plan: form.plan,
    });
    if (error) { setErr(error.message); setSubmitting(false); return; }
    // The database records a unique revival signal with this proposal transaction.
    setDone(true); setSubmitting(false);
  };

  if (done) return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{ fontSize: 40, marginBottom: 16, animation: 'legendFloat 3s ease-in-out infinite' }}>⚡</div>
      <p style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, color: 'var(--cyan)', textShadow: '0 0 12px var(--cyan)', marginBottom: 8 }}>REVIVAL SIGNAL SENT</p>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Your interest has been recorded. The project lives on.</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ padding: '14px 16px', borderRadius: 8, background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.2)' }}>
        <p style={{ fontSize: 12, color: 'rgba(0,255,136,0.8)', fontFamily: MONO, letterSpacing: '0.04em', lineHeight: 1.6 }}>
          You're about to signal intent to revive <strong style={{ color: '#00FF88' }}>{idea.title}</strong>. Tell the original founder why you're the one.
        </p>
      </div>

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>YOUR NAME *</label>
            <input className="input" style={{ fontSize: 12 }} placeholder="Builder name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>EMAIL *</label>
            <input className="input" type="email" style={{ fontSize: 12 }} placeholder="contact@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>WHY YOU? *</label>
          <textarea className="input" style={{ resize: 'vertical', minHeight: 80, fontSize: 12, fontFamily: 'Inter, sans-serif' }} placeholder="What makes you the right person to revive this?" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
        </div>
        <div>
          <label style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.08em', display: 'block', marginBottom: 5 }}>YOUR PLAN (optional)</label>
          <textarea className="input" style={{ resize: 'vertical', minHeight: 60, fontSize: 12, fontFamily: 'Inter, sans-serif' }} placeholder="How would you approach the revival?" value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))} />
        </div>
        {err && <p style={{ fontSize: 12, color: '#FF4444', fontFamily: MONO }}>{err}</p>}
        {!user && (
          <p style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,224,0,0.5)', letterSpacing: '0.05em', lineHeight: 1.6 }}>
            REVIVAL SIGNALS ARE SIGNED — PRESS SEND AND THE ACCOUNT PANEL OPENS. YOUR PITCH STAYS PUT.
          </p>
        )}
        <button type="submit" disabled={submitting} className="btn-primary" style={{ alignSelf: 'flex-start', gap: 8 }}>
          {submitting ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Zap size={14} />}
          {submitting ? 'SENDING...' : 'SIGNAL REVIVAL'}
        </button>
      </form>
    </div>
  );
}

/* ─── MAIN MODAL ──────────────────── */
export default function IdeaModal({ idea, onClose }: { idea: Idea; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('story');
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [bounty, setBounty] = useState<RevivalBounty | null>(null);
  const [capsule, setCapsule] = useState<TimeCapsule | null>(null);
  const [upvoted, setUpvoted] = useState(false);
  const [upvotes, setUpvotes] = useState(idea.upvotes);
  const countedViewFor = useRef<string | null>(null);
  const {user} = useAuth();
  const userId=user?.id;
  const {requireAccount} = useAccountGate();
  const [voteError,setVoteError] = useState('');
  const [voting,setVoting] = useState(false);

  useEffect(() => {
    // Public browsing stays open; only authenticated, deduplicated views count.
    const viewKey=userId ? `${userId}:${idea.id}` : null;
    if (viewKey && countedViewFor.current !== viewKey) {
      countedViewFor.current=viewKey;
      supabase.rpc('record_idea_signal',{p_idea_id:idea.id,p_kind:'view'})
        .then(() => undefined, () => undefined);
    }

    // Load extras in parallel
    Promise.all([
      supabase.from('project_timeline').select('*').eq('idea_id', idea.id).order('sort_order'),
      supabase.from('revival_bounty').select('*').eq('idea_id', idea.id).maybeSingle(),
      supabase.from('time_capsule').select('*').eq('idea_id', idea.id).maybeSingle(),
    ]).then(([{ data: tl }, { data: rb }, { data: tc }]) => {
      setTimeline((tl as TimelineEvent[]) ?? []);
      setBounty(rb as RevivalBounty | null);
      setCapsule(tc as TimeCapsule | null);
    });
  }, [idea.id,userId]);

  const handleUpvote = async () => {
    if (upvoted || voting || !requireAccount('vote')) return;
    setVoting(true);setVoteError('');
    try {
      const {data,error}=await supabase.rpc('record_idea_signal',{p_idea_id:idea.id,p_kind:'support'});
      if(error)throw error;
      setUpvotes(data.upvotes);setUpvoted(data.supported);
    }catch(error){setVoteError(error instanceof Error?error.message:'Unable to record support.');}
    finally{setVoting(false);}
  };

  const emotion = idea.failure_emotion ? FAILURE_EMOTION_MAP[idea.failure_emotion] : null;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'story',   label: 'STORY' },
    { id: 'capsule', label: 'CAPSULE' },
    { id: 'ai',      label: 'AI LAB' },
    { id: 'revive',  label: 'REVIVE' },
  ];

  const categoryGradients: Record<string, string> = {
    ai: 'linear-gradient(135deg,rgba(68,136,255,0.4),rgba(170,68,255,0.2))',
    games: 'linear-gradient(135deg,rgba(255,102,0,0.4),rgba(255,0,204,0.2))',
    apps: 'linear-gradient(135deg,rgba(0,255,255,0.3),rgba(68,136,255,0.2))',
    business: 'linear-gradient(135deg,rgba(255,224,0,0.3),rgba(255,102,0,0.2))',
    education: 'linear-gradient(135deg,rgba(0,255,136,0.3),rgba(0,255,255,0.2))',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }} onClick={onClose}>
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(24px)' }} />

      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 780,
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          background: 'var(--surface)', border: '1px solid rgba(0,255,255,0.12)',
          borderRadius: 16,
          boxShadow: '0 0 0 1px rgba(0,255,255,0.05), 0 40px 120px rgba(0,0,0,0.9), 0 0 60px rgba(0,255,255,0.04)',
          animation: 'scaleIn 0.3s cubic-bezier(0.16,1,0.3,1) both',
          overflow: 'hidden',
        }}
      >
        {/* Hero */}
        <div style={{ position: 'relative', height: 200, flexShrink: 0, overflow: 'hidden' }}>
          {idea.cover_url
            ? <img src={idea.cover_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.35) saturate(0.5) hue-rotate(200deg)' }} />
            : <div style={{ position: 'absolute', inset: 0, background: categoryGradients[idea.category] ?? categoryGradients.ai }} />
          }
          {/* Scanlines */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.08) 3px,rgba(0,0,0,0.08) 4px)', pointerEvents: 'none' }} />
          {/* Gradient overlay */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(10,10,22,0) 0%, rgba(10,10,22,0.7) 70%, rgba(10,10,22,1) 100%)' }} />

          {/* Close */}
          <button onClick={onClose} style={{
            position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 8,
            background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,40,40,0.5)'; e.currentTarget.style.color = '#FF4444'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
          >
            <X size={14} />
          </button>

          {/* Status chips */}
          <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', gap: 6 }}>
            <span className={`chip chip-${idea.status}`}>
              {idea.status === 'abandoned' ? '☠ Dead' : idea.status === 'seeking' ? '⚡ Seeking Revival' : idea.status === 'in_progress' ? '🛠 Active' : '🟢 Revived'}
            </span>
            {idea.almost_made_it && (
              <span style={{ padding: '2px 10px', borderRadius: 3, fontSize: 10, fontWeight: 700, fontFamily: MONO, letterSpacing: '0.08em', background: 'rgba(255,102,0,0.12)', border: '1px solid rgba(255,102,0,0.35)', color: '#FF6600', textShadow: '0 0 6px #FF6600' }}>
                🎯 Almost Made It
              </span>
            )}
            {bounty && (bounty.mentorship || bounty.domain_handover || bounty.cash_bounty > 0) && (
              <span style={{ padding: '2px 10px', borderRadius: 3, fontSize: 10, fontWeight: 700, fontFamily: MONO, letterSpacing: '0.08em', background: 'rgba(255,224,0,0.1)', border: '1px solid rgba(255,224,0,0.3)', color: '#FFE000', textShadow: '0 0 6px #FFE000', animation: 'chipPulse 2s ease-in-out infinite' }}>
                🏆 Bounty Available
              </span>
            )}
          </div>

          {/* Title area */}
          <div style={{ position: 'absolute', bottom: 14, left: 20, right: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <div>
                {emotion && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span>{emotion.icon}</span>
                    <span style={{ fontSize: 10, fontFamily: MONO, letterSpacing: '0.08em', color: emotion.color }}>{emotion.label}</span>
                  </div>
                )}
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1, textShadow: '0 2px 20px rgba(0,0,0,0.8)' }}>
                  {idea.title}
                </h2>
              </div>
              {/* Upvote */}
              <button onClick={handleUpvote} disabled={voting} style={{
                flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '8px 12px', borderRadius: 8,
                background: upvoted ? 'rgba(0,255,136,0.1)' : 'rgba(0,0,0,0.5)',
                border: `1px solid ${upvoted ? 'rgba(0,255,136,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: upvoted ? '#00FF88' : 'rgba(255,255,255,0.4)',
                transition: 'all 0.2s', transform: upvoted ? 'scale(1.05)' : 'scale(1)',
              }}>
                <ThumbsUp size={14} />
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: MONO }}>{upvotes}</span>
              </button>
            </div>

            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>{idea.short_desc}</p>
          </div>
        </div>

        {voteError&&<p role="alert" style={{color:"#ff7373",padding:12}}>{voteError}</p>}
        {/* Quick stats bar */}
        <div style={{
          display: 'flex', gap: 0, flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.3)',
        }}>
          {[
            { icon: Eye,        val: idea.views,          label: 'views'   },
            { icon: TrendingUp, val: idea.revival_count,  label: 'revive'  },
            { icon: Users,      val: idea.contributor_count, label: 'contribs' },
            { icon: Clock,      val: idea.time_invested || (idea.months_built ? `${idea.months_built}mo` : '—'), label: 'invested', isText: true },
          ].map((s, i) => (
            <div key={i} style={{
              flex: 1, padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              borderRight: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}>
              <s.icon size={12} style={{ color: 'rgba(0,255,255,0.4)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, color: '#E8E8FF' }}>
                {s.isText ? s.val : (s.val as number).toLocaleString()}
              </span>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s.label}</span>
            </div>
          ))}
          {idea.founded_year && (
            <div style={{ flex: 1, padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <Calendar size={12} style={{ color: 'rgba(0,255,255,0.4)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, color: '#E8E8FF' }}>
                {idea.founded_year}{idea.abandoned_year ? `–${idea.abandoned_year}` : ''}
              </span>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>years</span>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: 0, flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.2)',
        }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '12px 0', fontSize: 10, fontFamily: MONO,
              letterSpacing: '0.12em', fontWeight: 700, border: 'none',
              background: tab === t.id ? 'rgba(0,255,255,0.06)' : 'transparent',
              color: tab === t.id ? 'var(--cyan)' : 'rgba(255,255,255,0.25)',
              textShadow: tab === t.id ? '0 0 8px var(--cyan)' : 'none',
              borderBottom: `2px solid ${tab === t.id ? 'var(--cyan)' : 'transparent'}`,
              transition: 'all 0.18s',
            }}>
              {t.label}
              {t.id === 'ai' && !idea.ai_analyzed && (
                <span style={{ marginLeft: 4, fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>—</span>
              )}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="mscroll" style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>

          {/* ── STORY TAB ─────────────────── */}
          {tab === 'story' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* DNA Stats */}
              <DNAStats idea={idea} />

              {/* Project Lifeline */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 2, height: 14, background: 'linear-gradient(180deg,var(--cyan),var(--pink))', borderRadius: 1 }} />
                  <span style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Project Lifeline</span>
                </div>
                <LifelineTimeline events={timeline} />
              </div>

              {/* Surviving assets */}
              {idea.surviving_assets?.length > 0 && <SurvivingAssets assets={idea.surviving_assets} />}

              {/* Revival bounty */}
              {bounty && <BountyCard bounty={bounty} />}

              {/* The story */}
              {idea.description && (
                <div>
                  <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.12em', marginBottom: 8, textTransform: 'uppercase' }}>The Story</div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8 }}>{idea.description}</p>
                </div>
              )}

              {/* Why it died */}
              {idea.why_died && (
                <div style={{ padding: '14px 16px', borderRadius: 8, background: 'rgba(255,40,40,0.04)', border: '1px solid rgba(255,40,40,0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <AlertTriangle size={13} style={{ color: '#FF4444' }} />
                    <span style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,68,68,0.7)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Why It Died</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{idea.why_died}</p>
                </div>
              )}

              {/* Almost worked */}
              {idea.almost_worked && (
                <div style={{ padding: '14px 16px', borderRadius: 8, background: 'rgba(0,255,255,0.03)', border: '1px solid rgba(0,255,255,0.15)' }}>
                  <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>What Almost Worked</div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{idea.almost_worked}</p>
                </div>
              )}

              {/* Almost made it milestones */}
              {idea.almost_made_it && idea.almost_milestones?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,102,0,0.6)', letterSpacing: '0.12em', marginBottom: 10, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Target size={12} style={{ color: '#FF6600' }} /> Almost Made It
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {idea.almost_milestones.map((m, i) => (
                      <span key={i} style={{ padding: '4px 12px', borderRadius: 4, background: 'rgba(255,102,0,0.06)', border: '1px solid rgba(255,102,0,0.25)', fontSize: 11, fontFamily: MONO, color: '#FF6600' }}>
                        ✓ {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Letter to next founder */}
              <LetterToFounder text={idea.letter_to_founder || idea.last_words} creator={idea.is_anonymous ? 'Anonymous' : idea.creator_name} />

              {/* What happened next */}
              {idea.founder_update && (
                <div style={{ padding: '14px 16px', borderRadius: 8, background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.15)' }}>
                  <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,136,0.5)', letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>
                    ✔ What Happened Next
                  </div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{idea.founder_update}</p>
                </div>
              )}

              {/* Tech stack */}
              {idea.tech_stack?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.12em', marginBottom: 8, textTransform: 'uppercase' }}>Tech Stack</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {idea.tech_stack.map(t => (
                      <span key={t} style={{ padding: '4px 10px', borderRadius: 4, background: 'rgba(170,68,255,0.06)', border: '1px solid rgba(170,68,255,0.2)', fontSize: 11, fontFamily: MONO, color: '#AA44FF' }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Comments */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20 }}>
                <Comments ideaId={idea.id} />
              </div>
            </div>
          )}

          {/* ── CAPSULE TAB ───────────────── */}
          {tab === 'capsule' && <TimeCapsuleView capsule={capsule} />}

          {/* ── AI TAB ───────────────────── */}
          {tab === 'ai' && (
            <div>
              {!idea.ai_analyzed ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <Cpu size={36} style={{ color: 'rgba(170,68,255,0.3)', margin: '0 auto 16px' }} />
                  <p style={{ fontFamily: MONO, fontSize: 12, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em' }}>AI ANALYSIS NOT AVAILABLE</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.1)', marginTop: 8 }}>Use AI Lab to analyze this project</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {idea.ai_summary && (
                    <div style={{ padding: '14px 16px', borderRadius: 8, background: 'rgba(170,68,255,0.05)', border: '1px solid rgba(170,68,255,0.2)' }}>
                      <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(170,68,255,0.7)', letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>AI Summary</div>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>{idea.ai_summary}</p>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {idea.ai_strengths?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,136,0.6)', letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>Strengths</div>
                        {idea.ai_strengths.map((s, i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                            <CheckCircle size={11} style={{ color: '#00FF88', flexShrink: 0, marginTop: 2 }} /> {s}
                          </div>
                        ))}
                      </div>
                    )}
                    {idea.ai_weaknesses?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,68,68,0.6)', letterSpacing: '0.1em', marginBottom: 8, textTransform: 'uppercase' }}>Weaknesses</div>
                        {idea.ai_weaknesses.map((w, i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                            <AlertTriangle size={11} style={{ color: '#FF4444', flexShrink: 0, marginTop: 2 }} /> {w}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {idea.ai_market && (
                    <div>
                      <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>Market Opportunity</div>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{idea.ai_market}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── REVIVE TAB ───────────────── */}
          {tab === 'revive' && <ReviveTab idea={idea} />}
        </div>
      </div>

      <style>{`
        @keyframes spin        { to { transform: rotate(360deg); } }
        @keyframes legendFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
      `}</style>
    </div>
  );
}
