import { getSupportCount, type Snapshot } from '@/beta/data'
import type { Project, ProjectCategory } from '../types/project'

/** Activity is derived from saved records; elapsed time never manufactures progress. */
export function pulseProjects(snapshot: Snapshot): Project[] {
  return snapshot.projects.map(project => {
    const steps = snapshot.history.filter(event => event.projectId === project.id)
    const evidence = snapshot.progress.filter(event => event.projectId === project.id)
    const support = getSupportCount(snapshot,project.id)
    const stage = { abandoned: 1, discovered: 2, under_revival: 3, revived: 4, completed: 5 }[project.status]
    const category: ProjectCategory = project.status === 'completed' ? 'Legend' : project.status === 'under_revival' ? 'IdeaHub' : project.category === 'Creative' ? 'Creator' : project.category as ProjectCategory
    return {
      id: project.id, name: project.title, tagline: project.requirements, description: project.description,
      founder: project.founder, category, status: project.status === 'under_revival' ? 'reviving' : ['completed', 'revived'].includes(project.status) ? 'alive' : project.status === 'discovered' ? 'decaying' : 'abandoned',
      stage, momentum: Math.min(100, evidence.length * 10 + steps.length * 5), followers: support,
      viewCount: 0, foundedYear: new Date(project.createdAt).getFullYear(), failureYear: null,
      failureReason: project.status === 'abandoned' ? project.description : null,
      tags: [project.category, project.status, ...(steps.some(e => e.to === 'completed') ? ['completed-history'] : [])], connections: [], createdAt: project.createdAt, updatedAt: project.updatedAt,
    }
  })
}
