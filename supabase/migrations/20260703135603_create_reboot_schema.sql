
/*
# Reboot Platform Schema

## Overview
Creates the core tables for the Reboot resurrection engine — a community-driven gallery
of abandoned software projects awaiting revival.

## New Tables

### projects
The main artifact. Each row represents one abandoned project submitted to Reboot.
- id: uuid primary key
- title: project name
- slug: url-safe identifier
- tagline: one-line pitch
- description: full story (markdown-supported)
- last_words: founder's farewell message — the "human-first" narrative
- category: enum (app, game, tool, platform, content, other)
- status: enum (graveyard, seeking_revival, in_revival, revived)
- tech_stack: text array of technologies used
- original_url: original project URL (may be dead)
- repo_url: github/gitlab link if available
- demo_video_url: optional video
- cover_image_url: hero image for the card
- original_founder: name of original creator
- founded_year: when it started
- death_year: when it was abandoned
- upvotes: community interest score
- revival_interest: number of people who want to revive it
- created_at / updated_at

### tags
Curated topic tags (e.g. "AI", "Social", "Mobile")
- id, name, slug, color, created_at

### project_tags
Many-to-many join between projects and tags.

### revival_requests
When someone wants to pick up a dead project.
- id, project_id, name, email, message, created_at

## Security
RLS enabled on all tables. Public read for projects/tags (no auth required).
Anon insert allowed for revival_requests. Anon insert allowed for projects (community submissions).
*/

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#6B7280',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tags_select" ON tags;
CREATE POLICY "tags_select" ON tags FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "tags_insert" ON tags;
CREATE POLICY "tags_insert" ON tags FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  tagline text NOT NULL,
  description text NOT NULL DEFAULT '',
  last_words text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('app','game','tool','platform','content','other')),
  status text NOT NULL DEFAULT 'graveyard' CHECK (status IN ('graveyard','seeking_revival','in_revival','revived')),
  tech_stack text[] NOT NULL DEFAULT '{}',
  original_url text,
  repo_url text,
  demo_video_url text,
  cover_image_url text,
  original_founder text NOT NULL DEFAULT 'Anonymous',
  founded_year int,
  death_year int,
  upvotes int NOT NULL DEFAULT 0,
  revival_interest int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "projects_insert" ON projects;
CREATE POLICY "projects_insert" ON projects FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "projects_update" ON projects;
CREATE POLICY "projects_update" ON projects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Project Tags join
CREATE TABLE IF NOT EXISTS project_tags (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);

ALTER TABLE project_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_tags_select" ON project_tags;
CREATE POLICY "project_tags_select" ON project_tags FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "project_tags_insert" ON project_tags;
CREATE POLICY "project_tags_insert" ON project_tags FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Revival Requests
CREATE TABLE IF NOT EXISTS revival_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE revival_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "revival_requests_insert" ON revival_requests;
CREATE POLICY "revival_requests_insert" ON revival_requests FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "revival_requests_select" ON revival_requests;
CREATE POLICY "revival_requests_select" ON revival_requests FOR SELECT TO anon, authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);
CREATE INDEX IF NOT EXISTS projects_category_idx ON projects(category);
CREATE INDEX IF NOT EXISTS projects_upvotes_idx ON projects(upvotes DESC);
CREATE INDEX IF NOT EXISTS projects_created_at_idx ON projects(created_at DESC);
