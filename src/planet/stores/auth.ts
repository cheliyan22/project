import { refresh, getSnapshot } from '@/beta/data'
import { pulseProjects } from '@/planet/pulse/model'
import { create } from 'zustand'
import { supabase, dataConfigured } from '@/planet/lib/supabase'
import type { Idea } from '@/lib/supabase'
import type { Project, ProjectCategory, ProjectStatus } from '@/planet/types/project'

export interface PlanetUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

interface PlanetAuthState {
  user: PlanetUser | null
  initializing: boolean
}

export const useAuth = create<PlanetAuthState>(() => ({ user: null, initializing: true }))

export function syncPlanetUser(user: PlanetUser | null) {
  useAuth.setState({ user, initializing: false })
}

type IdeaRow = Idea & { user_id?: string | null; building_customization?: Project['buildingCustomization'] }

const CATEGORY_MAP: Record<string, ProjectCategory> = {
  ai: 'AI', gaming: 'Gaming', games: 'Gaming', education: 'Education', edtech: 'Education',
  health: 'Health', finance: 'Finance', fintech: 'Finance', creator: 'Creator',
  marketplace: 'Marketplace', opensource: 'OpenSource', 'open source': 'OpenSource',
  robotics: 'Robotics', space: 'Space', community: 'Community', social: 'Community',
}

function categoryFor(idea: IdeaRow): ProjectCategory {
  const key = idea.category.trim().toLowerCase()
  if (CATEGORY_MAP[key]) return CATEGORY_MAP[key]
  if (idea.status === 'revived') return 'Legend'
  if (idea.status === 'in_progress' || idea.status === 'seeking') return 'IdeaHub'
  return 'Community'
}

function statusFor(status: Idea['status']): ProjectStatus {
  if (status === 'abandoned') return 'abandoned'
  if (status === 'seeking') return 'decaying'
  if (status === 'in_progress') return 'reviving'
  return 'alive'
}

export function ideaToProject(idea: IdeaRow): Project {
  const score = Math.max(1, Math.min(5, Number(idea.revival_score) || 1))
  return {
    id: idea.id,
    ownerId: idea.user_id ?? null,
    name: idea.title,
    tagline: idea.short_desc ?? '',
    description: idea.description || idea.failure_story || '',
    category: categoryFor(idea),
    status: statusFor(idea.status),
    stage: score,
    momentum: score * 20,
    founder: idea.is_anonymous ? 'Anonymous' : idea.creator_name || 'Unknown',
    foundedYear: idea.founded_year ?? 0,
    failureYear: idea.abandoned_year ?? null,
    failureReason: idea.why_died || idea.failure_story || null,
    lessonsLearned: idea.last_words || null,
    revivalRequirements: idea.skills_required?.join(', ') || null,
    tags: idea.tech_stack ?? [],
    connections: [],
    viewCount: Math.max(0, idea.views ?? 0),
    followers: Math.max(0, idea.upvotes ?? 0),
    buildingCustomization: idea.building_customization ?? undefined,
    createdAt: idea.created_at,
    updatedAt: idea.updated_at,
  }
}

interface ProjectDataState {
  projects: Project[]
  loading: boolean
  error: string | null
  nextOffset: number
  hasMore: boolean
  fetchProjects: (more?: boolean) => Promise<void>
  updateProject: (id: string, patch: Partial<Project>) => Promise<boolean>
}

export const useProjects = create<ProjectDataState>((set, get) => ({
  projects: [], loading: false, error: null, nextOffset: 0, hasMore: false,
  async fetchProjects(more = false) {
    if (get().loading) return
    if (!dataConfigured) {
      // Experimental cities have one source: the isolated beta API, including retries.
      set({ loading: true, error: null })
      try { await refresh(); set({ projects: pulseProjects(getSnapshot()), loading: false, error: null, hasMore: false }) }
      catch { set({ loading: false, error: 'The isolated project API is unavailable. Retry when it is running.' }) }
      return
    }
    set({ loading: true, error: null })
    const from = more ? get().nextOffset : 0
    try {
      const { data, error } = await supabase.from('ideas').select('*')
        .order('created_at', { ascending: false }).order('id').range(from, from + 499)
        .abortSignal(AbortSignal.timeout(15000))
      if (error) throw error
      const saved = ((data ?? []) as IdeaRow[]).map(ideaToProject)
      set(state => ({
        projects: more ? [...state.projects, ...saved.filter(p => !state.projects.some(x => x.id === p.id))] : saved,
        loading: false, nextOffset: from + (data?.length ?? 0), hasMore: data?.length === 500,
      }))
    } catch {
      set({ loading: false, error: 'Project records could not load. Retry when connected.' })
    }
  },
  async updateProject(id, patch) {
    const owner = useAuth.getState().user
    const current = get().projects.find(p => p.id === id)
    if (!owner || !current || current.ownerId !== owner.uid) {
      set({ error: 'Only the project owner can save changes.' }); return false
    }
    if (!patch.buildingCustomization) { set({ error: 'Use the project lifecycle workflow in Zero Hub to change status.' }); return false }
    try {
      const { data, error } = await supabase.rpc('customize_project_appearance', {
        idea_id: id, config: patch.buildingCustomization,
      })
      if (error) throw error
      const saved = data?.buildingCustomization as Project['buildingCustomization'] | undefined
      if (!saved) throw new Error('The server did not confirm the appearance.')
      set(s => ({
        projects: s.projects.map(p => p.id === id ? { ...p, buildingCustomization: saved } : p),
        error: null,
      }))
      return true
    } catch {
      set({ error: 'Changes could not be saved. Please retry.' }); return false
    }
  },
}))
