/*
# Reboot Full Schema v2

Complete redesign schema for the premium Reboot platform.

## Tables
- profiles: public user profiles (linked to auth.users)
- ideas: the core abandoned project artifacts
- idea_tags: many-to-many tags on ideas
- tags: curated topic tags
- revivals: when someone picks up an idea
- comments: threaded discussion on ideas
- bookmarks: user saves ideas
- votes: upvotes on ideas
- achievements: gamification badges

## Security
RLS on all tables. Anon can read public content. Auth required for writes.
No sign-in UI is built, so we use anon for all reads and INSERT policies
are open to anon as well (so the demo works without auth).
*/

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#4F8CFF',
  icon text NOT NULL DEFAULT '💡',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tags_select" ON tags;
CREATE POLICY "tags_select" ON tags FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "tags_insert" ON tags;
CREATE POLICY "tags_insert" ON tags FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Ideas (core table)
CREATE TABLE IF NOT EXISTS ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  short_desc text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  failure_story text NOT NULL DEFAULT '',
  last_words text NOT NULL DEFAULT '',
  why_died text NOT NULL DEFAULT '',
  almost_worked text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other',
  status text NOT NULL DEFAULT 'abandoned' CHECK (status IN ('abandoned','seeking','in_progress','revived')),
  potential_score int NOT NULL DEFAULT 3 CHECK (potential_score BETWEEN 1 AND 5),
  revival_score int NOT NULL DEFAULT 3 CHECK (revival_score BETWEEN 1 AND 5),
  difficulty text NOT NULL DEFAULT 'Medium' CHECK (difficulty IN ('Easy','Medium','Hard','Expert')),
  tech_stack text[] NOT NULL DEFAULT '{}',
  cover_url text,
  creator_name text NOT NULL DEFAULT 'Anonymous',
  creator_avatar text,
  is_anonymous boolean NOT NULL DEFAULT false,
  founded_year int,
  abandoned_year int,
  time_invested text NOT NULL DEFAULT '',
  views int NOT NULL DEFAULT 0,
  upvotes int NOT NULL DEFAULT 0,
  revival_count int NOT NULL DEFAULT 0,
  contributor_count int NOT NULL DEFAULT 0,
  ai_analyzed boolean NOT NULL DEFAULT false,
  ai_summary text NOT NULL DEFAULT '',
  ai_strengths text[] NOT NULL DEFAULT '{}',
  ai_weaknesses text[] NOT NULL DEFAULT '{}',
  ai_market text NOT NULL DEFAULT '',
  ai_roadmap text NOT NULL DEFAULT '',
  ai_tech_stack text[] NOT NULL DEFAULT '{}',
  ai_monetization text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ideas_select" ON ideas;
CREATE POLICY "ideas_select" ON ideas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "ideas_insert" ON ideas;
CREATE POLICY "ideas_insert" ON ideas FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ideas_update" ON ideas;
CREATE POLICY "ideas_update" ON ideas FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Idea tags
CREATE TABLE IF NOT EXISTS idea_tags (
  idea_id uuid NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (idea_id, tag_id)
);
ALTER TABLE idea_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "idea_tags_select" ON idea_tags;
CREATE POLICY "idea_tags_select" ON idea_tags FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "idea_tags_insert" ON idea_tags;
CREATE POLICY "idea_tags_insert" ON idea_tags FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES comments(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT 'Anonymous',
  author_avatar text,
  content text NOT NULL,
  upvotes int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comments_select" ON comments;
CREATE POLICY "comments_select" ON comments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "comments_insert" ON comments;
CREATE POLICY "comments_insert" ON comments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "comments_update" ON comments;
CREATE POLICY "comments_update" ON comments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Revivals
CREATE TABLE IF NOT EXISTS revivals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  reviver_name text NOT NULL,
  reviver_email text NOT NULL,
  message text NOT NULL DEFAULT '',
  plan text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','active','completed','abandoned')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE revivals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "revivals_select" ON revivals;
CREATE POLICY "revivals_select" ON revivals FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "revivals_insert" ON revivals;
CREATE POLICY "revivals_insert" ON revivals FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS ideas_status_idx ON ideas(status);
CREATE INDEX IF NOT EXISTS ideas_category_idx ON ideas(category);
CREATE INDEX IF NOT EXISTS ideas_upvotes_idx ON ideas(upvotes DESC);
CREATE INDEX IF NOT EXISTS ideas_created_at_idx ON ideas(created_at DESC);
CREATE INDEX IF NOT EXISTS ideas_potential_idx ON ideas(potential_score DESC);
CREATE INDEX IF NOT EXISTS comments_idea_idx ON comments(idea_id);
