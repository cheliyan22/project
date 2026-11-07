/*
# Badges, Leaderboard & Founder Circle

1. New Tables
   - `badges`: catalog of all available badges (id, slug, name, description, icon, rarity, xp_reward)
   - `user_badges`: junction table — which badges each user has earned (user_id, badge_id, earned_at)
   - `founder_circle`: first 100 sign-ups get a founder slot (user_id, slot_number, joined_at)
   - `leaderboard_cache`: materialized snapshot of top users by XP (updated on profile change)

2. Changes to profiles
   - Add `is_founder` boolean (set automatically by trigger when founder slots remain)
   - Add `badge_count` int for quick display
   - Add `revival_count` int (how many ideas they've revived)
   - Add `ideas_submitted` int

3. Security
   - badges: public read, no write from client
   - user_badges: authenticated users can read all, insert own
   - founder_circle: public read
   - leaderboard_cache: public read

4. Seed badges catalog
*/

-- Badges catalog
CREATE TABLE IF NOT EXISTS badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  rarity text NOT NULL CHECK (rarity IN ('common','rare','epic','legendary')),
  xp_reward int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "badges_public_read" ON badges;
CREATE POLICY "badges_public_read" ON badges FOR SELECT TO anon, authenticated USING (true);

-- User badges junction
CREATE TABLE IF NOT EXISTS user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_badges_select" ON user_badges;
CREATE POLICY "user_badges_select" ON user_badges FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "user_badges_insert" ON user_badges;
CREATE POLICY "user_badges_insert" ON user_badges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Founder circle (first 100 users)
CREATE TABLE IF NOT EXISTS founder_circle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_number int NOT NULL,
  joined_at timestamptz DEFAULT now()
);

ALTER TABLE founder_circle ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "founder_circle_select" ON founder_circle;
CREATE POLICY "founder_circle_select" ON founder_circle FOR SELECT TO anon, authenticated USING (true);

-- Add columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_founder boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS badge_count int NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS revival_count int NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ideas_submitted int NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rank int;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Archaeologist';

-- Trigger: auto-assign founder circle slot on signup (first 100)
CREATE OR REPLACE FUNCTION assign_founder_slot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  next_slot int;
BEGIN
  SELECT COALESCE(MAX(slot_number), 0) + 1 INTO next_slot FROM founder_circle;
  IF next_slot <= 100 THEN
    INSERT INTO founder_circle (user_id, slot_number) VALUES (NEW.id, next_slot)
    ON CONFLICT (user_id) DO NOTHING;
    UPDATE profiles SET is_founder = true, title = 'Founding Member' WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_founder ON profiles;
CREATE TRIGGER on_profile_created_founder
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION assign_founder_slot();

-- Seed badges
INSERT INTO badges (slug, name, description, icon, rarity, xp_reward) VALUES
  ('first_blood',      'First Blood',       'Submitted your first abandoned idea',       '🩸', 'common',    50),
  ('archaeologist',    'Archaeologist',     'Discovered and examined 10 archived ideas', '🏺', 'common',    75),
  ('revivalist',       'Revivalist',        'Successfully revived an abandoned project',  '⚡', 'rare',     200),
  ('gravedigger',      'Gravedigger',       'Added 5 ideas to the graveyard',            '⚰️', 'rare',     150),
  ('necromancer',      'Necromancer',       'Revived 3 projects — you have the gift',    '💀', 'epic',     400),
  ('founding_member',  'Founding Member',   'One of the first 100 to join Reboot',       '👑', 'legendary', 1000),
  ('curator',          'Curator',           'Your idea reached 100 upvotes',             '🎖️', 'epic',     350),
  ('visionary',        'Visionary',         'Your idea was analyzed by AI and scored 5/5','🔮', 'epic',    300),
  ('ghost_hunter',     'Ghost Hunter',      'Searched and imported a GitHub repo',       '👻', 'common',    60),
  ('time_traveler',    'Time Traveler',     'Examined ideas from 3 different decades',   '⏰', 'rare',     120),
  ('oracle',           'Oracle',            'Predicted a revival before it happened',    '🌐', 'legendary', 800),
  ('night_owl',        'Night Owl',         'Submitted an idea between midnight and 4am','🦉', 'common',    40)
ON CONFLICT (slug) DO NOTHING;
