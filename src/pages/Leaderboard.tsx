import { useEffect, useState } from 'react';
import { Check, Crown, Zap, TrendingUp, Award, Users, Loader2, Share2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { awardAchievements } from '../lib/achievements';
import { copyProfileLink } from '../lib/profileLink';

interface Profile {
  id: string;
  username: string;
  xp: number;
  level: number;
  title: string;
  is_founder: boolean;
  badge_count: number;
  revival_count: number;
  ideas_submitted: number;
  rank?: number;
  created_at: string;
}

interface Badge {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  xp_reward: number;
}

interface UserBadge {
  badge_id: string;
  earned_at: string;
  badges: Badge;
}

interface FounderSlot {
  user_id: string;
  slot_number: number;
  joined_at: string;
  profile?: Profile;
}

const RARITY_COLORS = {
  common: { color: '#8888A0', glow: 'rgba(136,136,160,' },
  rare:   { color: '#4F8CFF', glow: 'rgba(79,140,255,' },
  epic:   { color: '#A855F7', glow: 'rgba(168,85,247,' },
  legendary: { color: '#F59E0B', glow: 'rgba(245,158,11,' },
};

const RARITY_LABELS = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY' };

function RarityBadge({ rarity }: { rarity: Badge['rarity'] }) {
  const rc = RARITY_COLORS[rarity];
  return (
    <span style={{
      fontSize: 9, fontFamily: 'monospace', fontWeight: 700,
      letterSpacing: '0.1em', padding: '2px 6px', borderRadius: 3,
      background: `${rc.glow}0.12)`,
      border: `1px solid ${rc.glow}0.35)`,
      color: rc.color,
    }}>
      {RARITY_LABELS[rarity]}
    </span>
  );
}

function XPBar({ xp }: { xp: number }) {
  // Server level is 1 + floor(xp / 500): every level has the same XP band.
  const progressXP = Math.max(0, xp) % 500;
  const pct = progressXP / 500 * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div role="progressbar" aria-label="Progress to next level" aria-valuemin={0} aria-valuemax={500} aria-valuenow={progressXP} style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'linear-gradient(90deg,#4F8CFF,#8B5CF6)',
          borderRadius: 99, transition: 'width 1.2s cubic-bezier(0.16,1,0.3,1)',
        }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
        {xp.toLocaleString()} XP
      </span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <div style={{ fontSize: 20, filter: 'drop-shadow(0 0 8px #F59E0B)' }}>👑</div>;
  if (rank === 2) return <div style={{ fontSize: 18 }}>🥈</div>;
  if (rank === 3) return <div style={{ fontSize: 18 }}>🥉</div>;
  return <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)', fontWeight: 700, minWidth: 24, textAlign: 'center' }}>#{rank}</div>;
}

function LeaderRow({ profile, rank, isCurrentUser }: { profile: Profile; rank: number; isCurrentUser: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 20px', borderRadius: 12,
      background: isCurrentUser ? 'rgba(79,140,255,0.06)' : rank <= 3 ? 'rgba(255,255,255,0.02)' : 'transparent',
      border: `1px solid ${isCurrentUser ? 'rgba(79,140,255,0.2)' : rank <= 3 ? 'rgba(255,255,255,0.07)' : 'transparent'}`,
      transition: 'all 0.15s',
    }}
      onMouseEnter={e => { if (!isCurrentUser) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}}
      onMouseLeave={e => { if (!isCurrentUser) { e.currentTarget.style.background = rank <= 3 ? 'rgba(255,255,255,0.02)' : 'transparent'; e.currentTarget.style.borderColor = rank <= 3 ? 'rgba(255,255,255,0.07)' : 'transparent'; }}}
    >
      <RankBadge rank={rank} />

      {/* Avatar */}
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: `linear-gradient(135deg,rgba(79,140,255,0.3),rgba(139,92,246,0.3))`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 700, color: '#fff',
        border: profile.is_founder ? '2px solid #F59E0B' : '1px solid rgba(255,255,255,0.08)',
        boxShadow: profile.is_founder ? '0 0 12px rgba(245,158,11,0.3)' : 'none',
      }}>
        {(profile.username || '?')[0].toUpperCase()}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: isCurrentUser ? '#4F8CFF' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {profile.username ?? 'Unknown'}
          </span>
          {profile.is_founder && (
            <span style={{ fontSize: 9, fontFamily: 'monospace', padding: '1px 6px', borderRadius: 99, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color: '#F59E0B', fontWeight: 700, letterSpacing: '0.08em', flexShrink: 0 }}>
              FOUNDER
            </span>
          )}
          {isCurrentUser && (
            <span style={{ fontSize: 9, fontFamily: 'monospace', padding: '1px 6px', borderRadius: 99, background: 'rgba(79,140,255,0.12)', border: '1px solid rgba(79,140,255,0.35)', color: '#4F8CFF', fontWeight: 700, flexShrink: 0 }}>
              YOU
            </span>
          )}
        </div>
        <XPBar xp={profile.xp} />
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#4F8CFF' }}>{profile.xp.toLocaleString()}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', letterSpacing: '0.06em' }}>XP</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#8B5CF6' }}>Lv.{profile.level}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', letterSpacing: '0.06em' }}>LEVEL</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#22C55E' }}>{profile.revival_count}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', letterSpacing: '0.06em' }}>REVIVED</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#F59E0B' }}>{profile.badge_count}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', letterSpacing: '0.06em' }}>BADGES</div>
        </div>
      </div>
    </div>
  );
}

function BadgeCard({ badge, earned }: { badge: Badge; earned: boolean }) {
  const rc = RARITY_COLORS[badge.rarity];
  return (
    <div style={{
      padding: '16px', borderRadius: 14,
      background: earned ? `${rc.glow}0.05)` : 'rgba(255,255,255,0.02)',
      border: `1px solid ${earned ? `${rc.glow}0.25)` : 'rgba(255,255,255,0.05)'}`,
      filter: earned ? 'none' : 'grayscale(1) opacity(0.35)',
      transition: 'all 0.2s',
      cursor: 'default',
      position: 'relative', overflow: 'hidden',
    }}
      onMouseEnter={e => { if (earned) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 12px 40px ${rc.glow}0.2)`; }}}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      {earned && badge.rarity === 'legendary' && (
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 0%, ${rc.glow}0.15), transparent 60%)`, pointerEvents: 'none' }} />
      )}
      <div style={{ fontSize: 28, marginBottom: 8, filter: earned ? `drop-shadow(0 0 8px ${rc.color})` : 'none' }}>{badge.icon}</div>
      <RarityBadge rarity={badge.rarity} />
      <p style={{ fontSize: 13, fontWeight: 700, color: earned ? '#fff' : 'rgba(255,255,255,0.4)', margin: '8px 0 4px' }}>{badge.name}</p>
      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.4 }}>{badge.description}</p>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: rc.color }}>
        <Zap size={10} /> +{badge.xp_reward} XP
      </div>
    </div>
  );
}

function FounderCard({ slot }: { slot: FounderSlot }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 12,
      background: 'rgba(245,158,11,0.04)',
      border: '1px solid rgba(245,158,11,0.15)',
      display: 'flex', alignItems: 'center', gap: 10,
      transition: 'all 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.08)'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.3)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.04)'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.15)'; }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: 'linear-gradient(135deg,rgba(245,158,11,0.3),rgba(239,68,68,0.2))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, color: '#fff',
        border: '1px solid rgba(245,158,11,0.3)',
      }}>
        {(slot.profile?.username ?? '?')[0]?.toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {slot.profile?.username ?? 'Anonymous'}
        </p>
      </div>
      <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(245,158,11,0.6)', fontWeight: 700, flexShrink: 0 }}>
        #{slot.slot_number}
      </span>
    </div>
  );
}

type Tab = 'leaderboard' | 'badges' | 'founders';

export default function Leaderboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('leaderboard');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [userBadgeSlugs, setUserBadgeSlugs] = useState<Set<string>>(new Set());
  const [founders, setFounders] = useState<FounderSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [founderSlotsLeft, setFounderSlotsLeft] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const userId = user?.id;
  const [linkCopied, setLinkCopied] = useState(false);

  // The public record is /u/<username>; reading it from the loaded rows keeps the
  // share link and the profile page on one source of truth.
  const myProfile = profiles.find(p => p.id === user?.id);
  const shareRecord = async (username: string) => {
    if (await copyProfileLink(username)) {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2400);
    }
  };

  useEffect(() => {
    let active = true;
    const fetchAll = async () => {
      setLoading(true); setLoadError(null); setFounderSlotsLeft(null);
      setProfiles([]); setBadges([]); setFounders([]); setUserBadgeSlugs(new Set());
      try {
        // Evaluate optional awards before reading XP and badges so both show
        // the same committed achievement state on this first visit.
        if (userId) await awardAchievements().catch(() => null);
        const [profileResult, badgeResult, founderResult] = await Promise.all([
          supabase.from('profiles').select('*').order('xp', { ascending: false }).limit(50),
          supabase.from('badges').select('*').order('xp_reward', { ascending: false }),
          supabase.from('founder_circle').select('*').order('slot_number').limit(100),
        ]);
        if (profileResult.error) throw new Error('The leaderboard could not be loaded.');
        if (badgeResult.error) throw new Error('The badge catalogue could not be loaded.');
        if (founderResult.error) throw new Error('Founder availability could not be loaded.');
        const nextProfiles = (profileResult.data as Profile[]) ?? [];
        const nextBadges = (badgeResult.data as Badge[]) ?? [];
        const rawFounders = (founderResult.data as FounderSlot[]) ?? [];
        const founderUserIds = rawFounders.map(founder => founder.user_id).filter(Boolean);
        const profileMap: Record<string, Profile> = {};
        if (founderUserIds.length > 0) {
          const { data: foundProfiles, error } = await supabase.from('profiles').select('*').in('id', founderUserIds);
          if (error) throw new Error('Founder profiles could not be loaded.');
          (foundProfiles as Profile[] | null)?.forEach(profile => { profileMap[profile.id] = profile; });
        }
        let nextSlugs = new Set<string>();
        if (userId) {
          const { data: userBadges, error } = await supabase.from('user_badges')
            .select('badge_id, earned_at, badges(*)').eq('user_id', userId);
          if (error) throw new Error('Your earned badges could not be loaded.');
          nextSlugs = new Set(((userBadges as unknown as UserBadge[]) ?? []).map(item => item.badges?.slug).filter(Boolean));
        }
        if (!active) return;
        // Publish only a complete successful result, never failed reads as zeros.
        setProfiles(nextProfiles); setBadges(nextBadges); setUserBadgeSlugs(nextSlugs);
        setFounders(rawFounders.map(founder => ({ ...founder, profile: profileMap[founder.user_id] })));
        const highestSlot = rawFounders.reduce((max, founder) => Math.max(max, founder.slot_number), 0);
        setFounderSlotsLeft(Math.max(0, 100 - highestSlot));
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : 'Community records could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchAll();
    return () => { active = false; };
  }, [userId, retry]);

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'leaderboard', label: 'Leaderboard', icon: TrendingUp },
    { id: 'badges', label: 'Badges', icon: Award },
    { id: 'founders', label: 'Founder Circle', icon: Crown },
  ];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '20px 32px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}>
              Hall of Fame
            </h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', marginTop: 4, letterSpacing: '0.05em' }}>
              {loading ? 'Loading community records…' : loadError || founderSlotsLeft === null ? 'Founder availability unavailable' : founderSlotsLeft > 0 ? `${founderSlotsLeft} founder slots remaining` : 'Founder circle complete'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {myProfile?.username && (
              <button
                type="button"
                onClick={() => void shareRecord(myProfile.username)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10,
                  background: linkCopied ? 'rgba(34,197,94,0.1)' : 'rgba(79,140,255,0.08)',
                  border: `1px solid ${linkCopied ? 'rgba(34,197,94,0.3)' : 'rgba(79,140,255,0.22)'}`,
                  color: linkCopied ? '#22C55E' : '#8fb4ff', fontSize: 11, fontFamily: 'monospace',
                  letterSpacing: '0.06em', fontWeight: 700,
                }}
              >
                {linkCopied ? <><Check size={13} /> LINK COPIED</> : <><Share2 size={13} /> SHARE MY RECORD</>}
              </button>
            )}
            {!loading && !loadError && founderSlotsLeft !== null && founderSlotsLeft > 0 && (
              <div style={{
                padding: '8px 16px', borderRadius: 10,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Crown size={14} style={{ color: '#F59E0B' }} />
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#F59E0B', fontWeight: 700 }}>
                  {founderSlotsLeft}/100 slots left
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, padding: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, width: 'fit-content' }}>
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
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 32px 24px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%', flexDirection: 'column', gap: 12 }}>
            <Loader2 size={24} style={{ color: '#4F8CFF', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>loading hall of fame...</p>
          </div>
        ) : loadError ? (
          <section role="alert" style={{maxWidth:520,margin:'50px auto',padding:24,border:'1px solid rgba(255,255,255,.15)',borderRadius:12,color:'#e7e7ee'}}>
            <h2 style={{fontSize:18,margin:'0 0 12px'}}>Community records are unavailable</h2>
            <p>{loadError} Please try again.</p>
            <button type="button" className="btn" onClick={()=>setRetry(value=>value+1)} style={{marginTop:16}}>Retry loading</button>
          </section>
        ) : (
          <>
            {/* ── LEADERBOARD ── */}
            {tab === 'leaderboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 860, margin: '0 auto' }}>
                {/* Top 3 podium */}
                {profiles.slice(0, 3).length > 0 && (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 20, justifyContent: 'center' }}>
                    {[profiles[1], profiles[0], profiles[2]].filter(Boolean).map((p, idx) => {
                      const actualRank = [2, 1, 3][idx];
                      const sizes = [80, 100, 72];
                      const colors = ['#C0C0C0', '#F59E0B', '#CD7F32'];
                      return p ? (
                        <div key={p.id} style={{
                          flex: actualRank === 1 ? '0 0 200px' : '0 0 160px',
                          padding: '20px 16px', borderRadius: 16, textAlign: 'center',
                          background: `rgba(255,255,255,0.02)`,
                          border: `1px solid ${colors[idx]}30`,
                          position: 'relative', overflow: 'hidden',
                          transform: actualRank === 1 ? 'none' : 'translateY(12px)',
                        }}>
                          {actualRank === 1 && (
                            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.08), transparent 60%)', pointerEvents: 'none' }} />
                          )}
                          <div style={{ fontSize: sizes[idx] * 0.4, marginBottom: 8 }}>
                            {actualRank === 1 ? '👑' : actualRank === 2 ? '🥈' : '🥉'}
                          </div>
                          <div style={{
                            width: 44, height: 44, borderRadius: 12, margin: '0 auto 10px',
                            background: 'linear-gradient(135deg,rgba(79,140,255,0.3),rgba(139,92,246,0.3))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 18, fontWeight: 700, color: '#fff',
                            border: `2px solid ${colors[idx]}60`,
                            boxShadow: `0 0 16px ${colors[idx]}40`,
                          }}>
                            {(p.username || '?')[0].toUpperCase()}
                          </div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{p.username ?? 'Unknown'}</p>
                          <p style={{ fontSize: 20, fontWeight: 900, color: colors[idx], textShadow: `0 0 12px ${colors[idx]}` }}>{p.xp.toLocaleString()}</p>
                          <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', letterSpacing: '0.08em' }}>XP</p>
                          {p.is_founder && <div style={{ marginTop: 8, fontSize: 9, color: '#F59E0B', fontFamily: 'monospace', fontWeight: 700 }}>FOUNDER</div>}
                        </div>
                      ) : null;
                    })}
                  </div>
                )}

                {profiles.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.2)' }}>
                    <Users size={32} style={{ margin: '0 auto 12px' }} />
                    <p style={{ fontFamily: 'monospace', fontSize: 13 }}>No builders yet. Be the first.</p>
                  </div>
                ) : (
                  profiles.map((p, i) => (
                    <LeaderRow key={p.id} profile={p} rank={i + 1} isCurrentUser={user?.id === p.id} />
                  ))
                )}
              </div>
            )}

            {/* ── BADGES ── */}
            {tab === 'badges' && (
              <div>
                {user && userBadgeSlugs.size > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12, fontFamily: 'monospace' }}>
                      Your Badges ({userBadgeSlugs.size})
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {badges.filter(b => userBadgeSlugs.has(b.slug)).map(b => (
                        <div key={b.id} title={b.description} style={{ fontSize: 24, cursor: 'default', filter: `drop-shadow(0 0 6px ${RARITY_COLORS[b.rarity].color})` }}>
                          {b.icon}
                        </div>
                      ))}
                    </div>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '20px 0' }} />
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
                  {badges.map(b => (
                    <BadgeCard key={b.id} badge={b} earned={userBadgeSlugs.has(b.slug)} />
                  ))}
                </div>

                {!user && (
                  <div style={{ textAlign: 'center', marginTop: 24, padding: '16px', background: 'rgba(79,140,255,0.06)', border: '1px solid rgba(79,140,255,0.15)', borderRadius: 12 }}>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Sign in to earn badges and track your progress</p>
                  </div>
                )}
              </div>
            )}

            {/* ── FOUNDERS ── */}
            {tab === 'founders' && (
              <div>
                {/* Hero banner */}
                <div style={{
                  padding: '28px 32px', borderRadius: 20, marginBottom: 24,
                  background: 'linear-gradient(135deg,rgba(245,158,11,0.08),rgba(239,68,68,0.05))',
                  border: '1px solid rgba(245,158,11,0.2)',
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle,rgba(245,158,11,0.08),transparent 70%)', pointerEvents: 'none' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ fontSize: 48, lineHeight: 1 }}>👑</div>
                    <div>
                      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#F59E0B', margin: '0 0 6px', letterSpacing: '-0.02em', textShadow: '0 0 20px rgba(245,158,11,0.4)' }}>
                        Founder Circle
                      </h2>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0, lineHeight: 1.5 }}>
                        The first 100 people to join Reboot earn legendary status forever.<br />
                        {founderSlotsLeft !== null && founderSlotsLeft > 0
                          ? <><span style={{ color: '#F59E0B', fontWeight: 700 }}>{founderSlotsLeft} slots remain.</span> Sign up now to claim yours.</>
                          : <span style={{ color: '#22C55E' }}>The founder circle is complete.</span>
                        }
                      </p>
                    </div>
                  </div>
                  {/* Perks */}
                  <div style={{ display: 'flex', gap: 16, marginTop: 20, flexWrap: 'wrap' }}>
                    {['👑 Legendary badge forever', '⚡ +1000 XP bonus', '🏆 Gold username ring', '🔮 Early access to all features', '♾️ Permanent "FOUNDER" tag'].map(perk => (
                      <div key={perk} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {perk}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Slots grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
                  {founders.map(f => (
                    <FounderCard key={f.user_id} slot={f} />
                  ))}
                  {/* Empty slots */}
                  {Array.from({ length: founderSlotsLeft ?? 0 }, (_, i) => (
                    <div key={`empty-${i}`} style={{
                      padding: '12px 14px', borderRadius: 12,
                      border: '1px dashed rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.06)' }} />
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.1)', letterSpacing: '0.06em' }}>
                        #{100 - (founderSlotsLeft ?? 0) + i + 1} — OPEN
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
