/*
# Add detailed narrative and scoring fields to projects

Adds the new fields shown in the Reboot X UI:
- why_it_died: founder's post-mortem on failure cause
- why_it_almost_worked: what was genuinely promising
- frustration_score: 1-5 how frustrated the founder was
- regret_score: 1-5 how much they regret abandoning it
- potential_score: 1-5 community/founder belief in the idea
- time_invested: text description like "~4 months"
- last_active_date: when the project was last touched
- potential_label: text like "HIGH POTENTIAL", "MEDIUM POTENTIAL"
- views: how many times the project detail has been viewed
- revival_attempts: how many people tried to revive it
- forks: how many times someone forked the repo
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='why_it_died') THEN
    ALTER TABLE projects ADD COLUMN why_it_died text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='why_it_almost_worked') THEN
    ALTER TABLE projects ADD COLUMN why_it_almost_worked text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='frustration_score') THEN
    ALTER TABLE projects ADD COLUMN frustration_score int NOT NULL DEFAULT 3 CHECK (frustration_score BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='regret_score') THEN
    ALTER TABLE projects ADD COLUMN regret_score int NOT NULL DEFAULT 3 CHECK (regret_score BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='potential_score') THEN
    ALTER TABLE projects ADD COLUMN potential_score int NOT NULL DEFAULT 3 CHECK (potential_score BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='time_invested') THEN
    ALTER TABLE projects ADD COLUMN time_invested text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='last_active_date') THEN
    ALTER TABLE projects ADD COLUMN last_active_date text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='potential_label') THEN
    ALTER TABLE projects ADD COLUMN potential_label text NOT NULL DEFAULT 'MEDIUM POTENTIAL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='views') THEN
    ALTER TABLE projects ADD COLUMN views int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='revival_attempts') THEN
    ALTER TABLE projects ADD COLUMN revival_attempts int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='forks') THEN
    ALTER TABLE projects ADD COLUMN forks int NOT NULL DEFAULT 0;
  END IF;
END $$;
