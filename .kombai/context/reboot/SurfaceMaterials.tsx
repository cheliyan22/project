import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import type { CityId } from '../cityRegistry'

export type Finish = 'stone' | 'metal' | 'wood' | 'ceramic' | 'foliage'
type SurfaceMaps = { map: THREE.DataTexture; normalMap: THREE.DataTexture; roughnessMap: THREE.DataTexture }
type SurfaceBank = Partial<Record<Finish, SurfaceMaps>>
const SurfaceContext = createContext<{ bank: SurfaceBank; city?: CityId }>({ bank: {} })
const FINISHES: Finish[] = ['stone', 'metal', 'wood', 'ceramic', 'foliage']

/** Deterministic local PBR-style maps, shared by every batched material in a district. */
function makeSurface(kind: Finish): SurfaceMaps {
  const size = 512
  const color = new Uint8Array(size * size * 4)
  const normal = new Uint8Array(size * size * 4)
  const roughness = new Uint8Array(size * size * 4)
  const height = new Float32Array(size * size)
  const tint: Record<Finish, [number, number, number]> = {
    stone: [1, .995, .975], metal: [.985, 1, 1.015], wood: [1, .965, .9], ceramic: [1, 1, 1], foliage: [.92, 1, .9],
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = y * size + x, i = index * 4
    const noise = ((Math.imul(x + 1, 374761393) ^ Math.imul(y + 9, 668265263)) >>> 0) % 101 / 100
    const grain = .5 + .5 * Math.sin(x * .22 + Math.sin(y * .035) * 4)
    const brushed = .5 + .5 * Math.sin(y * 1.7 + noise * .4)
    const seam = kind === 'stone' && (y % 64 < 2 || (x + (Math.floor(y / 64) % 2) * 32) % 64 < 2)
    let value = .9, relief = .45, rough = .8
    if (kind === 'stone') {
      value = seam ? .67 : .84 + noise * .12
      relief = seam ? .12 : .44 + noise * .14
      rough = .76 + noise * .18
    } else if (kind === 'metal') {
      value = .87 + noise * .055 + brushed * .035
      relief = .44 + brushed * .07
      rough = .3 + brushed * .14
    } else if (kind === 'wood') {
      value = .72 + grain * .22 + noise * .045
      relief = .34 + grain * .26
      rough = .56 + grain * .2
    } else if (kind === 'ceramic') {
      value = .92 + noise * .055
      relief = .45 + noise * .025
      rough = .22 + noise * .1
    } else {
      value = .69 + noise * .26
      relief = .3 + noise * .36
      rough = .8 + noise * .16
    }
    height[index] = relief
    color.set([Math.min(255, value * tint[kind][0] * 255), Math.min(255, value * tint[kind][1] * 255), Math.min(255, value * tint[kind][2] * 255), 255], i)
    const r = Math.min(1, rough) * 255
    roughness.set([r, r, r, 255], i)
  }
  const normalStrength = kind === 'stone' ? 2.4 : kind === 'foliage' ? 2 : kind === 'wood' ? 1.5 : kind === 'metal' ? .8 : .45
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const left = y * size + (x + size - 1) % size, right = y * size + (x + 1) % size
    const up = ((y + size - 1) % size) * size + x, down = ((y + 1) % size) * size + x
    const dx = (height[right] - height[left]) * normalStrength, dy = (height[down] - height[up]) * normalStrength
    const length = Math.sqrt(dx * dx + dy * dy + 1), i = (y * size + x) * 4
    normal.set([(-dx / length * .5 + .5) * 255, (-dy / length * .5 + .5) * 255, (1 / length * .5 + .5) * 255, 255], i)
  }
  const texture = (data: Uint8Array) => {
    const result = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
    result.wrapS = result.wrapT = THREE.RepeatWrapping
    result.repeat.set(kind === 'wood' ? 2 : 3, kind === 'metal' ? 4 : 3)
    result.magFilter = THREE.LinearFilter
    result.minFilter = THREE.LinearMipmapLinearFilter
    result.anisotropy = 8
    result.generateMipmaps = true
    result.needsUpdate = true
    return result
  }
  const map = texture(color)
  map.colorSpace = THREE.SRGBColorSpace
  return { map, normalMap: texture(normal), roughnessMap: texture(roughness) }
}

export function SurfaceProvider({ city, low, children }: { city: CityId; low: boolean; children: ReactNode }) {
  const bank = useMemo<SurfaceBank>(() => low ? {} : Object.fromEntries(FINISHES.map(finish => [finish, makeSurface(finish)])), [low])
  useEffect(() => () => Object.values(bank).forEach(maps => Object.values(maps).forEach(texture => texture.dispose())), [bank])
  const value = useMemo(() => ({ city, bank }), [city, bank])
  return <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>
}

export function ArchitecturalMaterial({ finish, faceted = false }: { finish?: Finish; faceted?: boolean }) {
  const { city, bank } = useContext(SurfaceContext)
  const surface = finish ?? (city === 'AI' || city === 'Robotics' || city === 'Space' ? 'metal' : 'stone')
  const maps = bank[surface]
  const normalScale = surface === 'stone' ? .7 : surface === 'foliage' ? .55 : surface === 'wood' ? .5 : surface === 'metal' ? .32 : .22
  return <meshStandardMaterial
    {...maps} normalScale={new THREE.Vector2(normalScale, normalScale)}
    metalness={surface === 'metal' ? .72 : surface === 'ceramic' ? .12 : .025}
    roughness={maps ? 1 : surface === 'metal' ? .36 : surface === 'ceramic' ? .26 : surface === 'foliage' ? .9 : .78}
    flatShading={faceted} envMapIntensity={surface === 'metal' ? 1.15 : surface === 'ceramic' ? .85 : .5}
  />
}
