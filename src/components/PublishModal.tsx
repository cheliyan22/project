import { useState } from 'react';
import {
  X, Plus, Trash2, ChevronLeft, ChevronRight, Loader2,
  AlertCircle, CheckCircle, Package, Gift, XCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const MONO = "'Share Tech Mono', monospace";

interface Props { onClose: () => void; onPublished: () => void; }

const FAILURE_EMOTIONS = [
  { id: 'burnout',   icon: '😔', label: 'Burnout'       },
  { id: 'money',     icon: '💸', label: 'No Funding'    },
  { id: 'interest',  icon: '❤️', label: 'Lost Interest' },
  { id: 'team',      icon: '👥', label: 'Team Split'    },
  { id: 'school',    icon: '📚', label: 'School'        },
  { id: 'family',    icon: '👶', label: 'Family'        },
  { id: 'job',       icon: '💼', label: 'Got a Job'     },
  { id: 'legal',     icon: '⚖️', label: 'Legal'        },
  { id: 'market',    icon: '🧪', label: 'Bad Market'    },
  { id: 'technical', icon: '🔧', label: 'Tech Debt'     },
];

const DEFAULT_ASSETS = [
  'Landing page', 'Logo', 'Database schema', 'GitHub repo',
  'Mobile app', 'Backend', 'Frontend', 'Design system', 'Domain',
];

const TIMELINE_EMOJIS = [
  '💡','🛠','👥','🚀','💸','📉','😞','☠','🧟','⭐','🔥','🏆','🎯','📊','🔐'
];

const ALMOST_MILESTONES_OPTS = [
  'Launched publicly', 'Had paying users', 'Accepted into accelerator',
  'Was profitable for a month', 'Got press coverage', 'Raised funding',
  'Had 100+ users', 'Had 1000+ users', 'Got acquired offer',
];

const CATEGORIES = ['apps','games','ai','business','education','art','research','open-source','hardware','health','other'];
const DIFFICULTIES = ['Easy','Medium','Hard','Expert'] as const;
const STATUSES = [
  { val: 'abandoned', label: '☠ Abandoned', desc: 'Project is fully dead' },
  { val: 'seeking',   label: '⚡ Seeking Revival', desc: 'Looking for someone to continue' },
  { val: 'in_progress', label: '🛠 Paused', desc: 'Slowed down, not dead yet' },
];

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

/* ── Input components ─────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.1em', display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  );
}

function TextArea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      className="input"
      rows={rows}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ resize: 'vertical', fontFamily: 'Inter, sans-serif', fontSize: 13 }}
    />
  );
}

/* ── STEP INDICATORS ──────────────── */
function StepBar({ step, total }: { step: number; total: number }) {
  const labels = ['Identity', 'The Story', 'DNA & Assets', 'Bounty & Capsule'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 24px', flexShrink: 0 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
            {i > 0 && <div style={{ flex: 1, height: 1, background: i <= step ? 'var(--cyan)' : 'rgba(255,255,255,0.08)' }} />}
            <div style={{
              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, fontFamily: MONO,
              background: i < step ? 'rgba(0,255,136,0.15)' : i === step ? 'rgba(0,255,255,0.1)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${i < step ? 'rgba(0,255,136,0.4)' : i === step ? 'rgba(0,255,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: i < step ? '#00FF88' : i === step ? 'var(--cyan)' : 'rgba(255,255,255,0.2)',
            }}>
              {i < step ? '✓' : i + 1}
            </div>
            {i < total - 1 && <div style={{ flex: 1, height: 1, background: i < step ? 'var(--cyan)' : 'rgba(255,255,255,0.08)' }} />}
          </div>
          <span style={{ fontSize: 8, fontFamily: MONO, letterSpacing: '0.08em', color: i === step ? 'var(--cyan)' : 'rgba(255,255,255,0.2)', textTransform: 'uppercase', textAlign: 'center' }}>
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── MAIN ─────────────────────────── */
export default function PublishModal({ onClose, onPublished }: Props) {
  const [step, setStep] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [err, setErr] = useState('');

  // Step 1 — Identity
  const [title, setTitle] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [category, setCategory] = useState('apps');
  const [difficulty, setDifficulty] = useState<'Easy'|'Medium'|'Hard'|'Expert'>('Medium');
  const [status, setStatus] = useState<'abandoned'|'seeking'|'in_progress'>('abandoned');
  const [creatorName, setCreatorName] = useState('');
  const [isAnon, setIsAnon] = useState(false);
  const [foundedYear, setFoundedYear] = useState('');
  const [abandonedYear, setAbandonedYear] = useState('');

  // Step 2 — Story
  const [whyDied, setWhyDied] = useState('');
  const [failureEmotion, setFailureEmotion] = useState('');
  const [almostWorked, setAlmostWorked] = useState('');
  const [description, setDescription] = useState('');
  const [letterToFounder, setLetterToFounder] = useState('');
  const [founderUpdate, setFounderUpdate] = useState('');
  const [almostMadeIt, setAlmostMadeIt] = useState(false);
  const [almostMilestones, setAlmostMilestones] = useState<string[]>([]);

  // Step 3 — DNA & Assets
  const [monthsBuilt, setMonthsBuilt] = useState('');
  const [commitsCount, setCommitsCount] = useState('');
  const [usersCount, setUsersCount] = useState('');
  const [revenueMade, setRevenueMade] = useState('');
  const [techStack, setTechStack] = useState<string[]>([]);
  const [techInput, setTechInput] = useState('');
  const [potentialScore, setPotentialScore] = useState(3);
  const [revivalScore, setRevivalScore] = useState(3);
  const [assets, setAssets] = useState<{ label: string; exists: boolean }[]>(
    DEFAULT_ASSETS.map(l => ({ label: l, exists: false }))
  );
  const [coverUrl, setCoverUrl] = useState('');

  // Timeline
  const [timeline, setTimeline] = useState<{ emoji: string; label: string; description: string; milestone_date: string }[]>([
    { emoji: '💡', label: 'Idea Born', description: '', milestone_date: '' },
  ]);

  // Step 4 — Bounty & Capsule
  const [bountyMentorship, setBountyMentorship] = useState(false);
  const [bountyDomain, setBountyDomain] = useState(false);
  const [bountyGithub, setBountyGithub] = useState(false);
  const [bountyCash, setBountyCash] = useState('');
  const [bountyEquity, setBountyEquity] = useState('');
  const [bountyTrigger, setBountyTrigger] = useState('');
  const [bountyCustom, setBountyCustom] = useState('');

  const [capsuleRepo, setCapsuleRepo] = useState('');
  const [capsuleDemo, setCapsuleDemo] = useState('');
  const [capsuleFigma, setCapsuleFigma] = useState('');
  const [capsuleDomain, setCapsuleDomain] = useState('');
  const [capsuleLessons, setCapsuleLessons] = useState('');
  const [capsuleFinalMsg, setCapsuleFinalMsg] = useState('');
  const [capsuleLastCommit, setCapsuleLastCommit] = useState('');

  const addTech = () => {
    const t = techInput.trim();
    if (t && !techStack.includes(t)) { setTechStack(s => [...s, t]); }
    setTechInput('');
  };

  const addTimelineItem = () => {
    setTimeline(tl => [...tl, { emoji: '📌', label: '', description: '', milestone_date: '' }]);
  };

  const toggleMilestone = (m: string) => {
    setAlmostMilestones(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  const canNext = [
    title.trim() && shortDesc.trim(),
    whyDied.trim(),
    true,
    true,
  ][step];

  const handlePublish = async () => {
    setPublishing(true); setErr('');
    try {
      const { data: ideaData, error: ideaErr } = await supabase.from('ideas').insert({
        title, slug: slugify(title), short_desc: shortDesc, category,
        difficulty, status, creator_name: isAnon ? 'Anonymous' : (creatorName || 'Anonymous'),
        is_anonymous: isAnon,
        founded_year: foundedYear ? parseInt(foundedYear) : null,
        abandoned_year: abandonedYear ? parseInt(abandonedYear) : null,
        why_died: whyDied, failure_story: whyDied,
        failure_emotion: failureEmotion,
        almost_worked: almostWorked,
        description,
        letter_to_founder: letterToFounder,
        last_words: letterToFounder,
        founder_update: founderUpdate,
        almost_made_it: almostMadeIt,
        almost_milestones: almostMilestones,
        tech_stack: techStack,
        cover_url: coverUrl || null,
        potential_score: potentialScore,
        revival_score: revivalScore,
        time_invested: monthsBuilt ? `${monthsBuilt} months` : '',
        months_built: parseInt(monthsBuilt) || 0,
        commits_count: parseInt(commitsCount) || 0,
        users_count: parseInt(usersCount) || 0,
        revenue_made: parseInt(revenueMade) || 0,
        surviving_assets: assets,
      }).select('id').single();

      if (ideaErr) throw ideaErr;
      const ideaId = ideaData.id;

      // Insert timeline
      const validTL = timeline.filter(e => e.label.trim());
      if (validTL.length > 0) {
        await supabase.from('project_timeline').insert(
          validTL.map((e, i) => ({ idea_id: ideaId, ...e, sort_order: i }))
        );
      }

      // Insert bounty if any
      const hasBounty = bountyMentorship || bountyDomain || bountyGithub || bountyCash || bountyEquity || bountyCustom;
      if (hasBounty) {
        await supabase.from('revival_bounty').insert({
          idea_id: ideaId,
          mentorship: bountyMentorship,
          domain_handover: bountyDomain,
          github_handover: bountyGithub,
          cash_bounty: parseInt(bountyCash) || 0,
          equity_offer: bountyEquity,
          milestone_trigger: bountyTrigger,
          custom_offer: bountyCustom,
        });
      }

      // Insert capsule if any
      const hasCapsule = capsuleRepo || capsuleDemo || capsuleFigma || capsuleDomain || capsuleLessons || capsuleFinalMsg;
      if (hasCapsule) {
        await supabase.from('time_capsule').insert({
          idea_id: ideaId,
          repo_url: capsuleRepo,
          demo_url: capsuleDemo,
          figma_url: capsuleFigma,
          domain: capsuleDomain,
          lessons_learned: capsuleLessons,
          final_message: capsuleFinalMsg,
          last_commit_date: capsuleLastCommit,
        });
      }

      onPublished();
    } catch (error: unknown) {
      setErr(error instanceof Error ? error.message : 'Publish failed.');
      setPublishing(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(24px)' }} />

      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative', width: '100%', maxWidth: 640,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', border: '1px solid rgba(0,255,255,0.12)',
        borderRadius: 16,
        boxShadow: '0 0 0 1px rgba(0,255,255,0.04), 0 40px 120px rgba(0,0,0,0.9)',
        animation: 'scaleIn 0.3s cubic-bezier(0.16,1,0.3,1) both',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 900, fontFamily: MONO, letterSpacing: '0.08em', color: 'var(--cyan)', textShadow: '0 0 12px var(--cyan)' }}>
                ☠ ARCHIVE A PROJECT
              </h2>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: MONO, marginTop: 3 }}>
                Preserve it. Let it be revived.
              </p>
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.35)', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,40,40,0.4)'; e.currentTarget.style.color = '#FF4444'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
            >
              <X size={13} />
            </button>
          </div>
          <StepBar step={step} total={4} />
        </div>

        {/* Scrollable content */}
        <div className="mscroll" style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>

          {/* ── STEP 0: IDENTITY ─────────── */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="Project Name *">
                <input className="input" style={{ fontSize: 14, fontWeight: 600 }} placeholder="What was it called?" value={title} onChange={e => setTitle(e.target.value)} />
              </Field>
              <Field label="One-Line Epitaph *">
                <input className="input" placeholder="What was this project, in one sentence?" value={shortDesc} onChange={e => setShortDesc(e.target.value)} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Category">
                  <select className="input" value={category} onChange={e => setCategory(e.target.value)} style={{ fontFamily: MONO }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select className="input" value={status} onChange={e => setStatus(e.target.value as typeof status)} style={{ fontFamily: MONO }}>
                    {STATUSES.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="Founded">
                  <input className="input" type="number" placeholder="2022" value={foundedYear} onChange={e => setFoundedYear(e.target.value)} />
                </Field>
                <Field label="Abandoned">
                  <input className="input" type="number" placeholder="2023" value={abandonedYear} onChange={e => setAbandonedYear(e.target.value)} />
                </Field>
                <Field label="Difficulty">
                  <div style={{ display: 'flex', gap: 4 }}>
                    {DIFFICULTIES.map(d => (
                      <button key={d} onClick={() => setDifficulty(d)} style={{
                        flex: 1, padding: '8px 0', borderRadius: 5, fontSize: 9,
                        fontFamily: MONO, fontWeight: 700, letterSpacing: '0.06em',
                        background: difficulty === d ? 'rgba(0,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${difficulty === d ? 'rgba(0,255,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                        color: difficulty === d ? 'var(--cyan)' : 'rgba(255,255,255,0.2)',
                        transition: 'all 0.15s',
                      }}>
                        {d[0]}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <Field label="Your Name">
                    <input className="input" placeholder={isAnon ? 'Anonymous' : 'Founder name'} value={creatorName} onChange={e => setCreatorName(e.target.value)} disabled={isAnon} />
                  </Field>
                </div>
                <button onClick={() => setIsAnon(a => !a)} style={{
                  marginTop: 20, padding: '8px 14px', borderRadius: 6, fontSize: 10, fontFamily: MONO, letterSpacing: '0.08em',
                  background: isAnon ? 'rgba(0,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isAnon ? 'rgba(0,255,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  color: isAnon ? 'var(--cyan)' : 'rgba(255,255,255,0.3)',
                  transition: 'all 0.15s',
                }}>
                  {isAnon ? '🕶 ANON' : 'ANON?'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 1: STORY ────────────── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Failure emotion picker */}
              <div>
                <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase' }}>How did it end?</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {FAILURE_EMOTIONS.map(e => (
                    <button key={e.id} onClick={() => setFailureEmotion(failureEmotion === e.id ? '' : e.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 6, fontSize: 12, fontFamily: MONO,
                      background: failureEmotion === e.id ? 'rgba(0,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${failureEmotion === e.id ? 'rgba(0,255,255,0.35)' : 'rgba(255,255,255,0.06)'}`,
                      color: failureEmotion === e.id ? 'var(--cyan)' : 'rgba(255,255,255,0.3)',
                      transition: 'all 0.15s',
                    }}>
                      <span>{e.icon}</span> {e.label}
                    </button>
                  ))}
                </div>
              </div>

              <Field label="Why Did It Die? *">
                <TextArea value={whyDied} onChange={setWhyDied} placeholder="Be honest. What killed this project?" rows={3} />
              </Field>
              <Field label="What Almost Worked?">
                <TextArea value={almostWorked} onChange={setAlmostWorked} placeholder="What was promising? What showed signs of life?" rows={2} />
              </Field>
              <Field label="The Full Story">
                <TextArea value={description} onChange={setDescription} placeholder="Tell the whole journey — from excitement to the end..." rows={4} />
              </Field>

              {/* Almost Made It */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <button onClick={() => setAlmostMadeIt(a => !a)} style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                    background: almostMadeIt ? 'rgba(255,102,0,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${almostMadeIt ? 'rgba(255,102,0,0.5)' : 'rgba(255,255,255,0.08)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#FF6600', transition: 'all 0.15s',
                  }}>
                    {almostMadeIt && <CheckCircle size={10} />}
                  </button>
                  <span style={{ fontSize: 12, fontFamily: MONO, color: almostMadeIt ? '#FF6600' : 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>
                    🎯 This project "Almost Made It"
                  </span>
                </div>
                {almostMadeIt && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 28 }}>
                    {ALMOST_MILESTONES_OPTS.map(m => (
                      <button key={m} onClick={() => toggleMilestone(m)} style={{
                        padding: '4px 10px', borderRadius: 4, fontSize: 11, fontFamily: MONO,
                        background: almostMilestones.includes(m) ? 'rgba(255,102,0,0.1)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${almostMilestones.includes(m) ? 'rgba(255,102,0,0.35)' : 'rgba(255,255,255,0.06)'}`,
                        color: almostMilestones.includes(m) ? '#FF6600' : 'rgba(255,255,255,0.2)',
                        transition: 'all 0.15s',
                      }}>
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Field label="Letter to the Next Founder">
                <TextArea value={letterToFounder} onChange={setLetterToFounder} placeholder="What do you want the person who revives this to know? Your most important insight..." rows={3} />
              </Field>

              <Field label="What Happened to You Next?">
                <TextArea value={founderUpdate} onChange={setFounderUpdate} placeholder="Did you join a company? Start something new? Take a break? Give closure." rows={2} />
              </Field>
            </div>
          )}

          {/* ── STEP 2: DNA & ASSETS ─────── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* DNA stats */}
              <div>
                <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase' }}>Project DNA</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Months Built">
                    <input className="input" type="number" placeholder="6" value={monthsBuilt} onChange={e => setMonthsBuilt(e.target.value)} />
                  </Field>
                  <Field label="Git Commits">
                    <input className="input" type="number" placeholder="416" value={commitsCount} onChange={e => setCommitsCount(e.target.value)} />
                  </Field>
                  <Field label="Users Reached">
                    <input className="input" type="number" placeholder="38" value={usersCount} onChange={e => setUsersCount(e.target.value)} />
                  </Field>
                  <Field label="Revenue ($)">
                    <input className="input" type="number" placeholder="412" value={revenueMade} onChange={e => setRevenueMade(e.target.value)} />
                  </Field>
                </div>
              </div>

              {/* Tech stack */}
              <Field label="Tech Stack">
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input className="input" style={{ flex: 1, fontSize: 12 }} placeholder="React, Supabase, TypeScript..." value={techInput} onChange={e => setTechInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTech()} />
                  <button onClick={addTech} style={{ padding: '0 14px', borderRadius: 6, background: 'rgba(0,255,255,0.06)', border: '1px solid rgba(0,255,255,0.2)', color: 'var(--cyan)', fontSize: 12, fontFamily: MONO }}>
                    <Plus size={13} />
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {techStack.map(t => (
                    <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 4, background: 'rgba(170,68,255,0.08)', border: '1px solid rgba(170,68,255,0.25)', fontSize: 11, fontFamily: MONO, color: '#AA44FF' }}>
                      {t}
                      <button onClick={() => setTechStack(s => s.filter(x => x !== t))} style={{ background: 'none', border: 'none', color: 'rgba(170,68,255,0.5)', display: 'flex', padding: 0 }}>
                        <X size={9} />
                      </button>
                    </span>
                  ))}
                </div>
              </Field>

              {/* Surviving assets */}
              <div>
                <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase' }}>What Survived?</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  {assets.map((a, i) => (
                    <button key={a.label} onClick={() => setAssets(prev => prev.map((x, j) => j === i ? { ...x, exists: !x.exists } : x))} style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '7px 10px', borderRadius: 6, textAlign: 'left',
                      background: a.exists ? 'rgba(0,255,136,0.05)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${a.exists ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      color: a.exists ? '#00FF88' : 'rgba(255,255,255,0.2)',
                      fontSize: 11, fontFamily: MONO, transition: 'all 0.15s',
                    }}>
                      {a.exists ? <CheckCircle size={10} style={{ flexShrink: 0 }} /> : <XCircle size={10} style={{ flexShrink: 0 }} />}
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Timeline builder */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Project Lifeline</div>
                  <button onClick={addTimelineItem} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 5, background: 'rgba(0,255,255,0.04)', border: '1px solid rgba(0,255,255,0.15)', color: 'var(--cyan)', fontSize: 10, fontFamily: MONO }}>
                    <Plus size={11} /> ADD
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {timeline.map((ev, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      {/* Emoji picker */}
                      <select value={ev.emoji} onChange={e => setTimeline(tl => tl.map((x, j) => j === i ? { ...x, emoji: e.target.value } : x))} style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#fff', padding: '6px 4px', fontSize: 16, width: 44 }}>
                        {TIMELINE_EMOJIS.map(em => <option key={em} value={em}>{em}</option>)}
                      </select>
                      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 6 }}>
                        <input className="input" style={{ fontSize: 12 }} placeholder="Milestone label" value={ev.label} onChange={e => setTimeline(tl => tl.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                        <input className="input" style={{ fontSize: 12 }} placeholder="Jan 2023" value={ev.milestone_date} onChange={e => setTimeline(tl => tl.map((x, j) => j === i ? { ...x, milestone_date: e.target.value } : x))} />
                        <input className="input" style={{ fontSize: 12, gridColumn: '1 / -1' }} placeholder="Short description (optional)" value={ev.description} onChange={e => setTimeline(tl => tl.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                      </div>
                      {i > 0 && (
                        <button onClick={() => setTimeline(tl => tl.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'rgba(255,40,40,0.4)', display: 'flex', padding: '4px', transition: 'color 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#FF4444'}
                          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,40,40,0.4)'}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Cover URL + Scores */}
              <Field label="Cover Image URL (optional)">
                <input className="input" placeholder="https://..." value={coverUrl} onChange={e => setCoverUrl(e.target.value)} />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label={`Potential Score: ${potentialScore}/5`}>
                  <input type="range" min={1} max={5} value={potentialScore} onChange={e => setPotentialScore(+e.target.value)} style={{ width: '100%', accentColor: 'var(--cyan)' }} />
                </Field>
                <Field label={`Revival Score: ${revivalScore}/5`}>
                  <input type="range" min={1} max={5} value={revivalScore} onChange={e => setRevivalScore(+e.target.value)} style={{ width: '100%', accentColor: '#00FF88' }} />
                </Field>
              </div>
            </div>
          )}

          {/* ── STEP 3: BOUNTY & CAPSULE ─── */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Revival Bounty */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Gift size={14} style={{ color: '#FFE000' }} />
                  <span style={{ fontSize: 10, fontFamily: MONO, color: '#FFE000', letterSpacing: '0.1em', textTransform: 'uppercase', textShadow: '0 0 8px #FFE000' }}>Revival Bounty</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: MONO }}>— what you offer to whoever revives it</span>
                </div>

                <Field label="If they achieve (milestone trigger)">
                  <input className="input" placeholder='e.g. "get 100 users within 3 months"' value={bountyTrigger} onChange={e => setBountyTrigger(e.target.value)} />
                </Field>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 12 }}>
                  {[
                    { key: 'mentorship', label: '🤝 Mentorship', val: bountyMentorship, set: setBountyMentorship },
                    { key: 'domain',     label: '🌐 Domain',     val: bountyDomain,     set: setBountyDomain     },
                    { key: 'github',     label: '🐙 GitHub Repo',val: bountyGithub,     set: setBountyGithub     },
                  ].map(opt => (
                    <button key={opt.key} onClick={() => opt.set(v => !v)} style={{
                      padding: '8px 14px', borderRadius: 6, fontSize: 12, fontFamily: MONO,
                      background: opt.val ? 'rgba(255,224,0,0.1)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${opt.val ? 'rgba(255,224,0,0.35)' : 'rgba(255,255,255,0.07)'}`,
                      color: opt.val ? '#FFE000' : 'rgba(255,255,255,0.25)',
                      transition: 'all 0.15s',
                    }}>
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Cash Bounty ($)">
                    <input className="input" type="number" placeholder="0" value={bountyCash} onChange={e => setBountyCash(e.target.value)} />
                  </Field>
                  <Field label="Equity Offer">
                    <input className="input" placeholder='e.g. "5% equity"' value={bountyEquity} onChange={e => setBountyEquity(e.target.value)} />
                  </Field>
                </div>
                <div style={{ marginTop: 10 }}>
                  <Field label="Other Offer">
                    <input className="input" placeholder="Any other reward or commitment..." value={bountyCustom} onChange={e => setBountyCustom(e.target.value)} />
                  </Field>
                </div>
              </div>

              {/* Time Capsule */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Package size={14} style={{ color: 'var(--cyan)' }} />
                  <span style={{ fontSize: 10, fontFamily: MONO, color: 'var(--cyan)', letterSpacing: '0.1em', textTransform: 'uppercase', textShadow: '0 0 8px var(--cyan)' }}>Time Capsule</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: MONO }}>— preserve everything</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="GitHub Repo URL">
                    <input className="input" placeholder="https://github.com/..." value={capsuleRepo} onChange={e => setCapsuleRepo(e.target.value)} />
                  </Field>
                  <Field label="Live Demo URL">
                    <input className="input" placeholder="https://demo.yourdomain.com" value={capsuleDemo} onChange={e => setCapsuleDemo(e.target.value)} />
                  </Field>
                  <Field label="Figma / Design">
                    <input className="input" placeholder="https://figma.com/..." value={capsuleFigma} onChange={e => setCapsuleFigma(e.target.value)} />
                  </Field>
                  <Field label="Domain">
                    <input className="input" placeholder="yourstartup.com" value={capsuleDomain} onChange={e => setCapsuleDomain(e.target.value)} />
                  </Field>
                  <Field label="Last Commit Date">
                    <input className="input" type="date" value={capsuleLastCommit} onChange={e => setCapsuleLastCommit(e.target.value)} />
                  </Field>
                </div>
                <div style={{ marginTop: 10 }}>
                  <Field label="Lessons Learned">
                    <TextArea value={capsuleLessons} onChange={setCapsuleLessons} placeholder="The most important things you learned building this..." rows={3} />
                  </Field>
                </div>
                <div style={{ marginTop: 10 }}>
                  <Field label="Final Message / Transmission">
                    <TextArea value={capsuleFinalMsg} onChange={setCapsuleFinalMsg} placeholder="Last words. What do you want people to know when they open this capsule?" rows={2} />
                  </Field>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', borderRadius: 6,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: MONO, letterSpacing: '0.06em',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}
            >
              <ChevronLeft size={13} /> BACK
            </button>
          )}

          {err && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#FF4444', fontFamily: MONO }}>
              <AlertCircle size={12} /> {err}
            </div>
          )}

          <div style={{ flex: 1 }} />

          {step < 3 ? (
            <button
              onClick={() => canNext && setStep(s => s + 1)}
              disabled={!canNext}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '11px 24px', borderRadius: 6,
                background: canNext ? 'rgba(0,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${canNext ? 'rgba(0,255,255,0.35)' : 'rgba(255,255,255,0.06)'}`,
                color: canNext ? 'var(--cyan)' : 'rgba(255,255,255,0.15)',
                fontSize: 12, fontFamily: MONO, letterSpacing: '0.1em',
                textShadow: canNext ? '0 0 8px var(--cyan)' : 'none',
                boxShadow: canNext ? '0 0 16px rgba(0,255,255,0.1)' : 'none',
                transition: 'all 0.15s', opacity: !canNext ? 0.5 : 1,
              }}
            >
              NEXT <ChevronRight size={13} />
            </button>
          ) : (
            <button
              onClick={handlePublish}
              disabled={publishing}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '11px 28px', borderRadius: 6,
                background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.35)',
                color: '#00FF88', fontSize: 12, fontFamily: MONO, letterSpacing: '0.1em',
                textShadow: '0 0 8px #00FF88', boxShadow: '0 0 20px rgba(0,255,136,0.12)',
                transition: 'all 0.15s',
              }}
            >
              {publishing
                ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> ARCHIVING...</>
                : <>☠ ARCHIVE IT</>
              }
            </button>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
