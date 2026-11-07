import { useState } from 'react';
import { Eye, Users, Bookmark, Zap, ArrowUpRight, TrendingUp } from 'lucide-react';
import type { Idea } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { useAccountGate } from '../lib/auth-gate';

const STATUS_LABELS: Record<string, string> = {
  abandoned: 'Abandoned', seeking: 'Seeking Revival',
  in_progress: 'In Progress', revived: 'Revived',
};

interface Props {
  idea: Idea;
  onClick: () => void;
  index?: number;
}

export default function IdeaCard({ idea, onClick, index = 0 }: Props) {
  const [upvoted, setUpvoted] = useState(false);
  const [localUp, setLocalUp] = useState(idea.upvotes);
  const { requireAccount } = useAccountGate();
  const [voteError,setVoteError] = useState('');
  const [voting,setVoting] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  const handleUpvote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (upvoted || voting || !requireAccount('vote')) return;
    setVoting(true); setVoteError('');
    try {
      const {data,error} = await supabase.rpc('record_idea_signal',{p_idea_id:idea.id,p_kind:'support'});
      if(error) throw error;
      setLocalUp(data.upvotes); setUpvoted(data.supported);
    } catch(error) {setVoteError(error instanceof Error?error.message:'Unable to record support.');}
    finally {setVoting(false);}
  };

  const potPct = (idea.potential_score / 5) * 100;
  const revPct = (idea.revival_score / 5) * 100;

  return (
    <article
      onClick={onClick}
      className="bg-card rounded-2xl border border-[rgba(255,255,255,0.07)] overflow-hidden cursor-pointer card-lift group animate-fade-up"
      style={{ animationDelay: `${index * 0.07}s`, animationFillMode: 'both', opacity: 0 }}
    >
      {/* Cover */}
      <div className="relative h-44 overflow-hidden bg-[#111118]">
        {idea.cover_url ? (
          <img
            src={idea.cover_url}
            alt={idea.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            style={{ filter: 'brightness(0.75) saturate(0.85)' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl">
            {idea.category === 'apps' ? '📱' : idea.category === 'games' ? '🎮' : idea.category === 'ai' ? '🤖' : idea.category === 'education' ? '📚' : '💡'}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />

        {/* Status badge */}
        <div className={`absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold badge-${idea.status}`}>
          <span className={`w-1.5 h-1.5 rounded-full animate-pulse-dot ${
            idea.status === 'revived' ? 'bg-green' :
            idea.status === 'in_progress' ? 'bg-amber' :
            idea.status === 'seeking' ? 'bg-blue-DEFAULT' : 'bg-textMuted'
          }`} />
          {STATUS_LABELS[idea.status]}
        </div>

        {/* Diff + Category top right */}
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold diff-${idea.difficulty}`}>
            {idea.difficulty}
          </span>
        </div>

        {/* Bookmark */}
        <button
          onClick={(e) => { e.stopPropagation(); setBookmarked((b) => !b); }}
          className="absolute bottom-3 right-3 w-7 h-7 rounded-lg bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/50 hover:text-white transition-all opacity-0 group-hover:opacity-100"
        >
          <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? 'fill-blue-DEFAULT text-blue-DEFAULT' : ''}`} />
        </button>
      </div>

      {/* Body */}
      <div className="p-5">
        {/* Category chip */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] font-medium text-textMuted uppercase tracking-wider">{idea.category}</span>
          {idea.ai_analyzed && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-dim text-purple text-[10px] font-semibold">
              <Zap className="w-2.5 h-2.5" /> AI Analyzed
            </span>
          )}
        </div>

        <h3 className="text-[15px] font-bold text-white mb-2 leading-snug group-hover:text-blue-DEFAULT transition-colors line-clamp-1 flex items-start justify-between gap-2">
          {idea.title}
          <ArrowUpRight className="w-4 h-4 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-blue-DEFAULT" />
        </h3>

        <p className="text-sm text-textSecondary leading-relaxed line-clamp-2 mb-4">{idea.short_desc}</p>

        {/* Creator */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-DEFAULT/40 to-purple/40 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
            {idea.is_anonymous ? '?' : idea.creator_name.charAt(0)}
          </div>
          <span className="text-xs text-textMuted">{idea.is_anonymous ? 'Anonymous' : idea.creator_name}</span>
          {idea.founded_year && (
            <span className="text-xs text-textMuted ml-auto">{idea.founded_year}–{idea.abandoned_year ?? '?'}</span>
          )}
        </div>

        {/* Scores */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-textMuted w-14 flex-shrink-0">Potential</span>
            <div className="flex-1 score-bar-track">
              <div className="score-bar-fill bg-gradient-to-r from-blue-DEFAULT to-purple" style={{ width: `${potPct}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-white w-5 text-right">{idea.potential_score}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-textMuted w-14 flex-shrink-0">Revival</span>
            <div className="flex-1 score-bar-track">
              <div className="score-bar-fill bg-gradient-to-r from-amber to-green" style={{ width: `${revPct}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-white w-5 text-right">{idea.revival_score}</span>
          </div>
        </div>

        {/* Tech stack */}
        {idea.tech_stack.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {idea.tech_stack.slice(0, 3).map((t) => (
              <span key={t} className="px-2 py-0.5 rounded-lg bg-white/5 text-[11px] text-textSecondary border border-white/6 font-mono">
                {t}
              </span>
            ))}
            {idea.tech_stack.length > 3 && (
              <span className="px-2 py-0.5 rounded-lg bg-white/5 text-[11px] text-textMuted border border-white/6">
                +{idea.tech_stack.length - 3}
              </span>
            )}
          </div>
        )}

        {voteError&&<p role="alert" className="text-xs text-red-400">{voteError}</p>}
        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-[rgba(255,255,255,0.05)]">
          <div className="flex items-center gap-3">
            <button
              onClick={handleUpvote}
              disabled={voting}
              className={`flex items-center gap-1.5 text-xs transition-colors ${upvoted ? 'text-blue-DEFAULT' : 'text-textMuted hover:text-blue-DEFAULT'}`}
            >
              <TrendingUp className={`w-3.5 h-3.5 ${upvoted ? 'fill-blue-DEFAULT/20' : ''}`} />
              <span className="font-medium tabular-nums">{localUp.toLocaleString()}</span>
            </button>
            <div className="flex items-center gap-1.5 text-xs text-textMuted">
              <Eye className="w-3.5 h-3.5" />
              <span className="tabular-nums">{idea.views.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-textMuted">
              <Users className="w-3.5 h-3.5" />
              <span className="tabular-nums">{idea.revival_count}</span>
            </div>
          </div>
          {idea.time_invested && (
            <span className="text-[11px] text-textMuted">{idea.time_invested}</span>
          )}
        </div>
      </div>
    </article>
  );
}
