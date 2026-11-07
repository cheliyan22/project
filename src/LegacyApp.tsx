import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { Search, X, Loader2, CheckCircle, LogOut, User, Crown } from 'lucide-react';
import Rail from './components/Rail';
import Intro from './components/Intro';
import ProjectIntro from './components/ProjectIntro';
import BetaPreRegistration from './components/BetaPreRegistration';
import PublicProfile from './pages/PublicProfile';
import { hasSeenIntro, markIntroSeen } from './lib/firstRun';
import IdeaModal from './components/IdeaModal';
import PublishModal from './components/PublishModal';
import AccountGate from './components/AccountGate';
import { AccountGateProvider, type AccountReason } from './lib/auth-gate';
import Home from './pages/Home';
import Explore from './pages/Explore';
import AILab from './pages/AILab';
import Leaderboard from './pages/Leaderboard';
import Resurrections from './pages/Resurrections';
import Community from './pages/Community';
import type { Idea } from './lib/supabase';
import { supabase } from './lib/supabase';
import { useAuth } from './lib/auth';
import { forLike } from './lib/searchTerm';

const Hub = lazy(() => import('./beta-ui/Hub'));
const ExperimentalWorld = lazy(() => import('./beta-ui/World'));
const PlanetPage = lazy(() => import('./pages/PlanetPage'));

type Page = 'home' | 'explore' | 'graveyard' | 'ai' | 'leaderboard' | 'resurrections' | 'planet' | 'community';

/** What the toast says after the account panel unblocked a write. Each message
 *  names the step that is still the builder's to finish, so signing in never
 *  pretends the button already worked. */
const SIGNED_IN_COPY: Record<Exclude<AccountReason, 'publish'>, string> = {
  comment: 'Signed in. Post your comment.',
  revive: 'Signed in. Send the revival signal.',
  suggest: 'Signed in. Your draft is still there — post it.',
  vote: 'Signed in. Tap the vote again.',
};

export default function App() {
  const { user, loading, signOut } = useAuth();
  const [entered, setEntered] = useState(() => new URLSearchParams(window.location.search).has('world'));
  const [page, setPage] = useState<Page>(() => new URLSearchParams(window.location.search).has('world') ? 'planet' : 'home');
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type?: 'success' | 'info' } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState<Idea[]>([]);
  const [searching, setSearching] = useState(false);
  const latestSearch = useRef(0);
  const [exploreCategory, setExploreCategory] = useState<string | undefined>();
  const [gateReason, setGateReason] = useState<AccountReason | null>(null);
  // Read once on mount: the introduction is a first-run event, not a modal that
  // can reappear every time this component re-renders.
  const [introSeen, setIntroSeen] = useState(() => hasSeenIntro());

  // Anonymous visitors can browse and cheer, but the archive only accepts
  // signed content. Opening the account panel keeps every button honest.
  const requireAccount = useCallback((reason: AccountReason) => {
    if (user) return true;
    setGateReason(reason);
    return false;
  }, [user]);

  const openPublish = useCallback(() => {
    if (requireAccount('publish')) setShowPublish(true);
  }, [requireAccount]);

  if (/^\/hub\/?$/.test(window.location.pathname) || (window.location.pathname === '/' && !new URLSearchParams(window.location.search).has('world'))) return <Suspense fallback={<div className="planet-loader">Opening Zero Hub…</div>}><Hub /></Suspense>;

  if (new URLSearchParams(window.location.search).has('world')) return <Suspense fallback={<p role="status">Preparing the world…</p>}><ExperimentalWorld /></Suspense>;

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#04040C' }}>
        <div style={{ width: 32, height: 32, border: '2px solid rgba(79,140,255,0.2)', borderTopColor: '#4F8CFF', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (/^\/beta\/?$/.test(window.location.pathname)) return <BetaPreRegistration />;
  // A shared link is content, not an entrance: open the profile before the
  // landing gate so a shared URL always lands on the builder it names.
  const sharedProfile = window.location.pathname.match(/^\/u\/([^/]+)\/?$/);
  if (sharedProfile) {
    let username = sharedProfile[1];
    try { username = decodeURIComponent(username); }
    catch (error) { if (!(error instanceof URIError)) throw error; }
    return <PublicProfile username={username} />;
  }
  if (!entered && !user && !introSeen) {
    return <ProjectIntro onFinish={() => { markIntroSeen(); setIntroSeen(true); }} />;
  }
  if (!entered && !user) return <Intro onEnter={() => setEntered(true)} />;

  const closeSearch = () => { latestSearch.current++;setSearching(false);setSearchOpen(false); setSearchQ(''); setSearchRes([]); };

  const handleSearchChange = async (q: string) => {
    const requestId=++latestSearch.current;setSearchQ(q);
    const term=forLike(q);
    if(!term){setSearchRes([]);setSearching(false);return;}
    setSearching(true);
    try{
      const {data}=await supabase.from('ideas').select('*').or(`title.ilike.%${term}%,short_desc.ilike.%${term}%,category.ilike.%${term}%`).limit(6);
      if(requestId===latestSearch.current)setSearchRes((data as Idea[])??[]);
    }finally{if(requestId===latestSearch.current)setSearching(false);}
  };

  const showToast = (msg: string, type: 'success' | 'info' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleExplore = (category?: string) => { setExploreCategory(category); setPage('explore'); };

  return (
    <AccountGateProvider value={{ requireAccount }}>
      {page !== 'planet' && <a href="/hub" style={{ position: 'fixed', bottom: 22, right: 22, zIndex: 40, background: '#cbf77b', color: '#14221a', padding: '12px 18px', borderRadius: 24, fontWeight: 600 }}>Zero Hub ↗</a>}
      <Rail page={page} setPage={setPage} onPublish={openPublish} onSearch={() => setSearchOpen(true)} />

      <div className="page-area">
        {page === 'home'        && <Home onIdeaSelect={setSelectedIdea} onExplore={handleExplore} />}
        {page === 'explore'     && <Explore onIdeaSelect={setSelectedIdea} initialCategory={exploreCategory} />}
        {page === 'graveyard'   && <Explore onIdeaSelect={setSelectedIdea} initialStatus="abandoned" />}
        {page === 'leaderboard'   && <Leaderboard />}
        {page === 'resurrections' && <Resurrections />}
        {page === 'ai'            && <AILab />}
        {page === 'community'     && <Community />}
        {page === 'planet'        && <Suspense fallback={<div className="planet-loader">LOADING REBOOT PLANET…</div>}><PlanetPage onExit={() => setPage('home')} /></Suspense>}
      </div>

      {/* Keep the planet cinematic clear; account controls remain in the archive. */}
      {user && page !== 'planet' && (
        <div style={{
          position: 'fixed', top: 10, right: 14, zIndex: 35,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 10px 5px 8px', borderRadius: 10,
          background: 'rgba(15,15,21,0.95)', border: '1px solid rgba(255,255,255,0.07)',
          backdropFilter: 'blur(16px)',
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            background: 'linear-gradient(135deg,#4F8CFF,#8B5CF6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <User size={11} style={{ color: '#fff' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
            {user.email?.split('@')[0]}
          </span>
          <button onClick={() => setPage('leaderboard')} title="Leaderboard" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', display: 'flex', padding: '1px', transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#F59E0B'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}>
            <Crown size={12} />
          </button>
          <button onClick={signOut} title="Sign out" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', display: 'flex', padding: '1px', transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}>
            <LogOut size={11} />
          </button>
        </div>
      )}

      {/* Modals */}
      {selectedIdea && <IdeaModal idea={selectedIdea} onClose={() => setSelectedIdea(null)} />}
      {showPublish && <PublishModal onClose={() => setShowPublish(false)} onPublished={() => { setShowPublish(false); showToast('Idea archived to the museum.'); }} />}
      {gateReason && (
        <AccountGate
          reason={gateReason}
          onClose={() => setGateReason(null)}
          onSuccess={() => {
            const resumed = gateReason;
            setGateReason(null);
            if (resumed === 'publish') setShowPublish(true);
            else showToast(SIGNED_IN_COPY[resumed ?? 'comment'], 'info');
          }}
        />
      )}

      {/* Search overlay */}
      {searchOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '14vh 16px 0' }} onClick={closeSearch}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(20px)' }} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 540, background: '#0F0F18', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,0.8)', animation: 'scaleIn 0.25s cubic-bezier(0.16,1,0.3,1) both' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <Search size={15} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
              <input autoFocus style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 14, color: '#fff', fontFamily: 'Inter,sans-serif' }} placeholder="Search ideas, categories, creators..." value={searchQ} onChange={e => handleSearchChange(e.target.value)} />
              {searching ? <Loader2 size={13} style={{ color: 'rgba(255,255,255,0.25)', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} /> : <button onClick={closeSearch} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', display: 'flex' }}><X size={13} /></button>}
            </div>

            {searchRes.length > 0 && (
              <div style={{ padding: '6px 0' }}>
                {searchRes.map(idea => (
                  <button key={idea.id} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    onClick={() => { setSelectedIdea(idea); closeSearch(); }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.04)' }}>
                      {idea.cover_url && <img src={idea.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.6)' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: '#fff', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{idea.title}</p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{idea.short_desc}</p>
                    </div>
                    <span className={`chip chip-${idea.status}`} style={{ flexShrink: 0 }}>{idea.status === 'seeking' ? 'Seeking' : idea.status === 'revived' ? 'Revived' : idea.status === 'in_progress' ? 'Active' : 'Dead'}</span>
                  </button>
                ))}
              </div>
            )}

            {searchQ && searchRes.length === 0 && !searching && (
              <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>NO RESULTS FOR "{searchQ}"</div>
            )}

            {!searchQ && (
              <div style={{ padding: '14px 18px' }}>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginBottom: 10, fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Quick Access</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['AI tools', 'Mobile apps', 'Games', 'EdTech', 'Social'].map(t => (
                    <button key={t} onClick={() => handleSearchChange(t)} style={{ padding: '5px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 12, color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontFamily: 'Inter,sans-serif', transition: 'all 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,140,255,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    >{t}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 18px', borderRadius: 12,
          background: '#0F0F18', border: `1px solid ${toast.type === 'info' ? 'rgba(79,140,255,0.25)' : 'rgba(34,197,94,0.25)'}`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          animation: 'fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both',
        }}>
          <CheckCircle size={16} style={{ color: toast.type === 'info' ? '#4F8CFF' : '#22C55E', flexShrink: 0 }} />
          <p style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{toast.msg}</p>
        </div>
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes scaleIn { from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
      `}</style>
    </AccountGateProvider>
  );
}
