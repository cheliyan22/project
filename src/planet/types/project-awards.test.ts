import { describe, expect, it } from 'vitest'
import { computeAwards, type Project } from './project'
import { ideaToProject } from '../stores/auth'
import { pulseProjects } from '../pulse/model'
import type { Idea } from '@/lib/supabase'
import type { Snapshot } from '@/beta/data'

const project: Project = {
  id: 'synthetic-test', name: 'Award fixture', tagline: '', description: '',
  category: 'AI', status: 'abandoned', stage: 1, momentum: 0, founder: '',
  foundedYear: 2026, failureYear: null, failureReason: null, tags: [],
  connections: [], followers: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01',
}
const hasFounderAward = (input: Project) => computeAwards(input).some(award => award.type === 'founder')

describe('named founder award', () => {
  it.each(['', '  \t ', 'Unknown', ' unknown ', 'Unknown Founder', 'Anonymous', 'ANONYMOUS', 'Anonymous founder', ' Anonymous\t founder '])(
    'does not treat placeholder %j as a named founder', founder => {
      expect(hasFounderAward({ ...project, founder })).toBe(false)
    },
  )

  it.each(['Ada Lovelace', '  Grace Hopper  ', '李明', 'Anonymous Collective', 'Unknown Artist']) (
    'preserves actual names and does not reject names containing placeholder words: %j', founder => {
      expect(hasFounderAward({ ...project, founder })).toBe(true)
    },
  )

  it('keeps other earned awards when a founder is anonymous', () => {
    const awarded = { ...project, founder: 'Ada', stage: 5, followers: 10000, viewCount: 100,
      failureReason: 'Synthetic test reason', lessonsLearned: 'Synthetic test lessons', revivalRequirements: 'Synthetic requirements' }
    expect(computeAwards({ ...awarded, founder: 'Anonymous founder' })).toEqual(
      computeAwards(awarded).filter(award => award.type !== 'founder'),
    )
    expect(computeAwards({ ...awarded, temporary: true })).toEqual([])
  })

  it('rejects both actual anonymous producer outputs even when private creator data exists', () => {
    const legacy = ideaToProject({ id: 'synthetic-test', category: 'AI', status: 'abandoned',
      is_anonymous: true, creator_name: 'Private founder', revival_score: 1 } as Idea)
    expect(legacy.founder).toBe('Anonymous')
    expect(hasFounderAward(legacy)).toBe(false)

    const snapshot: Snapshot = { projects: [{ id: 'synthetic-beta', title: 'Synthetic fixture', description: '',
      category: 'AI', anonymous: true, founder: 'Anonymous founder', status: 'abandoned',
      createdAt: '2026-01-01', updatedAt: '2026-01-01', requirements: '', url: '' }],
      revivals: [], progress: [], comments: [], supports: [], history: [], nominations: [], reports: [] }
    const pulse = pulseProjects(snapshot)[0]
    expect(pulse.founder).toBe('Anonymous founder')
    expect(hasFounderAward(pulse)).toBe(false)
  })
})
