import { forLike } from '../lib/searchTerm';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Megaphone, Search, ThumbsUp, AlertTriangle, Route, Trash2 } from 'lucide-react';
import {
  supabase,
  FEATURE_STATUSES,
  FEATURE_STATUS_COPY,
  type FeatureRequest,
  type FeatureStatus,
} from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useAccountGate } from '../lib/auth-gate';

const MONO = '"JetBrains Mono", "Space Mono", ui-monospace, monospace';
const TITLE_MIN = 4;
const TITLE_MAX = 120;
const BODY_MAX = 4000;
/** How many characters a builder has to type before the board counts as searched. */
const SEARCH_MIN = 3;

const TABS = [
  { id: 'requests', label: 'Feature requests', icon: Megaphone },
  { id: 'roadmap', label: 'Public roadmap', icon: Route },
] as const;

type Tab = (typeof TABS)[number]['id'];

const timeAgo = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const days = Math.floor(ms / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
};

function StatusChip({ status }: { status: FeatureStatus }) {
  const copy = FEATURE_STATUS_COPY[status];
  return (
    <span style={{
      fontSize: 9, fontFamily: MONO, fontWeight: 700, letterSpacing: '0.1em',
      padding: '2px 7px', borderRadius: 99, flexShrink: 0,
      color: copy.color,
      background: `${copy.color}1a`,
      border: `1px solid ${copy.color}55`,
    }}>{copy.label}</span>
  );
}

function VotePill({ count, mine, busy, onToggle }: {
  count: number; mine: boolean; busy: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={busy}
      aria-pressed={mine}
      aria-label={mine ? `Withdraw your vote, ${count} votes` : `Vote for this suggestion, ${count} votes`}
      style={{
        width: 54, flexShrink: 0, alignSelf: 'flex-start',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        padding: '9px 0 7px', borderRadius: 11, cursor: busy ? 'default' : 'pointer',
        fontFamily: MONO, transition: 'all 0.15s',
        background: mine ? 'rgba(79,140,255,0.14)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${mine ? 'rgba(79,140,255,0.45)' : 'rgba(255,255,255,0.08)'}`,
        color: mine ? '#4F8CFF' : 'rgba(255,255,255,0.5)',
        opacity: busy ? 0.5 : 1,
      }}
    >
      <ThumbsUp size={13} style={{ transform: mine ? 'none' : 'rotate(-20deg)' }} />
      <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{count}</span>
      <span style={{ fontSize: 7, letterSpacing: '0.1em', opacity: 0.7 }}>
        {mine ? 'YOURS' : 'VOTE'}
      </span>
    </button>
  );
}

function RequestCard({ request, mine, canWithdraw, duplicateCount, isAdmin, onVoted, onChanged, onDecide }: {
  request: FeatureRequest;
  mine: boolean;
  canWithdraw: boolean;
  duplicateCount: number;
  isAdmin: boolean;
  onVoted: (id: string) => Promise<void>;
  onChanged: () => Promise<void>;
  onDecide: (id: string, status: FeatureStatus, note: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState(request.admin_note);

  const decide = async (status: FeatureStatus) => {
    setBusy(true);
    setError(null);
    try {
      await onDecide(request.id, status, note);
      setPanelOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The decision did not save.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await onVoted(request.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The vote did not land.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.from('feature_requests').delete().eq('id', request.id);
    setBusy(false);
    setConfirming(false);
    if (err) setError(err.message);
    else await onChanged();
  };

  const canWithdrawNow = canWithdraw && request.status === 'reviewing';

  return (
    <div
      data-request-id={request.id}
      style={{
        display: 'flex', gap: 14, padding: '16px 18px', borderRadius: 14,
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${mine ? 'rgba(79,140,255,0.22)' : 'rgba(255,255,255,0.06)'}`,
        transition: 'border-color 0.15s',
      }}
    >
      <VotePill count={request.vote_count} mine={mine} busy={busy} onToggle={() => { void toggle(); }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>
            {request.title}
          </h3>
          <StatusChip status={request.status} />
          {duplicateCount > 0 && (
            <span title="Suggestions merged into this one as duplicates" style={{
              fontSize: 9, fontFamily: MONO, color: 'rgba(255,255,255,0.35)',
              padding: '2px 7px', borderRadius: 99, border: '1px solid rgba(255,255,255,0.08)',
            }}>+{duplicateCount} SAME</span>
          )}
        </div>

        {request.body && (
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.45)', margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>
            {request.body}
          </p>
        )}

        {request.admin_note && (
          <div style={{ marginTop: 8, padding: '9px 12px', borderRadius: 9, background: 'rgba(79,140,255,0.06)', border: '1px solid rgba(79,140,255,0.18)' }}>
            <p style={{ fontSize: 9, fontFamily: MONO, letterSpacing: '0.12em', color: 'rgba(79,140,255,0.6)', marginBottom: 4 }}>
              REBOOT REPLIED · {timeAgo(request.status_at)}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 }}>{request.admin_note}</p>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <span style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,255,255,0.25)' }}>
            {request.author_handle || 'builder'} · {timeAgo(request.created_at)}
          </span>
          {(isAdmin || canWithdrawNow) && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              {isAdmin && (
                <button
                  data-decide={panelOpen ? 'close' : 'open'}
                  onClick={() => { setNote(request.admin_note); setPanelOpen(o => !o); }}
                  style={{ background: 'none', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 7, padding: '3px 8px', cursor: 'pointer', fontSize: 9, fontFamily: MONO, fontWeight: 700, color: '#F59E0B', letterSpacing: '0.08em' }}
                >{panelOpen ? 'CLOSE' : 'DECIDE'}</button>
              )}
              {canWithdrawNow && (
                <button
                  onClick={() => setConfirming(true)}
                  title="Withdraw your suggestion"
                  aria-label="Withdraw your suggestion"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', display: 'flex', padding: 4 }}
                ><Trash2 size={12} /></button>
              )}
            </div>
          )}
        </div>

        {confirming && canWithdrawNow && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 9, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <p style={{ fontSize: 11, fontFamily: MONO, color: 'rgba(255,255,255,0.55)', margin: 0, flex: 1 }}>
              Deleting removes the suggestion and every vote on it. This cannot be undone.
            </p>
            <button
              onClick={() => { void remove(); }}
              disabled={busy}
              style={{ background: 'none', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 7, padding: '3px 9px', cursor: 'pointer', fontSize: 9, fontFamily: MONO, fontWeight: 700, color: '#EF4444', letterSpacing: '0.08em', opacity: busy ? 0.5 : 1 }}
            >DELETE</button>
            <button
              onClick={() => setConfirming(false)}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '3px 9px', cursor: 'pointer', fontSize: 9, fontFamily: MONO, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}
            >KEEP</button>
          </div>
        )}

        {isAdmin && panelOpen && (
          <div data-decide-panel={request.id} style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p style={{ fontSize: 9, fontFamily: MONO, letterSpacing: '0.12em', color: 'rgba(245,158,11,0.7)', marginBottom: 8 }}>
              OWNER DECISION · WRITES STATUS AND REPLY
            </p>
            <textarea
              className="input"
              value={note}
              onChange={e => setNote(e.target.value.slice(0, 2000))}
              rows={2}
              placeholder="Say why. Builders read this."
              style={{ resize: 'vertical', marginBottom: 8 }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {FEATURE_STATUSES.map(s => (
                <button
                  key={s}
                  data-status={s}
                  disabled={busy}
                  onClick={() => { void decide(s); }}
                  style={{
                    padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 10,
                    fontFamily: MONO, fontWeight: 700, letterSpacing: '0.06em',
                    background: `${FEATURE_STATUS_COPY[s].color}1a`,
                    border: `1px solid ${s === request.status ? FEATURE_STATUS_COPY[s].color : `${FEATURE_STATUS_COPY[s].color}55`}`,
                    color: FEATURE_STATUS_COPY[s].color,
                    opacity: busy ? 0.5 : 1,
                  }}
                >{FEATURE_STATUS_COPY[s].label}</button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p style={{ fontSize: 11, color: '#EF4444', fontFamily: MONO, marginTop: 8 }}>{error}</p>
        )}
      </div>
    </div>
  );
}

/** PostgREST reads `or=(a,b)` as a list, and `%`/`*` as pattern characters, so
 *  anything a builder types has to be flattened before it goes in there. */


function Composer({ onPosted }: { onPosted: (row: FeatureRequest) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [probe, setProbe] = useState('');
  const [searched, setSearched] = useState(false);
  const [similar, setSimilar] = useState<FeatureRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search-before-post is a rule from the brief, so the form will not submit
  // until the board has actually been checked for the same words.
  const check = useCallback(async () => {
    const q = forLike(probe);
    if (q.length < SEARCH_MIN) { setSearched(false); setSimilar([]); return; }
    const { data } = await supabase
      .from('feature_requests')
      .select('id, title, status, vote_count')
      .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
      .order('vote_count', { ascending: false })
      .limit(5);
    setSimilar((data as FeatureRequest[]) ?? []);
    setSearched(true);
  }, [probe]);

  useEffect(() => { setSearched(false); }, [probe]);

  const titleOk = title.trim().length >= TITLE_MIN && title.trim().length <= TITLE_MAX;
  const words = forLike(probe);
  const canPost = searched && titleOk && !busy;

  const post = async () => {
    if (!canPost) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('feature_requests')
      .insert({ title: title.trim().slice(0, TITLE_MAX), body: body.trim().slice(0, BODY_MAX) })
      .select()
      .single();
    setBusy(false);
    if (err) { setError(err.message); return; }
    onPosted(data as FeatureRequest);
    setTitle(''); setBody(''); setProbe(''); setSimilar([]); setSearched(false);
  };

  return (
    <div style={{
      padding: '18px 20px', borderRadius: 16, marginBottom: 18,
      background: 'linear-gradient(135deg,rgba(79,140,255,0.05),rgba(139,92,246,0.04))',
      border: '1px solid rgba(79,140,255,0.18)',
    }}>
      <p style={{ fontSize: 10, fontFamily: MONO, letterSpacing: '0.14em', color: 'rgba(79,140,255,0.6)', marginBottom: 12 }}>
        NEW SUGGESTION · CHECK THE BOARD FIRST
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.2)' }} />
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            value={probe}
            onChange={e => setProbe(e.target.value)}
            placeholder={`Search existing suggestions for "${probe.trim() || 'a word'}"`}
          />
        </div>
        <button className="btn-ghost" onClick={() => { void check(); }} disabled={words.length < SEARCH_MIN}>
          Search first
        </button>
      </div>

      {searched && (
        <div style={{ marginBottom: 12 }}>
          {similar.length === 0 ? (
            <p style={{ fontSize: 11, fontFamily: MONO, color: 'rgba(34,197,94,0.7)' }}>
              NOBODY ASKED FOR “{probe.trim()}” YET — POST IT.
            </p>
          ) : (
            <div style={{ padding: 10, borderRadius: 10, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <p style={{ fontSize: 9, fontFamily: MONO, letterSpacing: '0.1em', color: 'rgba(245,158,11,0.7)', marginBottom: 6 }}>
                {similar.length} ALREADY ON THE BOARD — VOTE ON ONE INSTEAD OF DUPLICATING IT
              </p>
              {similar.map(s => (
                <p key={s.id} style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: '2px 0' }}>
                  {s.vote_count} ▲ · {s.title} <span style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{FEATURE_STATUS_COPY[s.status].label}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <input
        className="input"
        value={title}
        onChange={e => setTitle(e.target.value.slice(0, TITLE_MAX))}
        placeholder={`What should Reboot do? (${TITLE_MIN}–${TITLE_MAX} characters)`}
        style={{ marginBottom: 8 }}
      />
      <textarea
        className="input"
        value={body}
        onChange={e => setBody(e.target.value.slice(0, BODY_MAX))}
        rows={3}
        placeholder="Why it matters, and what “done” looks like. Optional, up to 4000 characters."
        style={{ resize: 'vertical', marginBottom: 4 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(255,255,255,0.2)' }}>{body.length}/{BODY_MAX}</span>
        <button className="btn-primary" onClick={post} disabled={!canPost} style={{ marginLeft: 'auto' }}>
          {busy ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Posting</> : 'Post suggestion'}
        </button>
      </div>
      {!searched && (
        <p style={{ fontSize: 10, fontFamily: MONO, color: 'rgba(255,255,255,0.25)', marginTop: 8 }}>
          Searching the board first is what keeps the vote counts honest.
        </p>
      )}
      {error && (
        <p style={{ fontSize: 11, color: '#EF4444', fontFamily: MONO, marginTop: 8 }}>{error}</p>
      )}
    </div>
  );
}

export default function Community() {
  const { user } = useAuth();
  const { requireAccount } = useAccountGate();
  const [tab, setTab] = useState<Tab>('requests');
  const [rows, setRows] = useState<FeatureRequest[]>([]);
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FeatureStatus | 'all'>('all');
  const [showComposer, setShowComposer] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('feature_requests')
      .select('*')
      .order('vote_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(300);
    if (err) { setLoadError(err.message); setLoading(false); return; }
    setRows((data as FeatureRequest[]) ?? []);
    setLoadError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;

    const boot = async () => {
      await load();
      if (!user || !alive) return;
      const [votes, access] = await Promise.all([
        supabase.from('feature_votes').select('request_id').eq('user_id', user.id),
        supabase.rpc('planet_access_status'),
      ]);
      if (!alive) return;
      setMyVotes(new Set(((votes.data as { request_id: string }[]) ?? []).map(v => v.request_id)));
      setIsAdmin(Boolean((access.data as { isAdmin?: boolean } | null)?.isAdmin));
    };

    void boot();
    return () => { alive = false; };
  }, [user, load]);

  const castVote = useCallback(async (requestId: string) => {
    if (!user) { requireAccount('vote'); return; }
    const had = myVotes.has(requestId);
    if (had) {
      const { error } = await supabase.from('feature_votes').delete().eq('request_id', requestId);
      if (error) throw new Error(error.message);
      setMyVotes(prev => { const n = new Set(prev); n.delete(requestId); return n; });
    } else {
      const { error } = await supabase.from('feature_votes').insert({ request_id: requestId });
      // 23505 means the account already counted; the database is the tie-breaker.
      if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
      setMyVotes(prev => new Set(prev).add(requestId));
    }
    // Re-read the total rather than moving it locally, so the printed number is
    // always the one the database counted.
    const { data } = await supabase.from('feature_requests').select('*').eq('id', requestId).maybeSingle();
    if (data) setRows(prev => prev.map(r => (r.id === requestId ? (data as FeatureRequest) : r)));
  }, [myVotes, requireAccount, user]);

  const topLevel = useMemo(() => rows.filter(r => !r.duplicate_of), [rows]);
  const dupCounts = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach(r => { if (r.duplicate_of) m[r.duplicate_of] = (m[r.duplicate_of] ?? 0) + 1; });
    return m;
  }, [rows]);

  const visible = useMemo(
    () => (filter === 'all' ? topLevel : topLevel.filter(r => r.status === filter)),
    [topLevel, filter],
  );

  const grouped = useMemo(() => {
    const sorted = [...topLevel].sort((a, b) =>
      b.vote_count - a.vote_count || new Date(b.status_at).getTime() - new Date(a.status_at).getTime());
    return FEATURE_STATUSES.map(s => ({ status: s, items: sorted.filter(r => r.status === s) }));
  }, [topLevel]);

  const decide = useCallback(async (requestId: string, status: FeatureStatus, note: string) => {
    const { error } = await supabase
      .from('feature_requests')
      .update({ status, admin_note: note.trim().slice(0, 2000) })
      .eq('id', requestId);
    if (error) throw new Error(error.message);
    await load();
  }, [load]);

  const openComposer = () => {
    if (!requireAccount('suggest')) return;
    setShowComposer(true);
  };

  const boardMissing = loadError !== null && /feature_requests|relation.*does not exist|42P01|does not exist/i.test(loadError);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, padding: '20px 32px 0' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}>
          Feedback &amp; Roadmap
        </h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: MONO, marginTop: 5, marginBottom: 0, letterSpacing: '0.04em', maxWidth: 560, lineHeight: 1.6 }}>
          Suggestions are public. The owner replies with a status, not a promise —
          the most-voted idea is not automatically the next build.
        </p>

        {/* The account chip is pinned to the top-right corner of the window, so
            the page's own action lives on the tab row instead of that corner. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 2, padding: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 9,
                background: tab === t.id ? 'rgba(255,255,255,0.07)' : 'transparent',
                border: `1px solid ${tab === t.id ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
                cursor: 'pointer', color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.3)',
                fontSize: 13, fontWeight: 500, fontFamily: 'Inter,sans-serif', transition: 'all 0.15s',
              }}>
                <t.icon size={13} /> {t.label}
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={openComposer} style={{ marginLeft: 'auto' }}>
            <Megaphone size={13} /> Suggest something
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 32px 28px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50%', gap: 12 }}>
              <Loader2 size={22} style={{ color: '#4F8CFF', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontFamily: MONO }}>reading the board...</p>
            </div>
          ) : loadError ? (
            <div style={{ padding: 20, borderRadius: 14, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.22)' }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: MONO, color: '#EF4444', margin: '0 0 8px' }}>
                <AlertTriangle size={14} /> THE BOARD IS NOT LIVE YET
              </p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.6 }}>
                {boardMissing
                  ? 'The database behind this page has no feature_requests table yet, so nothing here can be shown honestly. The board stays empty until that migration is applied in the Supabase project this site points at.'
                  : loadError}
              </p>
            </div>
          ) : (
            <>
              {tab === 'requests' && (
                <>
                  {showComposer && (
                    <Composer
                      onPosted={row => { setShowComposer(false); setRows(prev => [row, ...prev]); }}
                    />
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    <button onClick={() => setFilter('all')} className={`chip ${filter === 'all' ? 'chip-seeking' : ''}`} style={{ cursor: 'pointer' }}>
                      All {topLevel.length}
                    </button>
                    {FEATURE_STATUSES.map(s => (
                      <button key={s} onClick={() => setFilter(s)} className={`chip ${filter === s ? 'chip-seeking' : ''}`} style={{ cursor: 'pointer' }}>
                        {FEATURE_STATUS_COPY[s].label} {topLevel.filter(r => r.status === s).length}
                      </button>
                    ))}
                  </div>

                  {visible.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '56px 0', color: 'rgba(255,255,255,0.2)' }}>
                      <Megaphone size={30} style={{ margin: '0 auto 12px' }} />
                      <p style={{ fontFamily: MONO, fontSize: 13 }}>
                        {topLevel.length === 0 ? 'The board is empty. Be the first to ask for something.' : 'Nothing with that status yet.'}
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {visible.map(r => (
                        <RequestCard
                          key={r.id}
                          request={r}
                          mine={myVotes.has(r.id)}
                          canWithdraw={!!user && r.author_id === user.id}
                          duplicateCount={dupCounts[r.id] ?? 0}
                          isAdmin={isAdmin}
                          onVoted={castVote}
                          onChanged={load}
                          onDecide={decide}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              {tab === 'roadmap' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
                  <div style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ fontSize: 9, fontFamily: MONO, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>
                      WHAT EACH STATUS MEANS
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
                      {FEATURE_STATUSES.map(s => (
                        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <StatusChip status={s} />
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{FEATURE_STATUS_COPY[s].meaning}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {grouped.map(({ status, items }) => (
                    <div key={status}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <StatusChip status={status} />
                        <span style={{ fontSize: 11, fontFamily: MONO, color: 'rgba(255,255,255,0.3)' }}>
                          {items.length} {items.length === 1 ? 'suggestion' : 'suggestions'}
                        </span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
                      </div>
                      {items.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.18)', fontFamily: MONO, padding: '6px 0 0' }}>
                          nothing here — this is not a placeholder column, it is genuinely empty
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {items.map(r => (
                            <div key={r.id} style={{
                              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
                              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                            }}>
                              <span style={{ fontSize: 12, fontFamily: MONO, color: FEATURE_STATUS_COPY[status].color, minWidth: 34 }}>
                                {r.vote_count} ▲
                              </span>
                              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.title}
                              </span>
                              {r.admin_note && (
                                <span title={r.admin_note} style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(79,140,255,0.6)', flexShrink: 0 }}>REPLIED</span>
                              )}
                              <span style={{ fontSize: 9, fontFamily: MONO, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
                                {timeAgo(r.status_at)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!user && (
                <div style={{ marginTop: 22, padding: 14, borderRadius: 12, background: 'rgba(79,140,255,0.05)', border: '1px solid rgba(79,140,255,0.16)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: 0, flex: 1 }}>
                    You can read all of this as a visitor. Posting and voting need a free account, so totals stay one-per-person.
                  </p>
                  <button className="btn-ghost" onClick={() => { requireAccount('suggest'); }}>
                    Sign in
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
