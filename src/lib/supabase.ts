import { createClient } from '@supabase/supabase-js';

// This experimental build must never contact an inherited production database.
export const supabaseUrl = 'http://127.0.0.1:54321';
export const supabaseAnonKey = 'isolated-workspace-placeholder';
export const dataConfigured = false;
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async () => new Response(JSON.stringify({ message: 'Legacy database is disconnected in this experimental workspace.' }), { status: 503, headers: { 'Content-Type': 'application/json' } }) },
});

export interface Idea {
  id: string;
  title: string;
  slug: string;
  short_desc: string;
  description: string;
  failure_story: string;
  last_words: string;
  why_died: string;
  almost_worked: string;
  category: string;
  status: 'abandoned' | 'seeking' | 'in_progress' | 'revived';
  potential_score: number;
  revival_score: number;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  tech_stack: string[];
  cover_url?: string;
  creator_name: string;
  creator_avatar?: string;
  is_anonymous: boolean;
  founded_year?: number;
  abandoned_year?: number;
  time_invested: string;
  views: number;
  upvotes: number;
  revival_count: number;
  contributor_count: number;
  ai_analyzed: boolean;
  ai_summary: string;
  ai_strengths: string[];
  ai_weaknesses: string[];
  ai_market: string;
  ai_roadmap: string;
  ai_tech_stack: string[];
  ai_monetization: string;
  // Story features
  commits_count: number;
  users_count: number;
  revenue_made: number;
  months_built: number;
  failure_emotion: string;
  surviving_assets: SurvivingAsset[];
  almost_made_it: boolean;
  almost_milestones: string[];
  founder_update: string;
  letter_to_founder: string;
  skills_required: string[];
  created_at: string;
  updated_at: string;
}

export interface SurvivingAsset {
  label: string;
  exists: boolean;
}

export interface TimelineEvent {
  id?: string;
  idea_id?: string;
  emoji: string;
  label: string;
  description: string;
  milestone_date: string;
  sort_order: number;
}

export interface RevivalBounty {
  id?: string;
  idea_id?: string;
  mentorship: boolean;
  domain_handover: boolean;
  github_handover: boolean;
  equity_offer: string;
  cash_bounty: number;
  milestone_trigger: string;
  custom_offer: string;
}

export interface TimeCapsule {
  id?: string;
  idea_id?: string;
  repo_url: string;
  demo_url: string;
  figma_url: string;
  domain: string;
  screenshots: string[];
  readme_text: string;
  final_message: string;
  lessons_learned: string;
  last_commit_date: string;
}

export interface Resurrection {
  id: string;
  idea_id?: string;
  original_title: string;
  original_founder: string;
  reviver_name: string;
  reviver_handle: string;
  current_users: number;
  current_mrr: number;
  months_to_revival: number;
  story: string;
  verified: boolean;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
}

/** Feedback & Roadmap board. `vote_count` is counted by the database from the
 *  vote rows; a client never sends a total. */
export type FeatureStatus = 'reviewing' | 'planned' | 'building' | 'shipped' | 'not_now';

export interface FeatureRequest {
  id: string;
  title: string;
  body: string;
  status: FeatureStatus;
  author_id: string | null;
  author_handle: string;
  vote_count: number;
  duplicate_of: string | null;
  admin_note: string;
  created_at: string;
  updated_at: string;
  status_at: string;
}

export interface FeatureVote {
  request_id: string;
  user_id: string;
  created_at: string;
}

export const FEATURE_STATUSES: FeatureStatus[] = ['building', 'planned', 'shipped', 'reviewing', 'not_now'];

export const FEATURE_STATUS_COPY: Record<FeatureStatus, { label: string; meaning: string; color: string }> = {
  building:  { label: 'BUILDING',  meaning: 'Being made right now.',                        color: '#22C55E' },
  planned:   { label: 'PLANNED',   meaning: 'Accepted for a future round of work.',         color: '#4F8CFF' },
  shipped:   { label: 'SHIPPED',   meaning: 'Done and live in Reboot.',                     color: '#8B5CF6' },
  reviewing: { label: 'REVIEWING', meaning: 'Nobody has decided yet — this is the queue.',  color: '#9CA3AF' },
  not_now:   { label: 'NOT NOW',   meaning: 'Declined for this version, with a reason.',    color: '#EF4444' },
};
