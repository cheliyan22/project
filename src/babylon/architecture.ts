import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';

type V = [number, number, number]
type Quality = 'high' | 'low'
const TAU = Math.PI * 2
const seed = (n: number) => { const h = Math.imul(n + 17, 374761393); return ((Math.imul(h ^ (h >>> 13), 1274126177) ^ h) >>> 0) / 4294967296 }
const palettes: Record<string, string[]> = {
  ai: ['#c3d5de', '#263f56', '#54768c', '#67e4f5', '#98bac6', '#294758'],
  gaming: ['#f4d3aa', '#514271', '#9b6a99', '#ffb951', '#c5b1da', '#647b90'],
  education: ['#ede2c4', '#68705a', '#aa8660', '#dcbf7d', '#c1ba9d', '#66896e'],
  health: ['#e5f3df', '#4d7b6c', '#9bb7a1', '#83d7bc', '#c4dac1', '#528267'],
  creative: ['#f4ccb7', '#554b69', '#b76678', '#e9b556', '#b1c3cd', '#637587'],
  revival: ['#d2c6a4', '#46625f', '#b18458', '#d8b867', '#abc9bb', '#648579'],
  graveyard: ['#a4a5a0', '#49535f', '#7d7271', '#c5a384', '#8c9ca2', '#67716b'],
  success: ['#f2e6c9', '#6e7d88', '#c1a76d', '#eacb86', '#d5dce0', '#75958a'],
  space: ['#dae2e8', '#35465d', '#8393ad', '#94c7ef', '#b4c5da', '#536c88'],
  robotics: ['#bfc4b9', '#354c51', '#a78557', '#ffc372', '#809b9d', '#567879'],
  community: ['#e9c6a1', '#8a6458', '#b8835e', '#f7d399', '#d4b294', '#668b70'],
}

/** Independent architectural grammars share only geometry utilities and material
 * batching. No generated structures represent people, projects, or engagement. */
export function buildArchitecture(scene: Scene, city: string, quality: Quality): { meshes: AbstractMesh[]; animate?: (time: number) => void } {
  const colors = palettes[city] ?? palettes.ai
  const materials = colors.map((hex, i) => {
    const m = new PBRMaterial(`architecture-${city}-${i}`, scene)
    m.albedoColor = Color3.FromHexString(hex)
    m.metallic = i === 2 ? 0.68 : i === 1 ? 0.3 : 0.08
    m.roughness = i === 2 ? 0.35 : i === 5 ? 0.95 : 0.63
    if (i === 3) { m.emissiveColor = Color3.FromHexString(hex).scale(0.25); m.roughness = 0.35 }
    m.backFaceCulling = false
    return m
  })
  // Opaque inset glazing avoids transparency sorting while retaining a dark,
  // reflective facade contrast against masonry and exposed structural metal.
  const glazing = new PBRMaterial(`architecture-${city}-glazing`, scene)
  glazing.albedoColor = Color3.FromHexString(city === 'community' ? '#314443' : '#102a36')
  glazing.metallic = 0.48; glazing.roughness = 0.22
  glazing.emissiveColor = Color3.FromHexString('#163039').scale(0.08)
  materials.push(glazing)
  const groups: Mesh[][] = materials.map(() => [])
  const animated: Mesh[] = []
  let serial = 0
  const name = (s: string) => `${city}-${s}-${serial++}`
  const put = (m: Mesh, p: V, material: number, r?: V) => {
    m.position.set(...p); if (r) m.rotation.set(...r)
    m.material = materials[material]; m.receiveShadows = true; groups[material].push(m); return m
  }
  const box = (p: V, s: V, material = 0, r?: V) => put(MeshBuilder.CreateBox(name('course'), { width: s[0], height: s[1], depth: s[2] }, scene), p, material, r)
  const beam = (a: V, b: V, width = 0.7, material = 2) => {
    const start = new Vector3(...a), end = new Vector3(...b), delta = end.subtract(start)
    const m = box(start.add(end).scale(0.5).asArray() as V, [width, delta.length(), width], material)
    m.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), delta.normalize(), new Quaternion())
    return m
  }
  const tube = (points: V[], radius: number, material = 2, closed = false) => {
    const path = points.map(p => new Vector3(...p)); if (closed) path.push(path[0])
    return put(MeshBuilder.CreateTube(name('rib'), { path, radius, tessellation: quality === 'low' ? 5 : 8, cap: Mesh.CAP_ALL }, scene), [0, 0, 0], material)
  }
  const orb = (p: V, s: V, material = 5) => { const m = put(MeshBuilder.CreateIcoSphere(name('crown'), { radius: 1, subdivisions: quality === 'low' ? 1 : 2 }, scene), p, material); m.scaling.set(...s); return m }
  const ring = (p: V, radius: number, thickness: number, material = 2, r: V = [0, 0, 0]) => {
    // Separate radial and cross-section resolution avoids quadratic torus cost.
    const segments = radius > 20 ? (quality === 'low' ? 40 : 64) : (quality === 'low' ? 16 : 24)
    const points = Array.from({ length: segments + 1 }, (_, i) => new Vector3(Math.cos(i * TAU / segments) * radius, 0, Math.sin(i * TAU / segments) * radius))
    return put(MeshBuilder.CreateTube(name('ring'), { path: points, radius: thickness / 2, tessellation: quality === 'low' ? 5 : 6 }, scene), p, material, r)
  }

  const path = (a: V, b: V, width = 3, material = 4) => { const m = beam(a, b, 1, material); m.scaling.x = width; m.scaling.z = 0.5; return m }
  const arch = (x: number, y: number, z: number, radius: number, height: number, material = 0, depth = 0) => {
    const pts: V[] = Array.from({ length: 19 }, (_, i) => { const t = i * Math.PI / 18; return [x + Math.cos(t) * radius, y + Math.sin(t) * height, z + Math.sin(t) * depth] })
    tube(pts, 0.7, material)
  }
  const shell = (p: V, scale: V, twist: number, material = 0, yaw = 0, kind: 'leaf' | 'ribbon' | 'sail' = 'leaf') => {
    const positions: number[] = [], indices: number[] = [], normals: number[] = [], uvs: number[] = []
    const rows = quality === 'low' ? 18 : 32, cols = 8
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
      const u = i / rows, v = j / cols * 2 - 1, a = u * twist
      let x: number, y: number, z: number
      if (kind === 'ribbon') { x = Math.sin(a) * 0.7 + Math.cos(a) * v * 0.45; y = u; z = Math.cos(a) * 0.7 + Math.sin(a) * v * 0.45 }
      else if (kind === 'sail') { x = v * (1 - u * 0.8); y = u; z = Math.sin(u * Math.PI) * (1 - v * v) * 0.8 }
      else { x = Math.sin(u * Math.PI) * v; y = u; z = Math.sin(u * Math.PI) * 0.65 + v * v * 0.17 }
      positions.push(x * scale[0], y * scale[1], z * scale[2]); uvs.push(j / cols, u)
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const a = i * (cols + 1) + j, b = a + cols + 1; indices.push(a, b, b + 1, a, b + 1, a + 1) }
    VertexData.ComputeNormals(positions, indices, normals)
    const data = new VertexData(); data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs
    const mesh = new Mesh(name('shell'), scene); data.applyToMesh(mesh)
    return put(mesh, p, material, [0, yaw, 0])
  }
  const tree = (x: number, z: number, h = 7) => {
    beam([x, 0, z], [x, h, z], 0.45, 2)
    for (let i = 0; i < 3; i++) { const t = i * 2.4; const dx = Math.cos(t) * 2.3, dz = Math.sin(t) * 2.3; beam([x, h * 0.5, z], [x + dx, h, z + dz], 0.2, 2); orb([x + dx, h + 1, z + dz], [3, 2.3, 3], 5) }
  }
  const vault = (x: number, z: number, width: number, length: number, spring: number, height: number) => {
    const arcs = [-length / 2, length / 2].map(dz => Array.from({ length: 21 }, (_, j) => {
      const a = j * Math.PI / 20
      return new Vector3(x + Math.cos(a) * width / 2, spring + Math.sin(a) * height, z + dz)
    }))
    put(MeshBuilder.CreateRibbon(name('vaulted-roof'), { pathArray: arcs }, scene), [0, 0, 0], 0)
    for (let dz = -length / 2; dz <= length / 2; dz += 4) arch(x, spring + 0.1, z + dz, width / 2 + 0.15, height + 0.2, 2)
    for (const side of [-1, 1]) {
      box([x + side * width / 2, spring / 2, z], [0.65, spring, length], 0)
      for (let dz = -length / 2 + 2; dz < length / 2; dz += 4) box([x + side * (width / 2 + 0.35), spring * 0.55, z + dz], [0.1, spring * 0.55, 2.4], 6)
    }
  }
  const habitat = (x: number, z: number, width: number, length: number, n: number) => {
    const radius = width * 0.23, y = radius + 4
    put(MeshBuilder.CreateCylinder(name('pressure-habitat'), { diameter: radius * 2, height: length, tessellation: quality === 'low' ? 12 : 20 }, scene), [x, y, z], 0, [Math.PI / 2, 0, 0])
    for (let d = -length / 2 + 1; d < length / 2; d += 4) ring([x, y, z + d], radius + 0.15, 0.3, 2, [Math.PI / 2, 0, 0])
    for (const side of [-1, 1]) {
      beam([x + side * 3, 0, z - length / 3], [x + side * radius, y, z - length / 3], 0.6)
      beam([x + side * 3, 0, z + length / 3], [x + side * radius, y, z + length / 3], 0.6)
      box([x + side * (radius + 4), y + 1, z], [6, 0.25, length * 1.1], 6, [0, 0, side * 0.2])
      for (let d = -length / 2; d < length / 2; d += 2) box([x + side * (radius + 4), y + 1.15, z + d], [6, 0.08, 0.12], 2)
    }
    if (n % 3 === 0) { ring([x, y + 8, z], 7, 1.1, 0, [Math.PI / 2, 0, 0]); beam([x, y, z], [x, y + 15, z], 0.4) }
  }
  const district = (x: number, z: number, height: number, width: number, depth: number, n: number) => {
    if (city === 'gaming') {
      const level = 6 + n % 3 * 5
      for (let island = 0; island < (n % 2 ? 2 : 1); island++) {
        const px = x + island * 5, py = level + island * 7
        put(MeshBuilder.CreateCylinder(name('floating-play-wedge'), { diameterTop: width, diameterBottom: 1, height: 6, tessellation: 4 }, scene), [px, py, z], n % 2 ? 2 : 0, [0, Math.PI / 4 + n * 0.2, 0])
        box([px, py + 3.1, z], [width * 0.67, 0.25, width * 0.67], 1, [0, n * 0.2, 0])
        for (let step = 0; step < 4; step++) box([px - 5 + step * 3, py + 4 + step * 1.3, z], [2.5, 0.6, 3], 3)
        if (n % 3 === 0) arch(px, py + 3, z - 3, width * 0.38, 8, 2)
      }
      beam([x, 0, z], [x, level - 2, z], 0.3)
    } else if (city === 'education') {
      // Low longitudinal archives and perpendicular reading wings; a hall roof
      // is a continuous barrel surface rather than an accessory on a tower.
      const length = depth * 1.6
      vault(x, z, width * 0.8, length, 4, 6 + n % 3)
      if (n % 2 === 0) {
        box([x - width * 0.6, 1, z], [5, 2, length + 3], 4)
        for (let i = 0; i < 5; i++) box([x - width * 0.6, 3.2, z - length / 2 + 3 + i * 4], [3.7, 2.4, 1], 2)
      }
      for (let step = 0; step < 4; step++) box([x, step * 0.2, z + length / 2 + 1 + step], [width + 2 - step, 0.35, 1], 4)
    } else if (city === 'health') {
      // Bifurcating clinical wings follow structural stems beneath living leaves.
      const h = Math.min(height, 17)
      for (let arm = 0; arm < 3; arm++) {
        const a = n * 0.7 + arm * TAU / 3, dx = Math.cos(a), dz = Math.sin(a)
        tube([[x, 1, z], [x + dx * 3, h * 0.45, z + dz * 3], [x + dx * 8, h * 0.62, z + dz * 8]], 1.2, 0)
        const roof = shell([x + dx * 3, h * 0.58, z + dz * 3], [4.8, 11, 7], 0, arm % 2 ? 5 : 4, -a)
        roof.rotation.x = -1.1
        beam([x + dx * 8, 0, z + dz * 8], [x + dx * 8, h * 0.6, z + dz * 8], 0.4, 2)
      }
      tree(x, z, 4)
    } else if (city === 'creative') {
      const count = 2 + n % 2
      for (let fold = 0; fold < count; fold++) {
        const a = n * 0.57 + fold * 1.7
        const m = shell([x + Math.cos(a) * 3, 0, z + Math.sin(a) * 3], [width * 0.75, 10 + height * 0.45 + fold * 3, depth], n % 3 ? 0 : Math.PI, fold % 2 ? 2 : 0, a, n % 3 ? 'sail' : 'ribbon')
        m.rotation.z = (n % 3 - 1) * 0.25
        beam([x - 5, 0, z], [x + 4, 12, z], 0.35)
      }
      box([x, 1.2, z], [width * 0.8, 0.6, depth * 0.8], 1, [0, n * 0.3, 0.08])
    } else if (city === 'revival') {
      lattice(x, z, height + 7, width * 0.5)
      // Partial floor plates and only one unfinished wall leave construction open.
      for (let floor = 0; floor < 3; floor++) box([x - width * 0.2, 2 + floor * 5, z], [width * (0.65 - floor * 0.12), 0.7, depth * 0.8], 0)
      box([x - width / 2, 5, z], [0.8, 10, depth * 0.6], 1)
      beam([x - width * 0.7, height + 7, z], [x + width * 0.7, height + 7, z], 0.7)
      beam([x + width * 0.5, height + 7, z], [x + width * 0.5, 3, z], 0.1)
    } else if (city === 'success') {
      const h = height + 8
      for (const side of [-1, 1]) {
        const px = x + side * width * 0.23
        box([px, h / 2, z], [1.2, h, depth * 0.8], 0, [0, 0, -side * 0.07])
        box([px - side * 0.8, h * 0.46, z], [0.5, h * 0.85, depth * 0.64], 6, [0, 0, -side * 0.07])
        box([px + side * 0.9, h * 0.5, z], [0.22, h + 2, depth * 0.85], 2, [0, 0, -side * 0.07])
      }
      for (let level = 0; level < 3; level++) beam([x - width * 0.22, h * (0.4 + level * 0.18), z], [x + width * 0.22, h * (0.4 + level * 0.18), z], 0.6, 2)
    } else if (city === 'space') {
      habitat(x, z, width, depth * 1.25, n)
    } else if (city === 'community') {
      // Four low wings enclose a real courtyard, with a gate and roof gardens.
      const wing = width * 0.33, h = 4 + n % 2 * 2
      for (const side of [-1, 1]) {
        box([x + side * width * 0.4, h / 2, z], [wing, h, depth], n % 3 ? 0 : 4)
        box([x, h / 2, z - side * depth * 0.4], [width * 0.55, h, depth * 0.25], 0)
        box([x + side * width * 0.4, h + 0.3, z], [wing + 0.6, 0.4, depth + 0.6], 2, [0, 0, side * 0.12])
        for (let j = 0; j < 3; j++) box([x + side * (width * 0.4 + wing / 2 + 0.04), h * 0.55, z - depth * 0.3 + j * depth * 0.3], [0.12, 1.6, 1.5], 6)
      }
      box([x, 2, z + depth * 0.53], [2.5, 4, 0.15], 1)
      tree(x, z, 3.5)
      if (n % 2 === 0) path([x + width / 2, 3.5, z], [x + width / 2 + 6, 3.5, z + 4], 1.8)
    }
  }
  const terrace = (x: number, z: number, levels: number, width: number, depth: number, material = 0) => {
    const authoredLandmark = (city === 'education' && x === 0 && z === -8) || (city === 'success' && x === 56 && z === -25)
    if (city !== 'ai' && city !== 'robotics' && city !== 'graveyard' && !authoredLandmark) {
      district(x, z, levels * 4.2, width, depth, Math.abs(Math.round(x * 3 + z)))
      return
    }
    for (let i = 0; i < levels; i++) {
      const w = Math.max(3, width - i * 1.2), d = Math.max(3, depth - i * 0.7), y = i * 4.2, cz = z + i * 0.35
      box([x, y + 1.8, cz], [w, 3.6, d], material)
      box([x, y + 3.8, cz], [w + 0.65, 0.32, d + 0.65], 2)
      // Recessed curtain walls and projecting vertical mullions on every face.
      for (const side of [-1, 1]) {
        box([x, y + 2, cz + side * (d / 2 + 0.04)], [w - 0.8, 2.6, 0.1], 6)
        box([x + side * (w / 2 + 0.04), y + 2, cz], [0.1, 2.6, d - 0.8], 6)
        for (let j = 0; j <= Math.floor(w / 3); j++) {
          const px = x - w / 2 + 0.4 + j * (w - 0.8) / Math.floor(w / 3)
          box([px, y + 2, cz + side * (d / 2 + 0.17)], [0.16, 2.9, 0.25], 2)
        }
        for (let j = 0; j <= Math.floor(d / 3); j++) {
          const pz = cz - d / 2 + 0.4 + j * (d - 0.8) / Math.floor(d / 3)
          box([x + side * (w / 2 + 0.17), y + 2, pz], [0.25, 2.9, 0.16], 2)
        }
      }
    }
    // Roof plant rooms, ventilation fins and a service parapet provide scale.
    const top = levels * 4.2, roofWidth = Math.max(3, width - (levels - 1) * 1.2)
    box([x, top + 0.6, z], [roofWidth * 0.42, 1.2, 2.6], 1)
    for (let j = 0; j < 4; j++) box([x - roofWidth * 0.16 + j * roofWidth * 0.11, top + 1.3, z], [0.18, 0.25, 2.7], 2)
  }
  const lattice = (x: number, z: number, height: number, w: number, material = 2) => {
    for (const dx of [-w, w]) for (const dz of [-w * 0.6, w * 0.6]) beam([x + dx, 0, z + dz], [x + dx, height, z + dz], 0.8, material)
    for (let y = 0; y < height - 6; y += 7) for (const dz of [-w * 0.6, w * 0.6]) {
      beam([x - w, y, z + dz], [x + w, y + 7, z + dz], 0.27, material)
      beam([x + w, y, z + dz], [x - w, y + 7, z + dz], 0.27, material)
      box([x, y, z], [w * 2 + 1, 0.45, w * 1.2 + 1], 4)
    }
  }

  if (city === 'ai') {
    // Cathedral of computation: twisting structural diagrid around a suspended core.
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8
      const pts: V[] = Array.from({ length: 17 }, (_, j) => { const t = j / 16, r = 19 - Math.sin(t * Math.PI) * 7; return [Math.cos(a + t * 0.5) * r, t * 82, Math.sin(a + t * 0.5) * r] })
      tube(pts, 0.9, 0)
      for (let j = 1; j < 9; j++) { const t = j / 9; beam([Math.cos(a + t * 0.5) * 15, t * 80, Math.sin(a + t * 0.5) * 15], [Math.cos(a + TAU / 8 + t * 0.5) * 15, t * 80 + 6, Math.sin(a + TAU / 8 + t * 0.5) * 15], 0.35, 2) }
    }
    // Suspended processor decks form a readable inhabitable core within the
    // diagrid rather than leaving the cathedral as an empty wire cage.
    for (let floor = 0; floor < 12; floor++) {
      const y = 8 + floor * 5.7, angle = floor * 0.045
      box([0, y, 0], [19, 0.8, 19], 2, [0, angle, 0])
      box([0, y + 2.5, 0], [16, 4, 16], 6, [0, angle, 0])
      for (const side of [-1, 1]) for (let bay = 0; bay < 5; bay++) {
        box([(bay - 2) * 3, y + 2.5, side * 8.2], [0.22, 4.5, 0.4], 0)
        box([side * 8.2, y + 2.5, (bay - 2) * 3], [0.4, 4.5, 0.22], 0)
      }
      if (floor % 3 === 0) box([0, y + 0.7, 8.4], [14, 0.15, 0.2], 3)
    }
    orb([0, 78, 0], [5, 8, 5], 3)
    for (let i = 0; i < 4; i++) ring([0, 18 + i * 17, 0], 15, 1, 2)
    for (const side of [-1, 1]) {
      const x = side * 50, z = -24
      lattice(x, z, side < 0 ? 45 : 62, 9)
      for (let i = 0; i < 5; i++) box([x + Math.sin(i * 1.4) * 4, 12 + i * 8, z], [22, 3, 13], i % 2 ? 1 : 0, [0, i * 0.24, 0])
      path([x, 26, z], [0, 26, 0], 4)
    }
    for (let i = 0; i < 12; i++) { const x = (i % 6 - 2.5) * 22, z = i < 6 ? -65 : 58; terrace(x, z, 2 + i % 3, 14, 12, 1); box([x, 17, z], [0.25, 9, 0.25], 3) }
  } else if (city === 'gaming') {
    // Arena canyon, switchback play citadel and suspended polygonal theatres.
    for (let i = 0; i < 28; i++) {
      const t = i * TAU / 28
      for (let tier = 0; tier < 4; tier++) box([Math.cos(t) * (21 + tier * 3), 3 + tier * 4, Math.sin(t) * (21 + tier * 3)], [7.5, 3, 5], tier % 2 ? 2 : 0, [0, -t, 0])
      if (i % 2 === 0) beam([Math.cos(t) * 32, 0, Math.sin(t) * 32], [Math.cos(t) * 26, 28, Math.sin(t) * 26], 0.8)
    }
    ring([0, 28, 0], 28, 2, 3)
    for (let i = 0; i < 12; i++) { const a = i * 0.5; box([-56 + Math.sin(a) * 9, 4 + i * 5, -30 + Math.cos(a) * 9], [15 - i * 0.5, 2, 11], i % 2 ? 1 : 2, [0, a, 0]); beam([-56, 0, -30], [-56, 64, -30], 1.3) }
    for (let i = 0; i < 5; i++) shell([52, 0, -25], [16, 38 + i * 4, 14], 0, i % 2 ? 0 : 2, i * TAU / 5, 'sail')
    for (let i = 0; i < 9; i++) { const x = (i % 3 - 1) * 32, z = 51 + Math.floor(i / 3) * 17; terrace(x, z, 2 + i % 2, 18, 11, i % 2 ? 0 : 1) }
  } else if (city === 'education') {
    // Great stepped archive, a vaulted reading forum, and tall open book spines.
    terrace(0, -8, 12, 48, 35)
    for (let i = 0; i < 7; i++) shell([(i - 3) * 5, 50, -9], [5, 19 + Math.sin(i) * 4, 12], 0, 2, 0, 'sail')
    for (let i = 0; i < 9; i++) arch(-57, 8, -45 + i * 5, 15, 18, 0)
    for (const x of [-72, -42]) box([x, 4, -25], [2, 8, 45], 0)
    for (let i = 0; i < 5; i++) { box([48 + i * 3, 22 + i * 3, -28], [2, 44 + i * 6, 18], 0, [0, 0, -0.1]); box([48 + i * 3, 42 + i * 6, -28], [2.5, 1, 19], 2) }
    for (let i = 0; i < 10; i++) { const x = (i % 5 - 2) * 25, z = 42 + Math.floor(i / 5) * 24; terrace(x, z, 2 + i % 3, 18, 14); tree(x + 10, z + 8, 5) }
  } else if (city === 'health') {
    // Regeneration arbor: curved petal buttresses and branching suspended gardens.
    for (let i = 0; i < 9; i++) {
      const a = i * TAU / 9, x = Math.cos(a) * 8, z = Math.sin(a) * 8
      shell([x, 0, z], [12, 74 + Math.sin(i * 1.7) * 8, 22], 0, 0, -a)
      tube([[x, 0, z], [x * 1.4, 18, z * 1.4], [x * 2.4, 35, z * 2.4], [x * 3.5, 43, z * 3.5]], 1.1, 2)
      shell([x * 3, 38, z * 3], [8, 13, 9], 0, 5, -a)
    }
    for (let i = 0; i < 7; i++) shell([-56 + Math.cos(i) * 6, 0, -30 + Math.sin(i) * 6], [9, 33, 18], 0, i % 2 ? 0 : 4, i * TAU / 7)
    for (let i = 0; i < 5; i++) { terrace(47 + i * 3, -42 + i * 10, 3, 18, 12); tree(55, -38 + i * 10, 10) }
    for (let i = 0; i < 12; i++) { const t = i * TAU / 12, x = Math.cos(t) * 69, z = Math.sin(t) * 69; terrace(x, z, 2, 14, 10, 4); tree(x + 7, z, 6); if (i % 2 === 0) path([x, 6, z], [Math.cos(t + 0.5) * 69, 6, Math.sin(t + 0.5) * 69], 2) }
  } else if (city === 'creative') {
    // Interwoven inhabited ribbons, folded exhibition hall and fragmented ateliers.
    for (let i = 0; i < 4; i++) shell([Math.cos(i * 1.6) * 5, 0, Math.sin(i * 1.6) * 5], [23, 78 - i * 3, 23], TAU * 0.8, i % 2 ? 2 : 0, i * Math.PI / 2, 'ribbon')
    for (let i = 0; i < 6; i++) shell([-57 + i * 4, 0, -20], [8, 34 + i * 3, 20], 0, i % 2 ? 0 : 4, i * 0.3, 'sail')
    for (let i = 0; i < 8; i++) box([49 + Math.sin(i) * 9, i * 5 + 3, -28], [21, 4, 15], i % 2 ? 1 : 0, [0, i * 0.32, 0.08])
    for (let i = 0; i < 16; i++) { const x = (i % 8 - 3.5) * 20, z = i < 8 ? 56 : -65; terrace(x, z, 1 + i % 3, 14, 11, i % 2 ? 0 : 4); box([x, 4, z + 8], [10, 0.4, 6], 2, [0, 0, -0.2]) }
  } else if (city === 'revival') {
    // Working skeletal restoration halls, drydocks and suspended repair gantries.
    lattice(0, -5, 82, 17)
    for (let i = 0; i < 7; i++) box([0, i * 7 + 3, -5], [30 - i * 2, 5, 18], i % 2 ? 0 : 1)
    for (const x of [-23, 23]) beam([x, 0, -5], [x, 88, -5], 1.5)
    beam([-29, 88, -5], [39, 88, -5], 2); beam([31, 88, -5], [31, 24, -5], 0.18); box([31, 23, -5], [10, 1, 10], 2)
    lattice(-55, -28, 37, 12); lattice(56, -22, 51, 9)
    for (let i = 0; i < 8; i++) { const x = (i % 4 - 1.5) * 35, z = 42 + Math.floor(i / 4) * 27; terrace(x, z, 2, 23, 18, 1); lattice(x, z, 20, 12) }
  } else if (city === 'graveyard') {
    // A broken nave and collapsed viaduct, readable as lost civic infrastructure.
    for (let i = 0; i < 7; i++) {
      const z = -28 + i * 10
      for (const side of [-1, 1]) beam([side * 17, 0, z], [side * (16 + (i > 4 ? 4 : 0)), 34 + seed(i) * 9, z], 2, 0)
      if (i !== 4 && i !== 1) arch(0, 34, z, 17, 26, 0)
      else box([i * 3, 2, z], [23, 3, 6], 1, [0.1, i, 0.15])
    }
    for (let i = 0; i < 9; i++) { const x = -90 + i * 9; box([x, 10, -46], [3, 20, 7], 0, [0, 0, i > 5 ? 0.14 : 0]); if (i !== 5) arch(x + 4.5, 16, -46, 4.5, 8) }
    for (let i = 0; i < 10; i++) { const t = i * TAU / 13; beam([52 + Math.cos(t) * 17, 0, -22 + Math.sin(t) * 17], [52 + Math.cos(t) * 9, 34 + seed(i) * 11, -22 + Math.sin(t) * 9], 1.5, 0) }
    for (let i = 0; i < 28; i++) { const x = (seed(i * 3) - 0.5) * 160, z = 37 + seed(i * 7) * 42; box([x, 2 + seed(i) * 6, z], [5 + seed(i + 3) * 8, 5 + seed(i) * 12, 6], i % 2 ? 0 : 1, [0.1, seed(i) * 3, (seed(i * 4) - 0.5) * 0.4]) }
  } else if (city === 'success') {
    // Paired ivory fins carry a triumph skybridge; orderly civic ensembles below.
    for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
      const h = 91 - i * 5, x = side * (8 + i * 2.5)
      box([x, h / 2, 0], [1.6, h, 18 + i * 2], i % 3 ? 0 : 2)
      box([x, h + 0.5, 0], [2, 1, 19 + i * 2], 2)
    }
    for (let y = 39; y <= 75; y += 12) box([0, y, 0], [21, 2.5, 17], 4)
    for (let i = 0; i < 6; i++) arch(-58, 12, -40 + i * 6, 15, 20, 0)
    terrace(56, -25, 8, 32, 24)
    for (let i = 0; i < 10; i++) { const side = i % 2 ? 1 : -1; const z = 31 + Math.floor(i / 2) * 13; terrace(side * 44, z, 2 + i % 3, 19, 10); tree(side * 25, z, 6) }
    for (let i = 0; i < 9; i++) box([0, 0.2 + i * 0.15, 25 + i * 6], [28, 0.4, 5.5], i % 2 ? 0 : 4)
  } else if (city === 'space') {
    // An inclined orbital habitat, radial sail anchorage and modular dock spine.
    const orbitalHabitat = ring([0, 45, 0], 33, 4, 0, [Math.PI / 2, 0, 0.2])
    for (let i = 0; i < 28; i++) { const t = i * TAU / 28; box([Math.cos(t) * 33, 45 + Math.sin(t) * 33, 0], [7, 3, 9], i % 4 ? 4 : 1, [0, 0, t + Math.PI / 2]); if (i % 7 === 0) beam([Math.cos(t) * 33, 45 + Math.sin(t) * 33, 0], [0, 45, 0], 1) }
    box([0, 45, 0], [5, 5, 32], 2)
    for (let i = 0; i < 6; i++) { const m = shell([-58, 7, -30], [12, 48, 18], 0, i % 2 ? 2 : 4, i * TAU / 6, 'sail'); m.rotation.z = 0.4 }
    for (let i = 0; i < 3; i++) habitat(43 + i * 12, -27, 18, 37 - i * 4, i)
    for (let i = 0; i < 10; i++) { const x = (i % 5 - 2) * 27, z = 50 + Math.floor(i / 5) * 24; terrace(x, z, 2, 18, 12); for (const side of [-1, 1]) box([x + side * 11, 6, z], [6, 0.3, 16], 1, [0, 0, side * 0.2]) }
    // Habitat motion is deliberately subtle and decorative.
    void orbitalHabitat
  } else if (city === 'robotics') {
    // Sawtooth assembly cathedral and travelling overhead cranes.
    box([0, 7, 0], [43, 14, 56], 1)
    for (let i = 0; i < 9; i++) {
      const z = -26 + i * 6.5
      beam([-22, 0, z], [-22, 39, z], 1.2, 0); beam([-22, 39, z], [0, 64, z], 1, 0); beam([0, 64, z], [22, 29, z], 1, 0); beam([22, 29, z], [22, 0, z], 1.2, 0)
      box([-12, 27, z], [19, 0.8, 5], 2, [0, 0, 0.6])
    }
    for (const side of [-1, 1]) {
      lattice(side * 57, -25, 47, 11)
      beam([side * 57 - 17, 47, -25], [side * 57 + 17, 47, -25], 2)
      const carriage = box([side * 57, 44, -25], [7, 4, 7], 2); groups[2].pop(); animated.push(carriage)
    }
    for (let i = 0; i < 8; i++) { const x = (i % 4 - 1.5) * 37, z = 50 + Math.floor(i / 4) * 27; terrace(x, z, 2, 26, 18, 1); for (let j = 0; j < 4; j++) box([x - 10 + j * 6, 10, z], [5, 1, 19], 2, [0, 0, 0.25]) }
  } else {
    // Human-scale courtyard neighbourhoods rise to an open civic gathering hall.
    for (let i = 0; i < 10; i++) { const a = i * TAU / 10; const x = Math.cos(a) * 22, z = Math.sin(a) * 22; beam([x, 0, z], [x * 0.6, 34, z * 0.6], 1.1, 2); shell([x * 0.6, 30, z * 0.6], [12, 25, 18], 0, i % 2 ? 0 : 4, -a) }
    for (let i = 0; i < 5; i++) terrace(-62 + i * 5, -40 + i * 8, 5, 22, 16)
    for (let i = 0; i < 7; i++) { arch(57, 5, -44 + i * 6, 14, 18); box([57, 4, -44 + i * 6], [27, 1, 5], 4) }
    for (let i = 0; i < 18; i++) { const x = (i % 6 - 2.5) * 25, z = 37 + Math.floor(i / 6) * 21; terrace(x, z, 2 + i % 3, 19, 14, i % 3 ? 0 : 4); tree(x + 10, z + 7, 5); if (i % 6 < 5) path([x, 7, z], [x + 25, 7, z], 2) }
  }

  // Three scales of fabric: tall background institutions, middle-distance
  // workshops, and low foreground street blocks. A deterministic street grid
  // leaves the central civic axis and every landmark footprint unobstructed.
  const lots: { x: number; z: number; n: number }[] = []
  for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) {
    const x = (col - 3.5) * 25, z = row === 0 ? -89 : row === 1 ? 82 : 105
    if (Math.abs(x) < 18 && z > 0) continue
    lots.push({ x, z, n: lots.length })
  }
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) lots.push({ x: side * 96, z: -53 + i * 31, n: lots.length })
  for (const { x, z, n } of lots) {
    const foreground = z > 50
    const floors = foreground ? 2 + n % 2 : 4 + n % 4
    const width = 15 + seed(n) * 3, depth = 12 + seed(n + 4) * 3
    if (city === 'ai') {
      terrace(x, z, floors, width, depth, 1)
      const h = floors * 4.2
      for (const side of [-1, 1]) {
        beam([x + side * width * 0.55, 0, z], [x + side * width * 0.3, h + 5, z], 0.5, 0)
        box([x + side * width * 0.55, h * 0.55, z], [0.2, h * 0.65, 1.2], 3)
      }
      box([x, h + 4, z], [width * 0.9, 1, depth * 0.7], 2)
    } else if (['gaming', 'education', 'health', 'creative', 'revival'].includes(city)) {
      district(x, z, floors * 4.2, width, depth, n)
    } else if (city === 'graveyard') {
      for (let bay = 0; bay < 4; bay++) {
        const h = 6 + seed(n * 7 + bay) * (foreground ? 7 : 23)
        box([x - 6 + bay * 4, h / 2, z], [2.7, h, depth], bay % 2 ? 0 : 1, [0.03, 0, (seed(n + bay) - 0.5) * 0.1])
        if (bay < 3 && n % 3) beam([x - 6 + bay * 4, h, z], [x - 2 + bay * 4, h - 2, z], 0.7, 2)
      }
      for (let i = 0; i < 3; i++) box([x + i * 3, 0.8, z + 8], [5, 1.5, 3], 1, [0.1, seed(n + i) * 3, 0.2])
    } else if (city === 'success' || city === 'space') {
      district(x, z, floors * 4.2, width, depth, n)
    } else if (city === 'robotics') {
      terrace(x, z, 2, width, depth, 1)
      for (let bay = 0; bay < 5; bay++) {
        const px = x - width * 0.45 + bay * width * 0.22
        beam([px, 8, z - 6], [px, 17, z], 0.45, 2)
        beam([px, 17, z], [px, 8, z + 6], 0.45, 2)
      }
      box([x, 12, z], [width, 0.5, 9], 4, [0.1, 0, 0])
      if (n % 3 === 0) lattice(x + 9, z, 25, 2)
    } else {
      district(x, z, floors * 4.2, width, depth, n)
    }
    // Distinct paved courts establish a grounded scale around every building.
    box([x, 0.08, z], [width + 3, 0.16, depth + 3], 4)
  }

  // Intentional approach spine and plaza furniture, with open project-placement
  // zones on either side. City geometry never invents project markers.
  for (const side of [-1, 1]) {
    path([side * 8, 0.15, 24], [side * 8, 0.15, 100], 2, 4)
    for (let i = 0; i < 8; i++) {
      const z = 28 + i * 9
      beam([side * 10, 0, z], [side * 10, 4, z], 0.14)
      box([side * 10, 4.1, z], [0.6, 0.3, 0.6], 3)
      if (i % 2 === 0) { box([side * 14, 0.7, z], [3, 0.4, 1.1], 2); beam([side * 15, 0, z], [side * 15, 0.7, z], 0.2); beam([side * 13, 0, z], [side * 13, 0.7, z], 0.2) }
    }
  }
  const meshes: AbstractMesh[] = []
  groups.forEach((parts, index) => {
    if (!parts.length) return
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, false)
    if (merged) { merged.name = `${city}-architecture-${index}`; merged.material = materials[index]; merged.receiveShadows = true; meshes.push(merged) }
  })
  meshes.push(...animated)
  const origins = animated.map(m => m.position.x)
  return { meshes, animate: animated.length ? (time: number) => animated.forEach((m, i) => { m.position.x = origins[i] + Math.sin(time * 0.18 + i) * 10 }) : undefined }
}
