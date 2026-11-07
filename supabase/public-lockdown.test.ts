import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The public hardening is only real if both halves hold: the database refuses
 * anonymous writes, and the interface never offers a write that the database
 * would reject. These tests lock both halves in place.
 */

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const sql = read('./migrations/20261028000000_lock_public_writes.sql')
const app = read('../src/LegacyApp.tsx')
const ideaModal = read('../src/components/IdeaModal.tsx')

/** Comment-free, whitespace-flattened statements. Dollar-quoted bodies are not
 *  analysed here, so splitting on semicolons is safe for the checks below. */
const statements = sql
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map(statement => statement.replace(/\s+/g, ' ').trim())
  .filter(Boolean)

const policies = statements.filter(statement => statement.startsWith('CREATE POLICY'))
const tableGrants = statements.filter(statement => /^GRANT (SELECT|INSERT|UPDATE|DELETE|ALL|REFERENCES|TRUNCATE)\b/.test(statement))

describe('public write lock-down migration', () => {
  it('keeps the dashboard copy byte-identical to the migration', () => {
    const copy = readFileSync(new URL('./dashboard/30-lock-public-writes.sql', import.meta.url), 'utf8')
    expect(copy).toBe(sql)
  })

  it('refuses to run on a schema that has not had the planet migrations applied', () => {
    expect(sql).toMatch(/to_regclass\('public\.' \|\| t\.table_name\) IS NULL/)
    expect(sql).toMatch(/Missing ideas columns/)
    expect(sql).toMatch(/coin_wallets/)
  })

  it('gives no anonymous role an INSERT policy', () => {
    const insertPolicies = policies.filter(statement => statement.includes('FOR INSERT'))
    expect(insertPolicies.length).toBeGreaterThan(0)
    for (const statement of insertPolicies) {
      expect(statement).not.toMatch(/\bTO anon\b/)
      expect(statement).toMatch(/\bTO authenticated\b/)
    }
  })

  it('gives no anonymous role anything but reading and the three counters', () => {
    const anonGrants = tableGrants.filter(statement => /\bTO anon\b/.test(statement))
    expect(anonGrants.length).toBe(3)
    for (const statement of anonGrants) {
      expect(statement).toMatch(/^GRANT SELECT\b|^GRANT UPDATE \(upvotes, views, revival_count\) ON public\.ideas/)
    }
  })

  it('drops every legacy permissive write policy the demo schema shipped with', () => {
    for (const name of [
      'ideas_insert', 'ideas_update',
      'comments_insert', 'comments_update',
      'revivals_select', 'revivals_insert',
      'tl_insert', 'tl_update', 'tl_delete',
      'rb_insert', 'rb_update',
      'tc_insert', 'tc_update',
      'tags_insert', 'idea_tags_insert',
      'res_insert',
      'profiles_insert', 'profiles_update',
      'projects_insert', 'projects_update',
      'project_tags_insert',
      'revival_requests_insert',
    ]) {
      expect(sql, `DROP POLICY for ${name}`).toContain(`DROP POLICY IF EXISTS "${name}" ON`)
    }
  })

  it('keeps the ghost counter path alive', () => {
    expect(sql).toContain('GRANT UPDATE (upvotes, views, revival_count) ON public.ideas TO anon')
    const counterPolicy = policies.find(statement => statement.startsWith('CREATE POLICY ideas_update'))
    expect(counterPolicy).toMatch(/FOR UPDATE TO anon, authenticated/)
  })

  it('stops public reading of revival contact e-mail', () => {
    const revivalRead = policies.find(statement => statement.startsWith('CREATE POLICY revivals_read'))
    expect(revivalRead).toMatch(/TO authenticated/)
    expect(revivalRead).toMatch(/user_id = auth\.uid\(\) OR public\.owns_idea\(idea_id\)/)
    expect(tableGrants).toContain('GRANT SELECT ON public.revivals TO authenticated')
    expect(tableGrants.some(g => g.includes('revivals') && g.includes('anon'))).toBe(false)
  })

  it('starts client privileges from a clean slate', () => {
    expect(sql).toMatch(/REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated/)
  })

  it('re-asserts the ideas ownership trigger because RLS cannot compare old and new rows', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.ideas_guard_ownership/)
    expect(sql).toMatch(/CREATE TRIGGER ideas_guard_ownership_update/)
    expect(sql).toMatch(/Only upvotes, views and revival_count can be updated on another project/)
  })

  it('stamps authorship server side instead of trusting the browser', () => {
    expect(sql).toMatch(/CREATE TRIGGER comments_stamp_authorship/)
    expect(sql).toMatch(/CREATE TRIGGER revivals_stamp_authorship/)
    expect(sql).toMatch(/A signed-in account is required to comment/)
  })

  it('touches no data: no DELETE FROM, no TRUNCATE, no DROP TABLE', () => {
    expect(sql).not.toMatch(/\bDELETE FROM\b/i)
    expect(sql).not.toMatch(/\bTRUNCATE\b/i)
    expect(sql).not.toMatch(/\bDROP TABLE\b/i)
    expect(sql).not.toMatch(/\bDROP COLUMN\b/i)
  })
})

describe('interface matches the lock-down', () => {
  it('routes a signed-out publisher to the account panel instead of a rejected insert', () => {
    expect(app).toMatch(/requireAccount\('publish'\)/)
    expect(app).toMatch(/onPublish=\{openPublish\}/)
    expect(ideaModal).toMatch(/requireAccount\('comment'\)/)
    expect(ideaModal).toMatch(/requireAccount\('revive'\)/)
  })

  it('uses authenticated server-derived signals instead of browser totals', () => {
    expect(ideaModal).toContain("requireAccount('vote')")
    expect(ideaModal).toContain("rpc('record_idea_signal'")
    expect(ideaModal).not.toMatch(/update\(\{ (views|upvotes|revival_count):/)
    expect(read('../src/components/IdeaCard.tsx')).toContain("rpc('record_idea_signal'")
    expect(read('./dashboard/36-verified-idea-signals.sql')).toBe(read('./migrations/20261107150000_verified_idea_signals.sql'))
  })
})
