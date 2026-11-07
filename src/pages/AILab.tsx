import { useState, useCallback } from 'react';
import {
  Zap, Sparkles, Target, BarChart2, Cpu, DollarSign,
  TrendingUp, AlertTriangle, CheckCircle, Loader2,
  FileText, Lightbulb, Code2, Search, Star, GitFork,
  ExternalLink, Archive, Globe, Clock
} from 'lucide-react';


interface GHRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string;
  archived: boolean;
  topics: string[];
  owner: { login: string; avatar_url: string };
  pushed_at: string;
}

const AI_FEATURES = [
  { icon: FileText,   title: 'Idea Analyzer',    desc: 'Deep analysis of strengths, weaknesses, and market fit', tag: 'Popular' },
  { icon: BarChart2,  title: 'Market Research',   desc: 'Competitive landscape, TAM/SAM, opportunity sizing',    tag: 'New' },
  { icon: Target,     title: 'Roadmap Builder',   desc: 'Step-by-step technical and business revival roadmap',   tag: '' },
  { icon: DollarSign, title: 'Revenue Models',    desc: 'Monetization strategy and pricing recommendations',     tag: '' },
  { icon: Cpu,        title: 'Stack Advisor',     desc: 'Modern stack recommendations for 2024+',               tag: '' },
  { icon: Lightbulb,  title: 'Name Generator',    desc: 'AI-powered naming for your revived project',           tag: '' },
  { icon: TrendingUp, title: 'Pitch Deck',        desc: 'Investor-ready pitch deck outline in minutes',         tag: 'Beta' },
  { icon: Code2,      title: 'Code Starter',      desc: 'Boilerplate and architecture for your revival',        tag: 'Beta' },
];

interface Analysis { summary:string; strengths:string[]; weaknesses:string[]; market:string; roadmap:string; techStack:string[]; monetization:string }

export default function AILab() {
  const [ideaText, setIdeaText] = useState('');
  const analyzing = false;
  const [result] = useState<Analysis | null>(null);
  const [tab, setTab] = useState<'ai' | 'github'>('ai');

  // GitHub state
  const [ghQuery, setGhQuery] = useState('');
  const [ghResults] = useState<GHRepo[]>([]);
  const ghLoading = false;
  const [ghErr, setGhErr] = useState('');
  const [ghSearched, setGhSearched] = useState(false);

  const searchGitHub = useCallback(() => {
    if (!ghQuery.trim()) return;
    setGhSearched(true);
    setGhErr('External analysis is disconnected in this experimental workspace.');
  }, [ghQuery]);

  const TABS = [
    { id: 'ai' as const, label: 'AI Analysis', icon: Zap },
    { id: 'github' as const, label: 'GitHub Search', icon: Globe },
  ];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, padding: '20px 32px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 999,
            background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)',
            fontSize: 11, fontWeight: 700, color: '#8B5CF6',
            letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8,
          }}>
            <Zap size={11} /> External providers disconnected
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.02em' }}>AI Lab</h1>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'flex', gap: 2, padding: 4,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12,
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', borderRadius: 9,
                background: tab === t.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: tab === t.id ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
                cursor: 'pointer', color: tab === t.id ? 'var(--t1)' : 'var(--t3)',
                fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif',
                transition: 'all 0.15s',
              }}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* ── AI TAB ──────────────────────── */}
        {tab === 'ai' && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 0 }}>
            {/* Input side */}
            <div style={{
              width: 360, flexShrink: 0,
              display: 'flex', flexDirection: 'column',
              padding: '20px 24px',
              borderRight: '1px solid rgba(255,255,255,0.05)',
              gap: 16,
            }}>
              <div style={{
                padding: '16px',
                background: 'rgba(139,92,246,0.06)',
                border: '1px solid rgba(139,92,246,0.15)',
                borderRadius: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Sparkles size={14} style={{ color: '#8B5CF6' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>Idea Analyzer</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.5 }}>
                  Paste your abandoned project description for a full AI analysis.
                </p>
              </div>

              <textarea
                style={{
                  flex: 1, resize: 'none',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 14, padding: '14px',
                  color: 'var(--t1)', fontSize: 13, lineHeight: 1.6,
                  fontFamily: 'Inter, sans-serif', outline: 'none',
                  transition: 'border-color 0.2s',
                  minHeight: 180,
                }}
                placeholder="Describe your abandoned project — what it was, who it was for, why it failed, what made it special..."
                value={ideaText}
                onChange={e => setIdeaText(e.target.value)}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'}
              />

              <button
                title="No analysis provider is connected in this workspace"
                disabled
                style={{
                  padding: '12px', borderRadius: 12,
                  background: analyzing ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#8B5CF6,#4F8CFF)',
                  border: 'none', cursor: !ideaText.trim() ? 'not-allowed' : 'pointer',
                  color: '#fff', fontSize: 14, fontWeight: 700,
                  fontFamily: 'Inter, sans-serif',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: !ideaText.trim() ? 0.4 : 1,
                  transition: 'all 0.15s',
                  boxShadow: ideaText.trim() && !analyzing ? '0 4px 20px rgba(139,92,246,0.3)' : 'none',
                }}
              >
                {analyzing
                  ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Analyzing...</>
                  : <><Zap size={15} /> Analysis unavailable</>
                }
              </button>

              {/* Feature grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {AI_FEATURES.map(f => (
                  <div key={f.title} style={{
                    padding: '10px 12px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.07)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
                  >
                    <f.icon size={12} style={{ color: 'var(--t3)', marginBottom: 5 }} />
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', marginBottom: 2 }}>{f.title}</p>
                    {f.tag && (
                      <span style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 4,
                        background: f.tag === 'New' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                        color: f.tag === 'New' ? '#22C55E' : '#F59E0B',
                        fontWeight: 700, letterSpacing: '0.04em',
                      }}>{f.tag}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Results side */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
              {!result && !analyzing && (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                  <Sparkles size={40} style={{ color: 'rgba(255,255,255,0.06)' }} />
                  <p style={{ fontSize: 15, color: 'var(--t3)', textAlign: 'center' }}>
                    Describe your project on the left<br />to see the full AI analysis here.
                  </p>
                </div>
              )}

              {analyzing && (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
                  <div style={{ position: 'relative', width: 60, height: 60 }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.2)', animation: 'spin 2s linear infinite' }} />
                    <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', border: '2px solid rgba(79,140,255,0.3)', animation: 'spin 1.5s linear infinite reverse' }} />
                    <Zap size={20} style={{ position: 'absolute', inset: 0, margin: 'auto', color: '#8B5CF6' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)', marginBottom: 4 }}>Analyzing...</p>
                    <p style={{ fontSize: 12, color: 'var(--t3)' }}>Analysis is unavailable</p>
                  </div>
                </div>
              )}

              {result && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
                  {/* Summary */}
                  <div style={{ padding: '18px 20px', borderRadius: 16, background: 'linear-gradient(135deg,rgba(79,140,255,0.07),rgba(139,92,246,0.07))', border: '1px solid rgba(79,140,255,0.15)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                      <Sparkles size={13} style={{ color: '#4F8CFF' }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#4F8CFF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>AI Summary</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>{result.summary}</p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Card icon={CheckCircle} iconColor="#22C55E" title="Strengths" items={result.strengths} itemIcon={CheckCircle} itemColor="#22C55E" />
                    <Card icon={AlertTriangle} iconColor="#EF4444" title="Challenges" items={result.weaknesses} itemIcon={AlertTriangle} itemColor="#EF4444" />
                  </div>

                  <InfoBlock icon={Target} iconColor="#F59E0B" title="Market Opportunity" text={result.market} />
                  <InfoBlock icon={BarChart2} iconColor="#8B5CF6" title="Revival Roadmap" text={result.roadmap} />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                        <Cpu size={12} style={{ color: '#4F8CFF' }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#4F8CFF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Suggested Stack</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {result.techStack.map(t => (
                          <span key={t} style={{ padding: '3px 8px', borderRadius: 7, background: 'rgba(79,140,255,0.1)', border: '1px solid rgba(79,140,255,0.2)', fontSize: 11, color: '#4F8CFF', fontFamily: 'monospace' }}>{t}</span>
                        ))}
                      </div>
                    </div>
                    <InfoBlock icon={DollarSign} iconColor="#22C55E" title="Monetization" text={result.monetization} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── GITHUB TAB ──────────────────── */}
        {tab === 'github' && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '20px 32px' }}>
            {/* Search bar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)', pointerEvents: 'none' }} />
                <input
                  style={{
                    width: '100%', paddingLeft: 42, paddingRight: 14,
                    padding: '11px 14px 11px 42px',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12, color: 'var(--t1)', fontSize: 14,
                    outline: 'none', fontFamily: 'Inter,sans-serif', boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  placeholder="Search GitHub for abandoned repos, old projects..."
                  value={ghQuery}
                  onChange={e => setGhQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchGitHub()}
                  onFocus={e => e.currentTarget.style.borderColor = 'rgba(79,140,255,0.4)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
                />
              </div>
              <button
                onClick={searchGitHub}
                disabled={ghLoading || !ghQuery.trim()}
                style={{
                  padding: '11px 24px', borderRadius: 12,
                  background: ghLoading || !ghQuery.trim() ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#4F8CFF,#8B5CF6)',
                  border: 'none', cursor: ghLoading ? 'wait' : !ghQuery.trim() ? 'not-allowed' : 'pointer',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  fontFamily: 'Inter,sans-serif',
                  display: 'flex', alignItems: 'center', gap: 7,
                  opacity: !ghQuery.trim() ? 0.4 : 1,
                  transition: 'all 0.15s', flexShrink: 0,
                }}
              >
                {ghLoading ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Search size={14} />}
                Search GitHub
              </button>
            </div>

            {/* Quick searches */}
            {!ghSearched && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Quick searches</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {['abandoned app', 'deprecated tool', 'archived startup', 'unmaintained library', 'old side project', 'failed experiment'].map(q => (
                    <button key={q} onClick={() => { setGhQuery(q); }}
                      style={{
                        padding: '6px 14px', borderRadius: 999,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                        fontSize: 12, color: 'var(--t2)', cursor: 'pointer',
                        fontFamily: 'Inter,sans-serif', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,140,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(79,140,255,0.25)'; e.currentTarget.style.color = '#4F8CFF'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'var(--t2)'; }}
                    >{q}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {ghErr && (
              <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: '#EF4444', marginBottom: 16 }}>
                {ghErr}
              </div>
            )}

            {/* Loading */}
            {ghLoading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, flexDirection: 'column', gap: 12 }}>
                <Loader2 size={28} style={{ color: '#4F8CFF', animation: 'spin 0.8s linear infinite' }} />
                <p style={{ fontSize: 13, color: 'var(--t3)' }}>Searching GitHub...</p>
              </div>
            )}

            {/* Results grid */}
            {!ghLoading && ghResults.length > 0 && (
              <div style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12, alignContent: 'start' }}>
                {ghResults.map(repo => (
                  <div key={repo.id} style={{
                    padding: '16px 18px', borderRadius: 16,
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${repo.archived ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)'}`,
                    display: 'flex', flexDirection: 'column', gap: 10,
                    transition: 'all 0.2s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(79,140,255,0.2)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = repo.archived ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'none'; }}
                  >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <img src={repo.owner.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.05)' }} />
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)', lineHeight: 1.2 }}>{repo.name}</p>
                          <p style={{ fontSize: 10, color: 'var(--t3)' }}>{repo.owner.login}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {repo.archived && (
                          <span style={{ padding: '2px 7px', borderRadius: 999, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', fontSize: 9, fontWeight: 700, color: '#F59E0B', letterSpacing: '0.06em' }}>ARCHIVED</span>
                        )}
                        {repo.language && (
                          <span style={{ padding: '2px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', fontSize: 9, fontWeight: 600, color: 'var(--t2)' }}>{repo.language}</span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    {repo.description && (
                      <p style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {repo.description}
                      </p>
                    )}

                    {/* Stats */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--t3)' }}>
                        <Star size={11} /><span style={{ color: 'var(--t2)', fontWeight: 600 }}>{repo.stargazers_count.toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--t3)' }}>
                        <GitFork size={11} /><span>{repo.forks_count.toLocaleString()}</span>
                      </div>
                      {repo.pushed_at && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--t3)', marginLeft: 'auto' }}>
                          <Clock size={10} />
                          {new Date(repo.pushed_at).getFullYear()}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 7, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <a href={repo.html_url} target="_blank" rel="noreferrer"
                        style={{
                          flex: 1, padding: '7px', borderRadius: 8, textDecoration: 'none',
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                          fontSize: 11, fontWeight: 600, color: 'var(--t2)',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--t1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--t2)'; }}
                      >
                        <ExternalLink size={11} /> View on GitHub
                      </a>
                      <button style={{
                        flex: 1, padding: '7px', borderRadius: 8,
                        background: 'rgba(79,140,255,0.08)', border: '1px solid rgba(79,140,255,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        fontSize: 11, fontWeight: 600, color: '#4F8CFF', cursor: 'pointer',
                        fontFamily: 'Inter,sans-serif', transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,140,255,0.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(79,140,255,0.08)'; }}
                      >
                        <Archive size={11} /> Add to Reboot
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {ghSearched && !ghLoading && ghResults.length === 0 && !ghErr && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
                <Search size={32} style={{ color: 'rgba(255,255,255,0.06)' }} />
                <p style={{ fontSize: 14, color: 'var(--t3)' }}>No repositories found for "{ghQuery}"</p>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeUp { from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  );
}

function Card({ icon: Icon, iconColor, title, items, itemIcon: ItemIcon, itemColor }: {
  icon: React.ElementType; iconColor: string; title: string;
  items: string[]; itemIcon: React.ElementType; itemColor: string;
}) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <Icon size={12} style={{ color: iconColor }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: iconColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
      </div>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((s, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12, color: 'var(--t2)', lineHeight: 1.4 }}>
            <ItemIcon size={11} style={{ color: itemColor, opacity: 0.6, flexShrink: 0, marginTop: 1 }} />{s}
          </li>
        ))}
      </ul>
    </div>
  );
}

function InfoBlock({ icon: Icon, iconColor, title, text }: { icon: React.ElementType; iconColor: string; title: string; text: string }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <Icon size={12} style={{ color: iconColor }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: iconColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>{text}</p>
    </div>
  );
}
