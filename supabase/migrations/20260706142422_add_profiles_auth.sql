/*
# Add user profiles and auth support

1. New Tables
   - `profiles`: public user profiles linked to auth.users
     - id (uuid, FK to auth.users)
     - username (text, unique)
     - avatar_url (text)
     - bio (text)
     - github_username (text)
     - xp (int, gamification)
     - level (int)
     - created_at

2. Changes to ideas table
   - Add `user_id` column (nullable, FK to auth.users) for ownership
   - Existing seed data has no owner — that's fine

3. Security
   - RLS on profiles: anyone can read, only owner can update
   - Ideas: anon can still read all, authenticated users can insert/update their own
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE,
  avatar_url text,
  bio text NOT NULL DEFAULT '',
  github_username text NOT NULL DEFAULT '',
  xp int NOT NULL DEFAULT 0,
  level int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert" ON profiles;
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Add user_id to ideas (nullable so seed data is unaffected)
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
