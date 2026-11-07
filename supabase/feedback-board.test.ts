import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Feedback & Roadmap only works if both halves agree: the database counts votes
 * and owns the status columns, and the interface never offers a write it has no
 * right to make or a number it made up itself. The execution test runs the SQL;
 * this file locks the client to the contract that SQL installs.
 */

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const sql = read('./migrations/20261028120000_feedback_roadmap.sql')
const board = read('../src/pages/Community.tsx')
const rail = read('../src/components/Rail.tsx')
const app = read('../src/LegacyApp.tsx')
const gate = read('../src/lib/auth-gate.tsx')
const gatePanel = read('../src/components/AccountGate.tsx')
const types = read('../src/lib/supabase.ts')

describe('feedback board migration shape', () => {
  it('keeps the dashboard copy byte-identical to the migration', () => {
    expect(read('./dashboard/50-feedback-roadmap.sql')).toBe(sql)
  })

  it('makes one vote per account a primary key, not a UI rule', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.feature_votes/)
    expect(sql).toMatch(/PRIMARY KEY \(request_id, user_id\)/)
    expect(sql).toMatch(/request_id\s+uuid NOT NULL REFERENCES public\.feature_requests\(id\) ON DELETE CASCADE/)
  })

  it('counts the total from vote rows and never from a client', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.feature_vote_tally\(\)/)
    expect(sql).toMatch(/SECURITY DEFINER/)
    expect(sql).toMatch(/SET vote_count = \(SELECT count\(\*\)::integer FROM public\.feature_votes v/)
    expect(sql).toMatch(/CREATE TRIGGER feature_vote_insert_tally/)
    expect(sql).toMatch(/CREATE TRIGGER feature_vote_delete_tally/)
  })

  it('refuses anonymous suggestions and anonymous ballots', () => {
    expect(sql).toMatch(/A signed-in account is required to suggest a feature/)
    expect(sql).toMatch(/A signed-in account is required to vote/)
    // No policy in this file is granted to the anon role for a write.
    const writePolicies = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(s => s.startsWith('CREATE POLICY') && !/FOR SELECT/.test(s))
    expect(writePolicies).toHaveLength(5)
    expect(writePolicies.every(p => /TO authenticated/.test(p))).toBe(true)
  })

  it('leaves the board readable and the ballots private', () => {
    expect(sql).toMatch(/CREATE POLICY feature_requests_read ON public\.feature_requests\n\s*FOR SELECT TO anon, authenticated\n\s*USING \(true\)/)
    expect(sql).toMatch(/CREATE POLICY feature_votes_read ON public\.feature_votes\n\s*FOR SELECT TO authenticated\n\s*USING \(user_id = auth\.uid\(\)\)/)
    expect(sql).toMatch(/REVOKE ALL ON public\.feature_requests, public\.feature_votes FROM anon, authenticated, PUBLIC/)
    expect(sql).toMatch(/GRANT SELECT ON public\.feature_requests TO anon, authenticated/)
    expect(sql).not.toMatch(/GRANT UPDATE ON public\.feature_votes/)
  })

  it('reserves status, grouping and replies for the owner', () => {
    expect(sql).toMatch(/Only a Reboot admin can change a suggestion''s status, grouping or reply/)
    expect(sql).toMatch(/IF NOT public\.is_planet_admin\(\) THEN/)
    expect(sql).toMatch(/status\s+text NOT NULL DEFAULT 'reviewing'/)
    expect(sql).toMatch(/CHECK \(status IN \('reviewing', 'planned', 'building', 'shipped', 'not_now'\)\)/)
  })

  it('touches no data it did not create', () => {
    expect(sql).not.toMatch(/\bDELETE FROM\b/i)
    expect(sql).not.toMatch(/\bTRUNCATE\b/i)
    expect(sql).not.toMatch(/\bDROP TABLE\b/i)
    expect(sql).not.toMatch(/\bUPDATE public\.ideas\b/i)
  })
})

describe('interface matches the board contract', () => {
  it('routes every signed-out write to the account panel', () => {
    expect(board).toMatch(/requireAccount\('suggest'\)/)
    expect(board).toMatch(/requireAccount\('vote'\)/)
    expect(gate).toMatch(/export type AccountReason = 'publish' \| 'comment' \| 'revive' \| 'suggest' \| 'vote'/)
  })

  it('shows the reason-specific headline, not just the generic lock', () => {
    // GATE_COPY carries a title and a body for every reason. A headline nobody
    // renders is copy that died, so the panel has to print both halves.
    expect(gate).toMatch(/suggest: \{\s*title: '> THE ROADMAP IS BUILT WITH MEMBERS\.'/)
    expect(gate).toMatch(/vote: \{\s*title: '> VOTES NEED AN ACCOUNT\.'/)
    expect(gatePanel).toMatch(/\{copy\.title\}/)
    expect(gatePanel).toMatch(/\{copy\.body\}/)
    expect(gatePanel).toMatch(/RESTRICTED::ARCHIVE WRITE/)
  })

  it('never sends a vote total or an author id', () => {
    expect(board).toMatch(/\.from\('feature_votes'\)\.insert\(\{ request_id: requestId \}\)/)
    expect(board).not.toMatch(/insert\(\{[^}]*user_id/)
    expect(board).not.toMatch(/update\(\{[^}]*vote_count/)
    expect(board).not.toMatch(/insert\(\{[^}]*author_/)
  })

  it('re-reads the counted total instead of moving it locally', () => {
    const afterVote = board.slice(board.indexOf('const castVote'), board.indexOf('const openComposer'))
    expect(afterVote).toMatch(/\.from\('feature_requests'\)\.select\('\*'\)\.eq\('id', requestId\)/)
    expect(afterVote).toMatch(/vote_count/)
  })

  it('treats a duplicate ballot as already counted, not as a crash', () => {
    expect(board).toMatch(/if \(error && !\/duplicate key\/i\.test\(error\.message\)\) throw new Error\(error\.message\)/)
  })

  it('asks before destroying a suggestion and its votes', () => {
    // The trash icon only opens a confirmation; exactly one handler deletes.
    expect(board).toMatch(/onClick=\{\(\) => setConfirming\(true\)\}/)
    expect(board.match(/void remove\(\)/g)).toHaveLength(1)
    expect(board).toMatch(/every vote on it\. This cannot be undone\./)
  })

  it('says the honest thing about what a vote buys', () => {
    expect(board).toMatch(/the most-voted idea is not automatically the next build/)
    expect(types).toMatch(/not_now:[\s\S]*?Declined for this version/)
    expect(types).toMatch(/reviewing:[\s\S]*?this is the queue/)
  })

  it('is reachable from every legacy archive page through the rail', () => {
    expect(rail).toMatch(/label="Feedback & Roadmap"/)
    expect(rail).toMatch(/page === 'community'/)
    expect(app).toMatch(/\{page === 'community'\s+&& <Community \/>\}/)
    expect(app).toMatch(/suggest: 'Signed in\. Your draft is still there/)
  })

  it('shows a real error instead of an empty board when the migration is missing', () => {
    expect(board).toMatch(/THE BOARD IS NOT LIVE YET/)
    expect(board).toMatch(/no feature_requests table yet/)
    expect(board).toMatch(/board stays empty until that migration is applied/)
    // The copy must not name a project or a dashboard path: which database the
    // site talks to is configuration, and it has moved once already.
    expect(board).not.toMatch(/qctppiuemwuamhnlmcgm|vsddqasvaesndomdfnrf|APPLY-PLANET-VIA-DASHBOARD/)
  })

  it('declares the columns the database actually returns', () => {
    expect(types).toMatch(/export interface FeatureRequest \{[\s\S]*?vote_count: number;[\s\S]*?duplicate_of: string \| null;[\s\S]*?admin_note: string;/)
    expect(types).toMatch(/export type FeatureStatus = 'reviewing' \| 'planned' \| 'building' \| 'shipped' \| 'not_now'/)
  })
})
