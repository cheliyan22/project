import { DISTRICT_MAP, type ProjectCategory } from '@/planet/types/project'
import type { CityPalette } from './cities/cityKit'

export const CITY_CATEGORIES = ['AI', 'Gaming', 'Education', 'Health', 'Creator', 'IdeaHub', 'Graveyard', 'Legend', 'Space', 'Robotics', 'Community'] as const satisfies readonly ProjectCategory[]
export type CityId = typeof CITY_CATEGORIES[number]
export function isCityId(value: ProjectCategory): value is CityId { return (CITY_CATEGORIES as readonly string[]).includes(value) }

export interface CityDefinition {
  id: CityId
  name: string
  description: string
  landmark: string
  palette: CityPalette
  environment: {bg: string; fogNear: number; fogFar: number}
  layout: {kind: 'radial' | 'grid' | 'arc' | 'spiral' | 'scatter' | 'boulevard'; radius: number; heightScale: number}
  overview: [number, number, number]
  projectCategory: ProjectCategory
}

export const CITIES: Record<CityId, CityDefinition> = {
  AI: {
    id: 'AI', name: 'AI City', description: DISTRICT_MAP.AI.description, landmark: 'Intelligence Core', projectCategory: 'AI',
    palette: {"accent": "#3DD8FF", "secondary": "#327dff", "ground": "#070f1a", "gridCell": "#12384a", "gridSection": "#1f6a8a", "body": "#0b1826", "fillerEmissive": "#14384a"},
    environment: {bg:'#050b14', fogNear:70, fogFar:210},
    layout: {kind:'radial', radius:13, heightScale:1}, overview:[58, 38, 72],
  },
  Gaming: {
    id: 'Gaming', name: 'Gaming City', description: DISTRICT_MAP.Gaming.description, landmark: 'Infinite Arcade', projectCategory: 'Gaming',
    palette: {"accent": "#FFB547", "secondary": "#B44DFF", "ground": "#140d0a", "gridCell": "#4a3412", "gridSection": "#8a5a1f", "body": "#241726", "fillerEmissive": "#3a2450"},
    environment: {bg:'#0d0812', fogNear:65, fogFar:200},
    layout: {kind:'grid', radius:16, heightScale:0.85}, overview:[60, 42, 74],
  },
  Education: {
    id: 'Education', name: 'Education City', description: DISTRICT_MAP.Education.description, landmark: 'Knowledge Tree', projectCategory: 'Education',
    palette: {"accent": "#8fd9ff", "secondary": "#e6c79a", "ground": "#081410", "gridCell": "#12402a", "gridSection": "#1f8a5a", "body": "#0a2018", "fillerEmissive": "#14402a"},
    environment: {bg:'#06120d', fogNear:65, fogFar:200},
    layout: {kind:'arc', radius:18, heightScale:1.15}, overview:[60, 38, 78],
  },
  Health: {
    id: 'Health', name: 'Health City', description: DISTRICT_MAP.Health.description, landmark: 'Regeneration Garden', projectCategory: 'Health',
    palette: {"accent": "#68e7bd", "secondary": "#b5f3df", "ground": "#0a1218", "gridCell": "#123a4a", "gridSection": "#1f6a8a", "body": "#dceef5", "fillerEmissive": "#14405a"},
    environment: {bg:'#0a1218', fogNear:60, fogFar:190},
    layout: {kind:'grid', radius:20, heightScale:0.8}, overview:[62, 36, 74],
  },
  Creator: {
    id: 'Creator', name: 'Creative City', description: DISTRICT_MAP.Creator.description, landmark: 'Imagination Engine', projectCategory: 'Creator',
    palette: {"accent": "#FF4DD8", "secondary": "#4D8CFF", "ground": "#12081a", "gridCell": "#3a1250", "gridSection": "#6a2a8a", "body": "#1a1024", "fillerEmissive": "#3a1a50"},
    environment: {bg:'#0f0818', fogNear:60, fogFar:190},
    layout: {kind:'spiral', radius:14, heightScale:0.95}, overview:[60, 38, 76],
  },
  IdeaHub: {
    id: 'IdeaHub', name: 'Revival City', description: DISTRICT_MAP.IdeaHub.description, landmark: 'Second Chance Engine', projectCategory: 'IdeaHub',
    palette: {"accent": "#5aebbf", "secondary": "#36dfc6", "ground": "#0d0f0a", "gridCell": "#3a3a12", "gridSection": "#6a5a1f", "body": "#1a1a14", "fillerEmissive": "#3a3a1a"},
    environment: {bg:'#0d0d08', fogNear:60, fogFar:190},
    layout: {kind:'scatter', radius:18, heightScale:0.85}, overview:[62, 38, 76],
  },
  Graveyard: {
    id: 'Graveyard', name: 'Graveyard', description: DISTRICT_MAP.Graveyard.description, landmark: 'Forgotten Archive', projectCategory: 'Graveyard',
    palette: {"accent": "#FF5959", "secondary": "#725178", "ground": "#0a0808", "gridCell": "#2a1215", "gridSection": "#4a1a1a", "body": "#141014", "fillerEmissive": "#1a0e10"},
    environment: {bg:'#060508', fogNear:55, fogFar:200},
    layout: {kind:'scatter', radius:26, heightScale:0.6}, overview:[62, 38, 76],
  },
  Legend: {
    id: 'Legend', name: 'Success City', description: DISTRICT_MAP.Legend.description, landmark: 'Legacy Spire', projectCategory: 'Legend',
    palette: {"accent": "#FFD27A", "secondary": "#FFF8E8", "ground": "#0d0f1a", "gridCell": "#3a3512", "gridSection": "#6a5a1f", "body": "#1a1a20", "fillerEmissive": "#40381a"},
    environment: {bg:'#0d0f1a', fogNear:65, fogFar:200},
    layout: {kind:'boulevard', radius:16, heightScale:1.4}, overview:[64, 44, 80],
  },
  Space: {
    id:'Space', name:'Space City', description:DISTRICT_MAP.Space.description, landmark:'Cosmic Observatory', projectCategory:'Space',
    palette:{accent:'#7bb8ff',secondary:'#a58bff',ground:'#090d21',gridCell:'#1b2848',gridSection:'#40558a',body:'#182746',fillerEmissive:'#254574'},
    environment:{bg:'#040717',fogNear:80,fogFar:230},
    layout:{kind:'radial',radius:20,heightScale:1.1}, overview:[62,42,80],
  },
  Robotics: {
    id:'Robotics', name:'Robotics City', description:DISTRICT_MAP.Robotics.description, landmark:'Forge Core', projectCategory:'Robotics',
    palette:{accent:'#54efc0',secondary:'#ffad53',ground:'#0c1418',gridCell:'#1b3c3a',gridSection:'#36766b',body:'#20343d',fillerEmissive:'#24524b'},
    environment:{bg:'#071013',fogNear:70,fogFar:220},
    layout:{kind:'grid',radius:18,heightScale:.85}, overview:[62,40,78],
  },
  Community: {
    id:'Community', name:'Community City', description:DISTRICT_MAP.Community.description, landmark:'Common Ground', projectCategory:'Community',
    palette:{accent:'#50ddc5',secondary:'#ffc88a',ground:'#101a1c',gridCell:'#254643',gridSection:'#427d6f',body:'#376366',fillerEmissive:'#295750'},
    environment:{bg:'#081517',fogNear:70,fogFar:220},
    layout:{kind:'arc',radius:21,heightScale:.7}, overview:[60,36,74],
  },
}

export const CITY_LABELS: Partial<Record<ProjectCategory,string>> = Object.fromEntries(CITY_CATEGORIES.map(id => [id,CITIES[id].name]))
export const CITY_ENV: Partial<Record<ProjectCategory,CityDefinition['environment']>> = Object.fromEntries(CITY_CATEGORIES.map(id => [id,CITIES[id].environment]))
