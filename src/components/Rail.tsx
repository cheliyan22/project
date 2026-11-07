import { Home, Compass, Skull, Zap, Plus, Trophy, Search, Flame, Globe2, Megaphone } from 'lucide-react';

type Page = 'home' | 'explore' | 'graveyard' | 'ai' | 'leaderboard' | 'resurrections' | 'planet' | 'community';

interface Props {
  page: Page;
  setPage: (p: Page) => void;
  onPublish: () => void;
  onSearch: () => void;
}

function RailBtn({
  icon: Icon, label, active, onClick, badge,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <button className={`rail-icon ${active ? 'active' : ''}`} onClick={onClick} style={{ position: 'relative' }}>
      <Icon size={18} />
      {badge && (
        <span style={{
          position: 'absolute', top: 4, right: 4,
          minWidth: 14, height: 14, borderRadius: 99,
          background: badge === 'beta' ? '#F59E0B' : '#EF4444',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 7, fontWeight: 800, color: '#000', fontFamily: 'monospace',
          letterSpacing: 0, padding: '0 3px',
        }}>
          {badge === 'beta' ? 'β' : badge}
        </span>
      )}
      <span className="rail-tooltip">
        {label}
        {badge === 'beta' && <span style={{ marginLeft: 6, padding: '1px 5px', borderRadius: 3, background: 'rgba(245,158,11,0.2)', color: '#F59E0B', fontSize: 9, fontWeight: 700 }}>BETA</span>}
      </span>
    </button>
  );
}

export default function Rail({ page, setPage, onPublish, onSearch }: Props) {
  return (
    <nav className="rail">
      {/* Ghost logo mark */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="30" height="30" viewBox="0 0 100 100" style={{
            filter: `drop-shadow(0 0 6px rgba(79,140,255,0.5)) drop-shadow(0 0 14px rgba(79,140,255,0.2))`,
          }}>
            <path d="M 50 8 C 28 8 16 24 16 42 L 16 80 L 23 73 L 32 80 L 41 73 L 50 80 L 59 73 L 68 80 L 77 73 L 84 80 L 84 42 C 84 24 72 8 50 8 Z"
              fill="none" stroke="#4F8CFF" strokeWidth="3" strokeLinejoin="round" />
            <path d="M 50 8 C 28 8 16 24 16 42 L 16 80 L 23 73 L 32 80 L 41 73 L 50 80 L 59 73 L 68 80 L 77 73 L 84 80 L 84 42 C 84 24 72 8 50 8 Z"
              fill="rgba(79,140,255,0.06)" />
            <circle cx="37" cy="44" r="7" fill="#4F8CFF" style={{ filter: 'drop-shadow(0 0 3px #4F8CFF)' }} />
            <circle cx="63" cy="44" r="7" fill="#4F8CFF" style={{ filter: 'drop-shadow(0 0 3px #4F8CFF)' }} />
            <circle cx="39" cy="46" r="3" fill="#000" />
            <circle cx="65" cy="46" r="3" fill="#000" />
            <rect x="43" y="57" width="5" height="7" rx="2" fill="#4F8CFF" opacity="0.5" />
            <rect x="49.5" y="54" width="5" height="10" rx="2" fill="#4F8CFF" opacity="0.75" />
            <rect x="56" y="51" width="5" height="13" rx="2" fill="#4F8CFF" />
          </svg>
        </div>
      </div>

      <div style={{ height: 1, width: 28, background: 'rgba(255,255,255,0.06)', margin: '8px 0 12px' }} />

      <RailBtn icon={Home}    label="Home"        active={page === 'home'}        onClick={() => setPage('home')} />
      <RailBtn icon={Compass} label="Explore"     active={page === 'explore'}     onClick={() => setPage('explore')} />
      <RailBtn icon={Skull}   label="Graveyard"   active={page === 'graveyard'}   onClick={() => setPage('graveyard')} />
      <RailBtn icon={Globe2}  label="Reboot Planet" active={page === 'planet'} onClick={() => setPage('planet')} />
      <RailBtn icon={Trophy}  label="Leaderboard"   active={page === 'leaderboard'}   onClick={() => setPage('leaderboard')} />
      <RailBtn icon={Flame}   label="Resurrections" active={page === 'resurrections'} onClick={() => setPage('resurrections')} />
      <RailBtn icon={Megaphone} label="Feedback & Roadmap" active={page === 'community'} onClick={() => setPage('community')} />
      <RailBtn icon={Zap}     label="AI Lab"      active={page === 'ai'}          onClick={() => setPage('ai')} badge="beta" />

      <div style={{ flex: 1 }} />

      <RailBtn icon={Search} label="Search" onClick={onSearch} />

      <div style={{ height: 1, width: 28, background: 'rgba(255,255,255,0.06)', margin: '12px 0 8px' }} />

      {/* Publish button */}
      <button
        onClick={onPublish}
        className="rail-icon"
        style={{ background: 'linear-gradient(135deg,rgba(79,140,255,0.18),rgba(139,92,246,0.18))', border: '1px solid rgba(79,140,255,0.3)' }}
      >
        <Plus size={18} style={{ color: '#8B9FFF' }} />
        <span className="rail-tooltip">Publish Idea</span>
      </button>
    </nav>
  );
}
