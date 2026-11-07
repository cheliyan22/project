import { describe, expect, it } from 'vitest'
import {
  BUILDING_DEFINITIONS,
  DEFAULT_NEXUS_CUSTOMIZATION,
  normalizeBuildingCustomization,
} from './catalog'

describe('building catalogue', () => {
  it('contains ten free designs and one exactly priced Nexus', () => {
    expect(BUILDING_DEFINITIONS).toHaveLength(11)
    expect(BUILDING_DEFINITIONS.filter(definition => !definition.isPremium)).toHaveLength(10)
    expect(BUILDING_DEFINITIONS.filter(definition => definition.isPremium)).toEqual([
      expect.objectContaining({ id: 'reboot-nexus', price: 15000 }),
    ])
    expect(new Set(BUILDING_DEFINITIONS.map(definition => definition.id)).size).toBe(11)
  })

  it('normalizes untrusted customization without preserving invalid fields', () => {
    expect(normalizeBuildingCustomization({
      exteriorColor: 'red',
      finish: 'lava',
      lightingColor: '#A1b2C3',
      accessories: ['antenna', 'antenna', 'unknown', 4],
      unexpected: true,
    })).toEqual({
      ...DEFAULT_NEXUS_CUSTOMIZATION,
      lightingColor: '#A1b2C3',
      accessories: ['antenna'],
    })
    expect(normalizeBuildingCustomization(null)).toEqual(DEFAULT_NEXUS_CUSTOMIZATION)
  })
})
