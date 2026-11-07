import { normalizeAppearance } from '@/planet/lib/buildingAppearance'
import { useUI } from '@/planet/stores/ui'
import { CITIES, isCityId } from '../cityRegistry'
import { useEnvironment, Architecture, Parts } from '../environment/ScenePrimitives'
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Project } from '@/planet/types/project'

/** Per-city palette driving every shared element below. */
export interface CityPalette {
  accent: string
  secondary: string
  ground: string
  gridCell: string
  gridSection: string
  body: string
  fillerEmissive: string
}

export function seeded(key: string, salt = 0): number {
  let h = 2166136261
  const s = `${key}:${salt}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

export interface TowerDNA {
  pos: [number, number, number]
  height: number
  width: number
  angle: number
}

export function makeTowerDNA(project: Project, index: number, total: number, ring = 0): TowerDNA {
  const layout = isCityId(project.category) ? CITIES[project.category].layout : CITIES.AI.layout
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 + seeded(project.id, 0) * 0.6
  const rad = layout.radius + ring + seeded(project.id, 1) * 15
  const height = (5 + project.stage * 3.4 + seeded(project.id, 2) * 5) * layout.heightScale
  const width = 2 + seeded(project.id, 3) * 1.8
  let x = Math.cos(angle) * rad, z = Math.sin(angle) * rad
  if (layout.kind === 'grid' || layout.kind === 'boulevard') {
    const side = index % 2 === 0 ? -1 : 1
    const rows = Math.max(4, Math.ceil(Math.sqrt(total / 2)))
    const columns = Math.max(1, Math.ceil(total / (rows * 2)))
    const laneSpacing = Math.min(9, 40 / Math.max(columns - 1, 1))
    const rowSpacing = Math.min(layout.kind === 'boulevard' ? 9 : 13, 80 / (rows - 1))
    x = side * (layout.radius + Math.floor(index / (rows * 2)) * laneSpacing)
    z = (Math.floor(index / 2) % rows - (rows - 1) / 2) * rowSpacing
  } else if (layout.kind === 'arc') {
    const a = -.9 + (index / Math.max(total - 1, 1)) * 1.8
    x = Math.sin(a) * rad; z = -Math.cos(a) * rad
  } else if (layout.kind === 'spiral') {
    // Normalize a Fermat spiral to the walkable district, independent of count.
    const spiralRadius = layout.radius + 48 * Math.sqrt(index / Math.max(total - 1, 1))
    x = Math.cos(index * 2.4) * spiralRadius
    z = Math.sin(index * 2.4) * spiralRadius
  } else if (layout.kind === 'scatter') {
    x = Math.cos(angle + seeded(project.id, 8)) * rad
    z = Math.sin(angle) * rad * 1.3
  }
  return { pos: [x, 0, z], height, width, angle }
}

export type TowerCap = 'spire' | 'cube' | 'dome' | 'none' | 'pyramid' | 'crystal'

/**
 * Palette-driven project tower. The project's live status shapes the
 * structure: abandoned towers lean and go dark, decaying neon flickers,
 * reviving towers wear scaffolding and a construction ring, alive
 * towers shine.
 */
export function CityTower({
  project,
  dna: baseDna,
  palette: basePalette,
  cap: baseCap = 'spire',
  hovered,
  selected,
  onHover,
  onSelect,
}: {
  project: Project
  dna: TowerDNA
  palette: CityPalette
  cap?: TowerCap
  hovered: boolean
  selected: boolean
  onHover: (id: string | null) => void
  onSelect: (p: Project) => void
}) {
  const preview = useUI(s=>s.customizations[project.id])
  const custom = normalizeAppearance({...project.buildingCustomization,...preview})
  const dna = {...baseDna,height:baseDna.height*Math.max(.5,Math.min(2,custom.height??1))}
  const palette = {...basePalette,accent:custom.color??basePalette.accent}
  const cap:TowerCap = !custom.style||custom.style==='standard'?baseCap:custom.style
  const group = useRef<THREE.Group>(null)
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null)
  const { reduced } = useEnvironment()
  const status = project.status
  const curved = ['Health','Education','Legend','Space','Community'].includes(project.category)
  const fractured = status === 'abandoned'

  const tilt = useMemo(
    () => (status === 'abandoned' ? 0.05 + seeded(project.id, 7) * 0.09 : status === 'decaying' ? 0.02 : 0),
    [status, project.id],
  )
  const baseGlow = selected
    ? 1.15
    : hovered
      ? 0.9
      : status === 'reviving'
        ? 0.75
        : status === 'alive'
          ? 0.55
          : status === 'decaying'
            ? 0.4
            : 0.12
  useFrame((state, delta) => {
    if (!group.current) return
    const t = hovered || selected ? 1.06 : 1
    group.current.scale.setScalar(THREE.MathUtils.damp(group.current.scale.x, t, 6, delta))
    if (bodyMat.current) {
      if (status === 'decaying' && !reduced) {
        bodyMat.current.emissiveIntensity = baseGlow * 0.38 * (0.55 + Math.abs(Math.sin(state.clock.elapsedTime * 6 + dna.angle * 5)) * 0.6)
      } else {
        bodyMat.current.emissiveIntensity = baseGlow * 0.38 * (custom.glowIntensity??1.4)/1.4
      }
    }
  })
  // Layered structure wrapped around the status shaft: plinth, floor bands,
  // pilasters, crown setback, portal entrance — batched into few draw calls.
  const h = dna.height
  const w = dna.width
  const face = Math.atan2(-dna.pos[0], -dna.pos[2])
  const { structure, lights } = useMemo(() => {
    const a = new Architecture()
    const g = new Architecture()
    a.box([0, .16, 0], [w * 1.7, .32, w * 1.7], '#3f4a4f', [0, 0, 0], false, 'stone')
    a.box([0, .45, 0], [w * 1.38, .26, w * 1.38], palette.body, [0, 0, 0], false, 'stone')
    const bands = Math.max(2, Math.min(4, Math.round(h / 3)))
    for (let i = 1; i <= bands; i++) a.box([0, h * (i / (bands + 1)) + .6, 0], [w * 1.28, .13, w * 1.28], palette.body, [0, 0, 0], false, 'metal')
    if (curved) {
      for (let k = 0; k < 3; k++) {
        const t = k * (Math.PI * 2 / 3)
        a.add('pillar', [Math.sin(t) * w * .74, h * .5 + .6, Math.cos(t) * w * .74], [w * .09, h * .94, w * .09], palette.body, [0, 0, 0], false, 'metal')
      }
    } else {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) a.box([sx * w * .56, h * .5 + .6, sz * w * .56], [w * .15, h * .92, w * .15], palette.body, [0, 0, 0], false, 'metal')
    }
    a.box([0, h * 1.0 + .55, 0], [w * .7, .18, w * .7], palette.body, [0, curved ? 0 : .4, 0], false, 'stone')
    a.box([0, h * 1.0 + .82, 0], [w * .42, .36, w * .42], '#4a555a', [0, .4, 0], false, 'metal')
    // ceremonial portal facing the district heart
    a.box([0, .95, w * .72], [w * .7, 1.0, .16], '#1d2529', [0, 0, 0], false, 'metal')
    a.box([0, 1.56, w * .92], [w * 1.05, .12, .5], palette.body, [-.1, 0, 0], false, 'stone')
    for (const sx of [-1, 1]) a.box([sx * w * .48, .95, w * .82], [.1, 1.05, .1], '#57646a', [0, 0, 0], false, 'metal')
    if (!fractured) {
      g.box([0, .92, w * .8], [w * .42, .78, .04], palette.accent)
      if (curved) {
        g.ring([0, h * .45 + .6, 0], w * .82, palette.accent, [Math.PI / 2, 0, 0], true)
        g.ring([0, h * .8 + .6, 0], w * .68, palette.secondary, [Math.PI / 2, 0, 0], true)
      } else {
        for (let r = 0; r < 3; r++) {
          const y = h * (.28 + r * .26) + .6
          g.box([w * .3, y, w * .62], [w * .17, h * .075, .04], r === 1 ? '#ffd9a0' : palette.accent)
          g.box([-w * .3, y, w * .62], [w * .17, h * .075, .04], palette.accent)
        }
        for (let r = 0; r < 2; r++) g.box([w * .62, h * (.38 + r * .32) + .6, 0], [.04, h * .075, w * .42], palette.secondary)
      }
      g.box([0, h * .97 + .6, 0], [w * 1.05, .05, w * 1.05], '#ffe9c0')
    } else {
      g.box([0, .9, w * .78], [w * .3, .5, .04], '#4d4436')
    }
    return { structure: a, lights: g }
  }, [h, w, curved, fractured, palette.body, palette.accent, palette.secondary])
  return (
    <group
      ref={group}
      userData={{projectId: project.id}}
      position={dna.pos}
      rotation={[0, face, tilt]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onSelect(project)
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        onHover(project.id)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        onHover(null)
        document.body.style.cursor = 'auto'
      }}
    >
      <Parts solid data={structure} name="tower-structure" />
      <Parts data={lights} name="tower-lights" />
      <mesh position={[0, h / 2 + .6, 0]}>
        {curved ? <cylinderGeometry args={[w*.4,w*.6,h,12,1,fractured]} /> : <boxGeometry args={[w, h, w]} />}
        <meshStandardMaterial
          ref={bodyMat}
          color={palette.body}
          emissive={palette.accent}
          emissiveIntensity={baseGlow * 0.38}
          transparent
          opacity={fractured ? .3 : .92}
          metalness={0.55}
          roughness={0.4}
        />
      </mesh>
      {(hovered || selected) && (
        <mesh position={[0, h / 2 + .6, 0]}>
          <boxGeometry args={[w * 1.12, h * 1.02, w * 1.12]} />
          <meshBasicMaterial color={palette.accent} wireframe transparent opacity={selected ? 0.3 : 0.18} />
        </mesh>
      )}
      {fractured && [0,1,2].map(level=><mesh key={level} position={[level===1?w*.2:0,h*(.2+level*.32)+.6,0]} rotation={[0,0,level===1?.12:0]}><boxGeometry args={[w*1.08,.3,w*1.08]}/><meshStandardMaterial color={palette.body} /></mesh>)}
      {status !== 'abandoned' && cap !== 'none' && (
        <>
          {cap === 'spire' && (
            <>
              <mesh position={[0, dna.height + 1.3, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 2.4, 6]} />
                <meshBasicMaterial color={palette.accent} toneMapped={false} />
              </mesh>
              <mesh position={[0, dna.height + 2.7, 0]}>
                <sphereGeometry args={[0.2, 10, 10]} />
                <meshBasicMaterial color={palette.secondary} toneMapped={false} />
              </mesh>
            </>
          )}
          {(cap === 'pyramid'||cap === 'crystal') && <mesh position={[0,dna.height+dna.width*.7,0]}>{cap==='pyramid'?<coneGeometry args={[dna.width*.8,dna.width*1.4,4]}/>:<octahedronGeometry args={[dna.width*.8]}/>}<meshStandardMaterial color={palette.secondary} emissive={palette.accent} emissiveIntensity={.2}/></mesh>}
          {cap === 'cube' && (
            <mesh position={[0, dna.height + 0.9, 0]}>
              <boxGeometry args={[0.55, 0.55, 0.55]} />
              <meshBasicMaterial color={palette.secondary} toneMapped={false} />
            </mesh>
          )}
          {cap === 'dome' && (
            <mesh position={[0, dna.height, 0]}>
              <sphereGeometry args={[Math.max(0.5, dna.width * 0.35), 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshBasicMaterial color={palette.secondary} toneMapped={false} />
            </mesh>
          )}
        </>
      )}
      {status === 'reviving' && (
        <>
          <mesh position={[0, dna.height * 0.55, 0]} rotation={[Math.PI / 2.6, 0, 0]}>
            <torusGeometry args={[dna.width * 1.35, 0.06, 6, 32]} />
            <meshBasicMaterial color="#FFB547" toneMapped={false} />
          </mesh>
          {[
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ].map(([sx, sz], i) => (
            <mesh key={i} position={[(sx * dna.width) / 1.5, (dna.height * 1.1) / 2, (sz * dna.width) / 1.5]}>
              <cylinderGeometry args={[0.04, 0.04, dna.height * 1.1, 5]} />
              <meshStandardMaterial color="#8a6a3a" roughness={0.7} metalness={0.3} />
            </mesh>
          ))}
        </>
      )}
      {selected && (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[dna.width * 0.9, dna.width * 1.2, 32]} />
          <meshBasicMaterial color={palette.accent} transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  )
}

/** Pulsing links between the project towers and the city's heart. */
export function CityLinks({ points, accent, targetY }: { points: THREE.Vector3[]; accent: string; targetY: number }) {
  const mat = useRef<THREE.LineBasicMaterial>(null)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const arr = new Float32Array(points.length * 6)
    points.forEach((p, i) => {
      arr[i * 6] = p.x
      arr[i * 6 + 1] = p.y
      arr[i * 6 + 2] = p.z
      arr[i * 6 + 3] = 0
      arr[i * 6 + 4] = targetY
      arr[i * 6 + 5] = 0
    })
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    return g
  }, [points, targetY])
  useEffect(() => () => geo.dispose(), [geo])
  useFrame((state) => {
    if (mat.current) mat.current.opacity = 0.16 + Math.abs(Math.sin(state.clock.elapsedTime * 1.6)) * 0.2
  })
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial ref={mat} color={accent} transparent opacity={0.22} />
    </lineSegments>
  )
}

/** Instanced ambient skyline — cheap density that is not clickable. */
export function FillerSkyline({
  palette,
  count,
  seed,
  heightScale = 1,
}: {
  palette: CityPalette
  count: number
  seed: string
  heightScale?: number
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const windows = useRef<THREE.InstancedMesh>(null)
  const roofs = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const d = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      const a = seeded(`${seed}${i}`, 1) * Math.PI * 2
      const rad = 30 + seeded(`${seed}${i}`, 2) * 42
      const h = (3 + seeded(`${seed}${i}`, 3) * 10) * heightScale
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad
      // Reserve the approach avenue for streets, shelters and sidewalks.
      d.position.set(Math.abs(x) < 12 && z > 14 ? (x < 0 ? -14 : 14) : x, h / 2, z)
      d.scale.set(1.6 + seeded(`${seed}${i}`, 4) * 1.6, h, 1.6 + seeded(`${seed}${i}`, 4) * 1.6)
      d.rotation.set(0, seeded(`${seed}${i}`, 5) * Math.PI, 0)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
      const width = d.scale.x
      for (let level = 0; level < 4; level++) {
        d.scale.set(width * 1.025, .13, width * 1.025)
        d.position.y = h * (.2 + level * .2); d.updateMatrix()
        windows.current?.setMatrixAt(i * 4 + level, d.matrix)
      }
      d.position.y = h + .5; d.scale.set(width * .6, 1, width * .6); d.updateMatrix()
      roofs.current?.setMatrixAt(i, d.matrix)
    }
    m.instanceMatrix.needsUpdate = true
    if (windows.current) windows.current.instanceMatrix.needsUpdate = true
    if (roofs.current) roofs.current.instanceMatrix.needsUpdate = true
  }, [count, seed, heightScale])
  return (
    <group name="district-skyline"><instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={palette.body} emissive={palette.fillerEmissive} emissiveIntensity={0.35} metalness={0.4} roughness={0.5} />
    </instancedMesh>
    <instancedMesh ref={windows} args={[undefined,undefined,count*4]} frustumCulled={false}><boxGeometry /><meshBasicMaterial color={palette.accent} transparent opacity={seed.includes('grave') ? .12 : .45} /></instancedMesh>
    <instancedMesh ref={roofs} args={[undefined,undefined,count]} frustumCulled={false}><boxGeometry /><meshStandardMaterial color={palette.body} metalness={.6} roughness={.3} /></instancedMesh>
    </group>
  )
}
