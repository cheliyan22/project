/**
 * Shared domain types for the Reboot platform.
 *
 * These types are the single source of truth for project data across every
 * module (City / Echo / Graveyard / Network). Modules import these types but
 * never depend on each other's internals.
 */

export type ProjectStatus = 'alive' | 'decaying' | 'abandoned' | 'reviving'

export type ProjectCategory =
  | 'AI'
  | 'Gaming'
  | 'Education'
  | 'Health'
  | 'Finance'
  | 'Creator'
  | 'Marketplace'
  | 'OpenSource'
  | 'Robotics'
  | 'Space'
  | 'Community'
  | 'IdeaHub'
  | 'Graveyard'
  | 'Legend'

export type AwardType =
  | 'revival'
  | 'milestone'
  | 'legend'
  | 'survivor'
  | 'community'
  | 'innovator'
  | 'comeback'
  | 'founder'
  | 'firstlook' | 'discovered' | 'historian' | 'restorer'

export interface Award {
  type: AwardType
  label: string
  description: string
  icon: string
  earnedAt: string | null
}

export interface Badge {
  id: string
  label: string
  color: string
}

export interface DistrictDef {
  id: ProjectCategory
  name: string
  shortName: string
  description: string
  theme: { color: string; emissive: string }
}

/** All Reboot districts, in canonical order. Shared by every module. */
export const DISTRICTS: DistrictDef[] = [
  { id: 'AI', name: 'AI District', shortName: 'AI', description: 'Glass towers, holographic data cubes, neural satellites.', theme: { color: '#3DD8FF', emissive: '#3DD8FF' } },
  { id: 'Gaming', name: 'Gaming District', shortName: 'Gaming', description: 'Modular arenas, unfinished platforms, impossible game spaces.', theme: { color: '#FFB547', emissive: '#FFB547' } },
  { id: 'Education', name: 'Education District', shortName: 'Education', description: 'Digital libraries, knowledge holograms.', theme: { color: '#3BFF91', emissive: '#3BFF91' } },
  { id: 'Health', name: 'Health District', shortName: 'Health', description: 'White architecture, research labs, medical drones.', theme: { color: '#F8F8F8', emissive: '#F8F8F8' } },
  { id: 'Finance', name: 'Finance District', shortName: 'Finance', description: 'Gold reflections, luxury towers, stock displays.', theme: { color: '#FFB547', emissive: '#FFB547' } },
  { id: 'Creator', name: 'Creator District', shortName: 'Creator', description: 'Abstract fragments, unfinished rooms, suspended forms.', theme: { color: '#3DD8FF', emissive: '#3DD8FF' } },
  { id: 'Marketplace', name: 'Marketplace District', shortName: 'Marketplace', description: 'Commercial buildings, digital storefronts.', theme: { color: '#3DD8FF', emissive: '#3DD8FF' } },
  { id: 'OpenSource', name: 'Open Source District', shortName: 'Open Source', description: 'Collaborative towers, shared infrastructure.', theme: { color: '#3BFF91', emissive: '#3BFF91' } },
  { id: 'Robotics', name: 'Robotics District', shortName: 'Robotics', description: 'Factories, mechanical cranes, assembly robots.', theme: { color: '#FFB547', emissive: '#FFB547' } },
  { id: 'Space', name: 'Space District', shortName: 'Space', description: 'Launch towers, satellite arrays.', theme: { color: '#3BFF91', emissive: '#3BFF91' } },
  { id: 'Community', name: 'Community District', shortName: 'Community', description: 'Gathering plazas, forum towers.', theme: { color: '#3DD8FF', emissive: '#3DD8FF' } },
  { id: 'IdeaHub', name: 'Idea Hub', shortName: 'Idea Hub', description: 'Prototype monuments and structures still becoming.', theme: { color: '#3BFF91', emissive: '#3BFF91' } },
  { id: 'Graveyard', name: 'Graveyard', shortName: 'Graveyard', description: 'Destroyed towers, dark fog, broken holograms.', theme: { color: '#FF5959', emissive: '#FF5959' } },
  { id: 'Legend', name: 'Legend District', shortName: 'Legend', description: 'Massive iconic headquarters visible from the entire city.', theme: { color: '#FFB547', emissive: '#FFB547' } },
]

export const DISTRICT_MAP: Record<ProjectCategory, DistrictDef> = Object.fromEntries(
  DISTRICTS.map((d) => [d.id, d]),
) as Record<ProjectCategory, DistrictDef>

export const CATEGORY_THEME: Record<ProjectCategory, { color: string; emissive: string }> = Object.fromEntries(
  DISTRICTS.map((d) => [d.id, d.theme]),
) as Record<ProjectCategory, { color: string; emissive: string }>

export interface Project {
  ownerId?: string | null
  temporary?: boolean
  expiresAt?: number
  buildingCustomization?: {color: string; height: number; style: 'standard'|'spire'|'pyramid'|'dome'|'crystal'; glowIntensity: number}

  id: string
  name: string
  tagline: string
  description: string
  category: ProjectCategory
  status: ProjectStatus
  /** 1..5 — drives building height in City, node size in Network, etc. */
  stage: number
  /** 0..100 — momentum score, used by Echo. */
  momentum: number
  founder: string
  foundedYear: number
  failureYear: number | null
  failureReason: string | null
  lessonsLearned?: string | null
  revivalRequirements?: string | null
  tags: string[]
  connections: string[]
  viewCount?: number
  followers: number
  createdAt: string
  updatedAt: string
}

export type NewProject = Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'temporary' | 'expiresAt' | 'ownerId' | 'viewCount'>

/** Row shape returned by Supabase. */
export interface ProjectRow {
  project_metrics?: {view_count:number} | null
  id: string
  name: string
  tagline: string
  description: string
  category: ProjectCategory
  status: ProjectStatus
  stage: number
  momentum: number
  founder: string
  founded_year: number
  failure_year: number | null
  failure_reason: string | null
  lessons_learned?: string | null
  revival_requirements?: string | null
  tags: string[]
  connections: string[]
  followers: number
  building_customization?: Project['buildingCustomization']
  firebase_uid: string | null
  created_at: string
  updated_at: string
}

export function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    viewCount: row.project_metrics?.view_count ?? 0,
    ownerId: row.firebase_uid,
    buildingCustomization: row.building_customization,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    category: row.category,
    status: row.status,
    stage: row.stage,
    momentum: row.momentum,
    founder: row.founder,
    foundedYear: row.founded_year,
    failureYear: row.failure_year,
    failureReason: row.failure_reason,
    lessonsLearned: row.lessons_learned ?? null,
    revivalRequirements: row.revival_requirements ?? null,
    tags: row.tags ?? [],
    connections: row.connections ?? [],
    followers: row.followers ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ---- Awards & badges --------------------------------------------------- //

export const AWARD_DEFINITIONS: Omit<Award, 'earnedAt'>[] = [
  { type: 'revival', label: 'Phoenix', description: 'Revived from the graveyard', icon: 'Zap' },
  { type: 'milestone', label: 'Milestone', description: 'Reached 10,000+ followers', icon: 'TrendingUp' },
  { type: 'legend', label: 'Legend', description: 'Stage 5 landmark project', icon: 'Crown' },
  { type: 'survivor', label: 'Survivor', description: 'Alive for 3+ years', icon: 'Shield' },
  { type: 'community', label: 'Community', description: '50+ connections', icon: 'Users' },
  { type: 'innovator', label: 'Innovator', description: 'In Idea Hub district', icon: 'Lightbulb' },
  { type: 'comeback', label: 'Comeback Kid', description: 'Recovered from decaying status', icon: 'RefreshCw' },
  { type: 'founder', label: 'Founder', description: 'Has a named founder on record', icon: 'UserCheck' },
  {type:'firstlook',label:'First Spark',description:'First unique beta-member view',icon:'Sparkles'},
  {type:'discovered',label:'Beyond Zero',description:'Reached 100 unique beta-member views',icon:'TrendingUp'},
  {type:'historian',label:'Memory Keeper',description:'Documented both an abandonment reason and lessons',icon:'Shield'},
  {type:'restorer',label:'Revival Blueprint',description:'Recorded what revival would require',icon:'Lightbulb'},
]

export function computeAwards(project: Project): Award[] {
  if (project.temporary) return []
  const awards: Award[] = []
  const now = new Date()
  const ageYears = (now.getTime() - new Date(project.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 365)

  if (project.status === 'reviving') {
    awards.push({ ...AWARD_DEFINITIONS[0], earnedAt: project.updatedAt })
  }
  if (project.followers >= 10000) {
    awards.push({ ...AWARD_DEFINITIONS[1], earnedAt: null })
  }
  if (project.stage >= 5) {
    awards.push({ ...AWARD_DEFINITIONS[2], earnedAt: null })
  }
  if (project.status === 'alive' && ageYears >= 3) {
    awards.push({ ...AWARD_DEFINITIONS[3], earnedAt: null })
  }
  if (project.connections.length >= 50) {
    awards.push({ ...AWARD_DEFINITIONS[4], earnedAt: null })
  }
  if (project.category === 'IdeaHub') {
    awards.push({ ...AWARD_DEFINITIONS[5], earnedAt: null })
  }
  if (project.status === 'alive' && project.momentum > 70) {
    awards.push({ ...AWARD_DEFINITIONS[6], earnedAt: null })
  }
  const founderName = project.founder.trim().replace(/\s+/g, ' ').toLowerCase()
  if (founderName && !['anonymous', 'anonymous founder', 'unknown', 'unknown founder'].includes(founderName)) {
    awards.push({ ...AWARD_DEFINITIONS[7], earnedAt: null })
  }
  if((project.viewCount??0)>=1)awards.push({...AWARD_DEFINITIONS[8],earnedAt:null})
  if((project.viewCount??0)>=100)awards.push({...AWARD_DEFINITIONS[9],earnedAt:null})
  if(project.failureReason?.trim()&&project.lessonsLearned?.trim())awards.push({...AWARD_DEFINITIONS[10],earnedAt:null})
  if(project.revivalRequirements?.trim())awards.push({...AWARD_DEFINITIONS[11],earnedAt:null})
  return awards
}

export const STATUS_BADGES: Record<ProjectStatus, Badge> = {
  alive: { id: 'alive', label: 'Alive', color: '#3BFF91' },
  reviving: { id: 'reviving', label: 'Reviving', color: '#3DD8FF' },
  decaying: { id: 'decaying', label: 'Decaying', color: '#FFB547' },
  abandoned: { id: 'abandoned', label: 'Abandoned', color: '#FF5959' },
}
