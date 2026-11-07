import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Copy, Loader2, Share2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { copyProfileLink, profileUrl } from '@/lib/profileLink';
import './PublicProfile.css';

interface Profile {
  id: string;
  username: string | null;
  bio: string | null;
  xp: number | null;
  level: number | null;
  is_founder: boolean | null;
  title: string | null;
  badge_count: number | null;
  revival_count: number | null;
  ideas_submitted: number | null;
  created_at: string | null;
}

interface Earned {
  earned_at: string;
  badges: { slug: string; name: string; description: string; rarity: string } | null;
}

const RARITY: Record<string, string> = {
  common: '#9aa8ac',
  rare: '#4F8CFF',
  epic: '#A855F7',
  legendary: '#F59E0B',
};

type State =
  | { phase: 'loading' }
  | { phase: 'missing' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; profile: Profile; badges: Earned[] };

/** Public builder page. Reachable without an account, because a shared link has
 *  to work for whoever receives it. Only public columns are read — builds and
 *  placements stay private to their owner. */
export default function PublicProfile({ username }: { username: string }) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setState({ phase: 'loading' });
    const load = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, bio, xp, level, is_founder, title, badge_count, revival_count, ideas_submitted, created_at')
        .eq('username', username)
        .maybeSingle();

      if (!alive) return;
      if (error) { setState({ phase: 'error', message: 'This profile could not load. Try again in a moment.' }); return; }
      if (!data) { setState({ phase: 'missing' }); return; }

      const profile = data as Profile;
      const { data: earned, error: badgesError } = await supabase
        .from('user_badges')
        .select('earned_at, badges(slug, name, description, rarity)')
        .eq('user_id', profile.id)
        .order('earned_at', { ascending: false });
      if (!alive) return;
      if (badgesError) { setState({ phase: 'error', message: 'This founder’s badges could not load. Try again in a moment.' }); return; }
      setState({ phase: 'ready', profile, badges: (earned as unknown as Earned[]) ?? [] });
    };
    void load();
    return () => { alive = false; };
  }, [username]);

  const share = async () => {
    const url = profileUrl(username);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Reboot — ${username}`, text: `${username} on Reboot, an archive of abandoned projects.`, url });
        return;
      } catch { /* dismissed — fall through to copy */ }
    }
    if (await copyProfileLink(username)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    }
  };

  return (
    <div className="pp">
      <header className="pp-rail">
        <a className="pp-back" href="/"><ArrowLeft size={14} aria-hidden /> BACK TO REBOOT</a>
        <p className="pp-rail-label">PUBLIC BUILDER RECORD</p>
      </header>

      {state.phase === 'loading' && (
        <div className="pp-state" role="status"><Loader2 size={16} className="pp-spin" aria-hidden /> LOADING RECORD…</div>
      )}

      {state.phase === 'missing' && (
        <div className="pp-state" role="status">
          <p className="pp-state-title">No builder named “{username}”.</p>
          <p className="pp-state-body">The record may have been renamed, or the link may be mistyped.</p>
          <a className="pp-action" href="/">Open the archive</a>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="pp-state" role="alert">
          <p className="pp-state-title">This record did not load.</p>
          <p className="pp-state-body">{state.message}</p>
        </div>
      )}

      {state.phase === 'ready' && (
        <main className="pp-plate">
          <p className="pp-kicker">{state.profile.is_founder ? 'FOUNDING MEMBER' : 'BUILDER RECORD'}</p>
          <h1>{state.profile.username ?? username}</h1>
          <p className="pp-title">{state.profile.title ?? 'Archaeologist'}</p>
          {state.profile.bio && <p className="pp-bio">{state.profile.bio}</p>}

          <dl className="pp-stats">
            <div><dt>XP</dt><dd>{(state.profile.xp ?? 0).toLocaleString()}</dd></div>
            <div><dt>LEVEL</dt><dd>{state.profile.level ?? 1}</dd></div>
            <div><dt>IDEAS</dt><dd>{(state.profile.ideas_submitted ?? 0).toLocaleString()}</dd></div>
            <div><dt>REVIVALS</dt><dd>{(state.profile.revival_count ?? 0).toLocaleString()}</dd></div>
            <div><dt>BADGES</dt><dd>{(state.profile.badge_count ?? 0).toLocaleString()}</dd></div>
          </dl>

          <section className="pp-badges" aria-label="Earned badges">
            <p className="pp-section-label">EARNED BADGES</p>
            {state.badges.length === 0
              ? <p className="pp-empty">No badges on this record yet.</p>
              : <ul>
                  {state.badges.map((entry) => (
                    <li key={entry.badges?.slug ?? entry.earned_at} style={{ '--rarity': RARITY[entry.badges?.rarity ?? 'common'] } as React.CSSProperties}>
                      <strong>{entry.badges?.name ?? 'Badge'}</strong>
                      <span>{entry.badges?.description}</span>
                      <em>{entry.badges?.rarity}</em>
                    </li>
                  ))}
                </ul>}
          </section>

          <div className="pp-actions">
            <button type="button" className="pp-action" onClick={() => void share()}>
              {copied ? <><Check size={13} aria-hidden /> LINK COPIED</> : <><Share2 size={13} aria-hidden /> SHARE THIS RECORD</>}
            </button>
            <button type="button" className="pp-action pp-action--quiet" onClick={() => void copyProfileLink(username).then((ok) => { if (ok) { setCopied(true); window.setTimeout(() => setCopied(false), 2400); } })}>
              <Copy size={13} aria-hidden /> COPY LINK
            </button>
          </div>
        </main>
      )}
    </div>
  );
}
