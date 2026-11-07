export type BuildingId =
  | 'starter-shack'
  | 'brickbox'
  | 'abandoned-shed'
  | 'modern-cube'
  | 'mini-warehouse'
  | 'research-pod'
  | 'neon-corner'
  | 'stackhouse-mini'
  | 'hackers-den-mini'
  | 'concrete-tower'
  | 'reboot-nexus'

export interface BuildingDefinition {
  id: BuildingId
  name: string
  description: string
  price: number
  isPremium: boolean
  footprint: { width: number; depth: number }
}

export const BUILDING_DEFINITIONS: readonly BuildingDefinition[] = [
  { id: 'starter-shack', name: 'Starter Shack', description: 'A modest first foothold on the planet.', price: 0, isPremium: false, footprint: { width: 1, depth: 1 } },
  { id: 'brickbox', name: 'Brickbox', description: 'A sturdy brick workspace for new ideas.', price: 0, isPremium: false, footprint: { width: 1, depth: 1 } },
  { id: 'abandoned-shed', name: 'Abandoned Shed', description: 'A forgotten shed ready for revival.', price: 0, isPremium: false, footprint: { width: 1, depth: 1 } },
  { id: 'modern-cube', name: 'Modern Cube', description: 'Clean lines and a compact modern silhouette.', price: 0, isPremium: false, footprint: { width: 1, depth: 1 } },
  { id: 'mini-warehouse', name: 'Mini Warehouse', description: 'Small-scale storage for ambitious projects.', price: 0, isPremium: false, footprint: { width: 1, depth: 1 } },
  { id: 'research-pod', name: 'Research Pod', description: 'A focused pod for experiments and discovery.', price: 0, isPremium: false, footprint: { width: 1, depth: 1 } },
  { id: 'neon-corner', name: 'Neon Corner', description: 'A bright corner for late-night building.', price: 0, isPremium: false, footprint: { width: 1, depth: 1 } },
  { id: 'stackhouse-mini', name: 'Stackhouse Mini', description: 'A compact stacked home for builders.', price: 0, isPremium: false, footprint: { width: 1, depth: 1 } },
  { id: 'hackers-den-mini', name: 'Hackers Den Mini', description: 'A small den with a hacker spirit.', price: 0, isPremium: false, footprint: { width: 1, depth: 1 } },
  { id: 'concrete-tower', name: 'Concrete Tower', description: 'A resilient concrete landmark.', price: 0, isPremium: false, footprint: { width: 1, depth: 1 } },
  { id: 'reboot-nexus', name: 'Reboot Nexus', description: 'The premium heart of a revived planet.', price: 15000, isPremium: true, footprint: { width: 2, depth: 2 } },
]

export type BuildingAccessory = 'antenna' | 'holo-sign' | 'garden' | 'solar-array'

export interface BuildingCustomization {
  exteriorColor: string
  finish: 'metal' | 'concrete' | 'obsidian' | 'wood' | 'glass'
  lightingColor: string
  accessories: BuildingAccessory[]
}

export const DEFAULT_NEXUS_CUSTOMIZATION: BuildingCustomization = {
  exteriorColor: '#20242d',
  finish: 'obsidian',
  lightingColor: '#36e4ff',
  accessories: [],
}

const FINISHES: readonly BuildingCustomization['finish'][] = ['metal', 'concrete', 'obsidian', 'wood', 'glass']
const ACCESSORIES: readonly BuildingAccessory[] = ['antenna', 'holo-sign', 'garden', 'solar-array']
const HEX_COLOR = /^#[0-9a-f]{6}$/i

function colorOrDefault(value: unknown): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : DEFAULT_NEXUS_CUSTOMIZATION.exteriorColor
}

function lightingOrDefault(value: unknown): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value : DEFAULT_NEXUS_CUSTOMIZATION.lightingColor
}

export function normalizeBuildingCustomization(input: unknown): BuildingCustomization {
  const value = typeof input === 'object' && input !== null && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {}
  const finish = typeof value.finish === 'string' && (FINISHES as readonly string[]).includes(value.finish)
    ? value.finish as BuildingCustomization['finish']
    : DEFAULT_NEXUS_CUSTOMIZATION.finish
  const accessories = Array.isArray(value.accessories)
    ? [...new Set(value.accessories.filter((item): item is BuildingAccessory =>
        typeof item === 'string' && (ACCESSORIES as readonly string[]).includes(item)
      ))]
    : [...DEFAULT_NEXUS_CUSTOMIZATION.accessories]
  return {
    exteriorColor: colorOrDefault(value.exteriorColor),
    finish,
    lightingColor: lightingOrDefault(value.lightingColor),
    accessories,
  }
}

const DEFINITIONS_BY_ID = new Map<BuildingId, BuildingDefinition>(
  BUILDING_DEFINITIONS.map((definition) => [definition.id, definition]),
)

export function getBuildingDefinition(id: BuildingId): BuildingDefinition {
  const definition = DEFINITIONS_BY_ID.get(id)
  if (!definition) throw new Error(`Unknown building definition: ${id}`)
  return definition
}
