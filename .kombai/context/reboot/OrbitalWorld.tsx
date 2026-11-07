import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { CITIES, CITY_CATEGORIES } from './cityRegistry'
import { OrbitalRebootTitle } from './environment/MegaTitles'
import { districtAnchor } from './flightMath'
import { useJourney } from '@/planet/stores/journey'
import { useUI } from '@/planet/stores/ui'

const vertex = `varying vec3 vNormal; varying vec3 vEye;
void main(){ vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vEye=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`
const fragment = `varying vec3 vNormal; varying vec3 vEye;
void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vEye))),3.2);
vec3 color=mix(vec3(.12,.65,.8),vec3(.95,.52,.22),smoothstep(-.6,.7,vNormal.x));gl_FragColor=vec4(color,rim*.62);}`

function plateData(low: boolean) {
  const plates: {matrix: THREE.Matrix4; color: THREE.Color}[] = []
  const towers: {matrix: THREE.Matrix4; color: THREE.Color}[] = []
  const dummy = new THREE.Object3D()
  const normal = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const count = low ? 1600 : 3200
  for (let i = 0; i < count; i++) {
    const y = 1 - 2 * (i + .5) / count
    const a = i * 2.39996323
    const r = Math.sqrt(1 - y * y)
    normal.set(Math.cos(a) * r, y, Math.sin(a) * r)
    const land = Math.sin(normal.x * 8 + normal.z * 3) + Math.cos(normal.y * 9 - normal.x * 4) + Math.sin(normal.z * 11 + normal.y * 3) * .55
    if (land < -.3) continue
    dummy.quaternion.setFromUnitVectors(up, normal)
    dummy.rotateY(a)
    const relief = .25 + Math.max(0, land) * .55
    dummy.position.copy(normal).multiplyScalar(29.8 + relief / 2)
    dummy.scale.set(low ? 1.64 : 1.15, relief, low ? 1.64 : 1.15)
    dummy.updateMatrix()
    plates.push({ matrix: dummy.matrix.clone(), color: new THREE.Color(i % 13 === 0 ? '#b09363' : i % 5 === 0 ? '#426777' : '#223944') })
    if (land > .1 && i % 3 === 0) {
      const h = .6 + ((i * 17) % 31) / 9
      dummy.position.copy(normal).multiplyScalar(30 + relief + h / 2)
      dummy.scale.set(.32 + (i % 3) * .14, h, .4)
      dummy.updateMatrix()
      towers.push({ matrix: dummy.matrix.clone(), color: new THREE.Color(i % 9 === 0 ? '#ffbe75' : i % 4 === 0 ? '#77efdf' : '#38707c') })
    }
  }
  return { plates, towers }
}

/** A fabricated atlas, not synthetic project data. Two instanced meshes hold the city crust. */
export function OrbitalWorld({ reduced, lowEffects, interactive = true }: {reduced: boolean; lowEffects: boolean; interactive?: boolean}) {
  const plates = useRef<THREE.InstancedMesh>(null)
  const towers = useRef<THREE.InstancedMesh>(null)
  const relay = useRef<THREE.Group>(null)
  const selected = useJourney(s => s.selectedCity)
  const introducing = useJourney(s => s.introducing)
  const busy = useUI(s => s.travelPhase !== 'idle')
  const data = useMemo(() => plateData(lowEffects), [lowEffects])
  const stars = useMemo(() => {
    const array = new Float32Array((lowEffects ? 450 : 1000) * 3)
    for (let i = 0; i < array.length / 3; i++) {
      const a = i * 2.399963, y = 1 - 2 * (i + .5) / (array.length / 3)
      const r = Math.sqrt(1 - y * y)
      array.set([Math.cos(a) * r * 430, y * 430, Math.sin(a) * r * 430], i * 3)
    }
    return array
  }, [lowEffects])
  useLayoutEffect(() => {
    for (const [mesh, entries] of [[plates.current, data.plates], [towers.current, data.towers]] as const) {
      if (!mesh) continue
      entries.forEach((item, index) => { mesh.setMatrixAt(index, item.matrix); mesh.setColorAt(index, item.color) })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [data])
  useFrame((_, delta) => {
    if (relay.current && !reduced) relay.current.rotation.y += Math.min(delta, .05) * .045
  })
  const enter = (event: ThreeEvent<MouseEvent>) => {
    if (!interactive || introducing || busy || event.delta > 5) return
    event.stopPropagation()
    useUI.getState().enterCity(selected)
  }
  return <group name="second-dawn-orbital-atlas">
    <points frustumCulled={false}>
      <bufferGeometry><bufferAttribute attach="attributes-position" count={stars.length / 3} array={stars} itemSize={3} /></bufferGeometry>
      <pointsMaterial size={.65} color="#b4ccd7" transparent opacity={.72} sizeAttenuation depthWrite={false} fog={false} />
    </points>
    <group position={[12, 0, 0]}>
      <mesh onClick={enter}><sphereGeometry args={[29.8, 80, 56]} /><meshStandardMaterial color="#091922" roughness={.78} metalness={.55} /></mesh>
      <instancedMesh ref={plates} args={[undefined, undefined, data.plates.length]} onClick={enter}>
        <boxGeometry /><meshStandardMaterial metalness={.5} roughness={.68} />
      </instancedMesh>
      <instancedMesh ref={towers} args={[undefined, undefined, data.towers.length]} onClick={enter}>
        <boxGeometry /><meshStandardMaterial metalness={.6} roughness={.4} emissive="#3b9e9a" emissiveIntensity={.28} />
      </instancedMesh>
      <mesh scale={1.018}><sphereGeometry args={[32, 64, 48]} /><shaderMaterial vertexShader={vertex} fragmentShader={fragment} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.FrontSide} /></mesh>
      <group rotation={[.34, .13, -.36]}>
        {[39, 40.3, 45].map((radius, i) => <mesh key={radius} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius, i === 1 ? .28 : .075, 6, lowEffects ? 100 : 180]} />
          <meshBasicMaterial color={i === 1 ? '#718689' : '#e7bb7b'} transparent opacity={i === 1 ? .45 : .78} />
        </mesh>)}
        <group ref={relay}>{Array.from({length: 24}, (_, i) => {
          const a = i / 24 * Math.PI * 2
          return <group key={i} position={[Math.sin(a) * 40.3, 0, Math.cos(a) * 40.3]} rotation={[0, a, 0]}>
            <mesh><boxGeometry args={[i % 6 === 0 ? 3 : .5, .36, 1.35]} /><meshStandardMaterial color="#81938e" metalness={.7} roughness={.4} /></mesh>
            <mesh position={[0, .25, 0]}><boxGeometry args={[i % 6 === 0 ? 2.6 : .3, .08, .32]} /><meshBasicMaterial color="#fae0a9" /></mesh>
          </group>
        })}</group>
      </group>
      <mesh position={[-40, 16, -40]}><sphereGeometry args={[9, 32, 24]} /><meshStandardMaterial color="#827667" roughness={1} /></mesh>
    </group>
    <OrbitalRebootTitle reduced={reduced} lowEffects={lowEffects} />
    {interactive && !introducing && !busy && CITY_CATEGORIES.map(city => {
      const position = districtAnchor(city)
      return <group key={city} position={position}>
        <mesh><octahedronGeometry args={[selected === city ? .8 : .45]} /><meshBasicMaterial color={CITIES[city].palette.accent} /></mesh>
        {selected === city && <Html center position={[0, 2.6, 0]} occlude distanceFactor={115} zIndexRange={[12, 0]}>
          <button className="orbital-beacon" onClick={() => useUI.getState().enterCity(city)} style={{borderColor:CITIES[city].palette.accent}}>{CITIES[city].name}<span>DESCEND ↗</span></button>
        </Html>}
      </group>
    })}
  </group>
}
