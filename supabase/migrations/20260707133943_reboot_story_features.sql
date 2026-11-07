/*
# Reboot Story Features — Full Project Narrative System

Adds all the "story" features to the ideas/projects:

1. **Project Timeline** — `project_timeline` table: ordered milestones with emoji, label, date, description
2. **Surviving Assets** — `surviving_assets` column (jsonb array) on ideas: what still exists
3. **Revival Bounty** — `revival_bounty` table: founder pledges (mentorship, domain, repo, etc)
4. **Founder Emotions** — `failure_emotion` text column on ideas (burnout/money/interest/etc)
5. **DNA Stats** — structured columns: `commits_count`, `users_count`, `revenue_made`, `months_built`
6. **Letter to Next Founder** — already exists as `last_words`, but also add `letter_to_founder` for long form
7. **Time Capsule** — `time_capsule` table: repo_url, screenshots, demo_url, figma_url, domain, notes, final_message
8. **Resurrections** — `resurrections` table: the "Hall of Resurrections" — verified revival success stories
9. **Almost Made It** — `almost_made_it` boolean + `almost_milestones` jsonb array on ideas
10. **What Happened Next** — `founder_update` text column on ideas

Security: All tables open to anon + authenticated (public demo mode, matching existing pattern).
*/

-- ── Timeline milestones ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  emoji text NOT NULL DEFAULT '📌',
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  milestone_date text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE project_timeline ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tl_select" ON project_timeline;
CREATE POLICY "tl_select" ON project_timeline FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "tl_insert" ON project_timeline;
CREATE POLICY "tl_insert" ON project_timeline FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "tl_update" ON project_timeline;
CREATE POLICY "tl_update" ON project_timeline FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "tl_delete" ON project_timeline;
CREATE POLICY "tl_delete" ON project_timeline FOR DELETE TO anon, authenticated USING (true);

-- ── Revival bounty ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revival_bounty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL UNIQUE REFERENCES ideas(id) ON DELETE CASCADE,
  mentorship boolean NOT NULL DEFAULT false,
  domain_handover boolean NOT NULL DEFAULT false,
  github_handover boolean NOT NULL DEFAULT false,
  equity_offer text NOT NULL DEFAULT '',
  cash_bounty int NOT NULL DEFAULT 0,
  milestone_trigger text NOT NULL DEFAULT '',
  custom_offer text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE revival_bounty ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rb_select" ON revival_bounty;
CREATE POLICY "rb_select" ON revival_bounty FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "rb_insert" ON revival_bounty;
CREATE POLICY "rb_insert" ON revival_bounty FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "rb_update" ON revival_bounty;
CREATE POLICY "rb_update" ON revival_bounty FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ── Time capsule ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_capsule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid NOT NULL UNIQUE REFERENCES ideas(id) ON DELETE CASCADE,
  repo_url text NOT NULL DEFAULT '',
  demo_url text NOT NULL DEFAULT '',
  figma_url text NOT NULL DEFAULT '',
  domain text NOT NULL DEFAULT '',
  screenshots text[] NOT NULL DEFAULT '{}',
  readme_text text NOT NULL DEFAULT '',
  final_message text NOT NULL DEFAULT '',
  lessons_learned text NOT NULL DEFAULT '',
  last_commit_date text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE time_capsule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tc_select" ON time_capsule;
CREATE POLICY "tc_select" ON time_capsule FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "tc_insert" ON time_capsule;
CREATE POLICY "tc_insert" ON time_capsule FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "tc_update" ON time_capsule;
CREATE POLICY "tc_update" ON time_capsule FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ── Resurrections (Hall of Fame revival stories) ────────────
CREATE TABLE IF NOT EXISTS resurrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id uuid REFERENCES ideas(id) ON DELETE SET NULL,
  original_title text NOT NULL,
  original_founder text NOT NULL DEFAULT 'Anonymous',
  reviver_name text NOT NULL,
  reviver_handle text NOT NULL DEFAULT '',
  current_users int NOT NULL DEFAULT 0,
  current_mrr int NOT NULL DEFAULT 0,
  months_to_revival int NOT NULL DEFAULT 0,
  story text NOT NULL DEFAULT '',
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE resurrections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "res_select" ON resurrections;
CREATE POLICY "res_select" ON resurrections FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "res_insert" ON resurrections;
CREATE POLICY "res_insert" ON resurrections FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ── Extra columns on ideas ──────────────────────────────────
DO $$ BEGIN
  -- DNA stats
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ideas' AND column_name='commits_count') THEN
    ALTER TABLE ideas ADD COLUMN commits_count int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ideas' AND column_name='users_count') THEN
    ALTER TABLE ideas ADD COLUMN users_count int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ideas' AND column_name='revenue_made') THEN
    ALTER TABLE ideas ADD COLUMN revenue_made int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ideas' AND column_name='months_built') THEN
    ALTER TABLE ideas ADD COLUMN months_built int NOT NULL DEFAULT 0;
  END IF;

  -- Founder emotion on failure
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ideas' AND column_name='failure_emotion') THEN
    ALTER TABLE ideas ADD COLUMN failure_emotion text NOT NULL DEFAULT '';
  END IF;

  -- Surviving assets (jsonb array of {label, exists})
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ideas' AND column_name='surviving_assets') THEN
    ALTER TABLE ideas ADD COLUMN surviving_assets jsonb NOT NULL DEFAULT '[]';
  END IF;

  -- Almost made it
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ideas' AND column_name='almost_made_it') THEN
    ALTER TABLE ideas ADD COLUMN almost_made_it boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ideas' AND column_name='almost_milestones') THEN
    ALTER TABLE ideas ADD COLUMN almost_milestones jsonb NOT NULL DEFAULT '[]';
  END IF;

  -- What happened next (founder life update)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ideas' AND column_name='founder_update') THEN
    ALTER TABLE ideas ADD COLUMN founder_update text NOT NULL DEFAULT '';
  END IF;

  -- Long-form letter to next founder
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ideas' AND column_name='letter_to_founder') THEN
    ALTER TABLE ideas ADD COLUMN letter_to_founder text NOT NULL DEFAULT '';
  END IF;

  -- Revival match score fields: skills required
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ideas' AND column_name='skills_required') THEN
    ALTER TABLE ideas ADD COLUMN skills_required text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- ── Seed resurrection showcase data ─────────────────────────
INSERT INTO resurrections (original_title, original_founder, reviver_name, reviver_handle, current_users, current_mrr, months_to_revival, story, verified)
VALUES
  ('AI Resume Builder', 'Marcus Chen', 'Sarah K.', '@sarahkdev', 18000, 7400, 4,
   'Marcus built this for 8 months, got 38 beta users, then burned out after losing his co-founder. Sarah found it on Reboot, reached out, and rebuilt the frontend in 3 weeks using the surviving database schema. Four months later — 18,000 users and growing.',
   true),
  ('HabitStack', 'Anonymous', 'Dev Patel', '@devpatelbuilds', 3200, 890, 7,
   'Originally abandoned after the market seemed too crowded. Dev discovered it had a unique angle the original founder missed. The existing iOS codebase saved months of work.',
   true),
  ('CodeReview.ai', 'Lena M.', 'Team of 2', '@buildersco', 5600, 2100, 2,
   'Abandoned due to API costs. New team found a way to batch requests efficiently. The GitHub repo had everything they needed. Launched in 6 weeks.',
   true)
ON CONFLICT DO NOTHING;
