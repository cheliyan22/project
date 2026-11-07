import { CelestialPlanet } from './CelestialPlanet'
import { useDistrictSignals } from './districtSignals'
import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { CITIES, type CityId } from '../cityRegistry'
import { Architecture, Motion, Parts, useEnvironment, type Vec } from './ScenePrimitives'
import { BlackHole } from './BlackHole'

const V=(x:number,y:number,z:number):Vec=>[x,y,z]
function arch(a:Architecture,x:number,z:number,r:number,spring:number,color:string,width=.5) {
  for(const side of [-1,1])a.beam(V(x+side*r,0,z),V(x+side*r,spring,z),width,color)
  for(let i=0;i<16;i++) {
    const t=i*Math.PI/16,u=(i+1)*Math.PI/16
    a.beam(V(x+Math.cos(t)*r,spring+Math.sin(t)*r,z),V(x+Math.cos(u)*r,spring+Math.sin(u)*r,z),width,color)
  }
}
function book(a:Architecture,x:number,y:number,z:number,size:number,color:string,angle=0) {
  for(const side of [-1,1])a.box([x+side*size*.48,y,z],[size,.18,size*.72],color,[0,angle,side*.2],false,'wood')
  a.beam(V(x,y-.1,z-size*.38),V(x,y-.1,z+size*.38),.12,'#8d765c',false,'wood')
}

export function landmarkArchitecture(city: CityId) {
  const a=new Architecture(),p=CITIES[city].palette
  switch(city) {
    case 'Graveyard': {
      // A split Gothic archive: open vault, rose window, exposed ribs and a fallen nave.
      a.add('pillar',[0,.4,0],[12,.8,10],'#3c414f')
      for(const z of [-4,1])arch(a,0,z,8,12,'#686777',.65)
      for(const side of [-1,1]) {
        a.box([side*8,9,-2],[2,18,8],'#3b4351',[0,0,side*.08])
        a.beam(V(side*8,17,-2),V(side*5,29,-2),.75,'#5e5d70')
        a.add('cone',[side*5,30,-2],[2,8,2],'#4b4a5c',[0,0,side*.18])
        a.box([side*11,4,3],[5,.7,8],'#565064',[0,side*.3,side*.25])
      }
      a.ring([0,18,-3.7],4.2,'#8a6d80',[0,0,0],false)
      for(let i=0;i<8;i++){const t=i*Math.PI/4;a.beam(V(0,18,-3.6),V(Math.cos(t)*4,18+Math.sin(t)*4,-3.6),.12,'#9b7180',true)}
      a.box([0,6,1.5],[7,12,.7],'#171d29');a.box([0,6,1.9],[.14,11,.08],'#c96b72',undefined,true)
      for(let i=0;i<7;i++)a.box([-7+i*2.2,.5,8+i%2],[1.5,.8,3],'#625668',[.1,i*.4,(i-3)*.08])
      break
    }
    case 'IdeaHub': {
      // Two restoration gantries hold an unfinished core between ruin and renewal.
      a.add('hex',[0,.5,0],[12,1,12],'#496763',undefined,false,'metal')
      for(const side of [-1,1]) {
        for(const z of [-4,4])a.beam(V(side*9,0,z),V(side*9,25,z),.55,'#c49a6b',false,'metal')
        a.box([side*9,5,0],[3,10,10],side<0?'#55464b':'#62948a',undefined,false,'metal')
        a.beam(V(side*9,22,-4),V(side*4,29,-4),.5,'#d1aa79',false,'metal')
        a.beam(V(side*9,22,4),V(side*4,29,4),.5,'#d1aa79',false,'metal')
      }
      a.box([0,29,0],[20,.8,10],'#849c93',undefined,false,'metal')
      for(let i=0;i<6;i++) {
        a.box([-8+i*3.2,30,0],[.3,2,10],'#c79b68',undefined,false,'metal')
        if(i<4)a.box([-7+i*2,3+i*2,2],[5-i*.6,1.2,5-i*.6],i<2?'#665154':'#6bb09e',[0,i*.15,0],false,'metal')
      }
      a.beam(V(0,29,0),V(0,18,0),.09,'#d4d7c9',false,'metal')
      a.add('rock',[0,16,0],[3,4,3],'#76c5ae',[.2,.4,.1],false,'metal')
      a.ring([0,16,0],5,p.secondary,[.3,.2,0])
      break
    }
    case 'Legend': {
      // A ceremonial acropolis with a split spire, colonnades and a monumental stair.
      for(let i=0;i<5;i++)a.box([0,.2+i*.35,7-i],[22-i*2,.4,16-i*1.4],i%2?'#b8b5a3':'#d1c7ac')
      for(const side of [-1,1]) {
        for(let i=0;i<5;i++) {
          a.add('pillar',[side*(6+i*2.2),6,0],[.55,12,.55],'#e0d5ba')
          a.add('pillar',[side*(6+i*2.2),12,0],[.85,.5,.85],'#c6a36c')
        }
        a.box([side*10.5,12.6,0],[12,.8,5],'#d8c9a9')
        a.beam(V(side*4,2,0),V(side*1.1,37,0),1.3,'#d8cfb7')
        a.beam(V(side*4,2,.8),V(side*1.1,37,.8),.12,p.accent,true)
      }
      a.box([0,37,0],[5,1.2,4],'#c5a36c');a.add('rock',[0,40,0],[1.6,2.5,1.6],p.secondary,undefined,true)
      for(const x of [-12,12]) {
        a.add('pillar',[x,2,8],[2,4,2],'#aaa894')
        a.add('rock',[x,5.5,8],[1.2,2,1.2],'#d4b578')
      }
      break
    }
    case 'AI': {
      // Six structural tendons cradle a visible neural volume, not a generic glowing tower.
      a.add('hex',[0,.5,0],[12,1,12],'#28485d',undefined,false,'metal')
      for(let i=0;i<6;i++) {
        const t=i*Math.PI/3,x=Math.cos(t),z=Math.sin(t)
        a.beam(V(x*10,0,z*10),V(x*9,10,z*9),.65,'#4f7f93',false,'metal')
        a.beam(V(x*9,10,z*9),V(x*6,23,z*6),.45,'#609bad',false,'metal')
        a.beam(V(x*6,23,z*6),V(x*2.5,28,z*2.5),.22,p.accent,true)
        for(let y=3;y<18;y+=4)a.add('hex',[x*(10-y*.12),y,z*(10-y*.12)],[1.2,.35,1.2],'#355e73',[0,-t,0],false,'metal')
      }
      a.ring([0,7,0],10,p.accent);a.ring([0,26,0],5,p.secondary,[.25,0,0])
      for(let i=0;i<8;i++){const t=i*Math.PI/4;a.beam(V(Math.cos(t)*10,.2,Math.sin(t)*10),V(Math.cos(t)*3,.2,Math.sin(t)*3),.16,p.secondary,true)}
      break
    }
    case 'Gaming': {
      // The Infinite Arcade is a walk-through neon gateway with joystick towers and a pixel crown.
      a.add('hex',[0,.4,0],[13,.8,13],'#3b3455',undefined,false,'ceramic')
      for(const side of [-1,1]) {
        a.box([side*9,8,0],[3.5,16,6],side<0?'#59426e':'#3f5d79',undefined,false,'metal')
        a.box([side*9,16.5,0],[4.5,1.5,7],side<0?'#d18c67':'#8e65a0',undefined,false,'ceramic')
        a.add('pillar',[side*9,20,0],[.45,6,.45],'#b9c1bc',undefined,false,'metal')
        a.add('orb',[side*9,23.5,0],[1.5,1.5,1.5],side<0?p.secondary:p.accent)
        for(let y=3;y<14;y+=3)a.box([side*9,y,3.05],[2.2,.45,.08],y%2?p.secondary:p.accent,undefined,true)
      }
      arch(a,0,0,8,10,'#82618e',1.2)
      arch(a,0,.2,6.7,10,p.accent,.18)
      a.box([0,20,0],[18,2,5],'#3e3457',undefined,false,'metal')
      // Stepped crown and an open playfield under the gate.
      for(let i=0;i<9;i++)a.box([(i-4)*2,22+(i%3)*1.1,0],[1.8,2+(i%3)*2,3],['#c47c72','#75598e','#4f8090'][i%3])
      for(let x=0;x<7;x++)for(let z=0;z<5;z++)a.box([(x-3)*2,.9,(z-2)*2],[1.9,.12,1.9],(x+z)%2?'#d1b286':'#443758')
      break
    }
    case 'Education': {
      // A branching archive whose canopy is made from enormous open books.
      a.add('pillar',[0,.5,0],[12,1,12],'#627f75')
      a.beam(V(0,0,0),V(0,18,0),1.7,'#7e6e58',false,'wood')
      for(let i=0;i<11;i++) {
        const angle=i*2.4,y=8+i*1.25,r=5+i*.45,x=Math.cos(angle)*r,z=Math.sin(angle)*r
        a.beam(V(0,y-3,0),V(x,y,z),.55,'#8c795b',false,'wood')
        a.beam(V(x,y,z),V(x*1.35,y+3,z*1.35),.25,'#a18a64',false,'wood')
        book(a,x*1.35,y+3,z*1.35,3.5,i%2?'#d8c18f':'#87aaa0',-angle)
        a.add('rock',[x*1.35,y+4,z*1.35],[2.4,1.3,2.4],i%2?'#8eb28b':'#b4c592',undefined,false,'foliage')
      }
      for(let i=0;i<8;i++){const t=i*Math.PI/4;a.add('pillar',[Math.cos(t)*10,3,Math.sin(t)*10],[.35,6,.35],'#b8ab89');book(a,Math.cos(t)*10,6.4,Math.sin(t)*10,3,'#c7b17f',-t)}
      break
    }
    case 'Health': {
      // A living conservatory: petal ribs, a central mature tree and a circular water garden.
      a.add('pillar',[0,.5,0],[13,1,13],'#609b8c')
      a.ring([0,1.05,0],11,'#a5dbc6',undefined,false)
      for(let i=0;i<10;i++) {
        const t=i*Math.PI/5,x=Math.cos(t),z=Math.sin(t)
        a.beam(V(x*11,1,z*11),V(x*9,9,z*9),.28,'#d0e3d3',false,'metal')
        a.beam(V(x*9,9,z*9),V(x*3,16,z*3),.22,'#d0e3d3',false,'metal')
        a.add('orb',[x*8,4,z*8],[2.2,3.5,2.2],i%2?'#83b89b':'#a4cbb0',undefined,false,'ceramic')
      }
      a.beam(V(0,1,0),V(0,14,0),.9,'#8c795c',false,'wood')
      for(let i=0;i<9;i++){const t=i*2.4,r=i?5:0;a.add('orb',[Math.cos(t)*r,13+i%3,Math.sin(t)*r],[4,3,4],['#5da683','#82bd94','#b0d0a4'][i%3],undefined,false,'foliage')}
      break
    }
    case 'Creator': {
      // Interlocking frames and an impossible stair wrap a void; nothing forms a normal tower.
      a.add('hex',[0,.4,0],[12,.8,12],'#544566')
      for(let i=0;i<4;i++) {
        const angle=i*Math.PI/2+.35,x=Math.cos(angle)*7,z=Math.sin(angle)*7
        a.box([x,10,z],[3,20,3],['#9c6f96','#5e7fa0','#c09375','#746492'][i],[.15,angle,(i-1.5)*.16],false,'metal')
        a.box([x*.6,18,z*.6],[12,.6,8],['#c18aa5','#749db7'][i%2],[.2,angle,.25])
      }
      for(let i=0;i<18;i++) {
        const t=i*.48,r=8-i*.18
        a.box([Math.cos(t)*r,1+i*.85,Math.sin(t)*r],[4,.35,1.5],i%2?'#b29bb5':'#7397ae',[0,-t,Math.sin(i)*.08])
      }
      a.ring([0,17,0],8,'#c198bd',[.6,.3,.2],false)
      a.ring([0,17,0],5,p.secondary,[1.2,.2,.8])
      break
    }
    case 'Space': {
      // A giant inclined radio dish dominates the observatory, with an astronomical clock below.
      a.add('pillar',[0,.6,0],[12,1.2,12],'#536981',undefined,false,'metal')
      for(const side of [-1,1]) {
        a.beam(V(side*7,0,2),V(side*4,16,0),.8,'#899aa9',false,'metal')
        a.beam(V(side*7,0,-2),V(side*4,16,0),.8,'#899aa9',false,'metal')
        a.box([side*11,8,0],[10,.25,5],'#304e7d',[0,0,side*.2],false,'metal')
      }
      a.add('pillar',[0,8,0],[2,16,2],'#6f8399',undefined,false,'metal')
      a.ring([0,12,0],8,p.secondary,[.35,0,0])
      a.ring([0,12,0],5,p.accent,[1.1,.4,0])
      break
    }
    case 'Robotics': {
      // The Forge Core is an open reactor surrounded by assembly arms and an overhead crane.
      a.add('hex',[0,.5,0],[13,1,13],'#445d67',undefined,false,'metal')
      a.add('pillar',[0,8,0],[5,16,5],'#314b56',undefined,false,'metal')
      for(let i=0;i<5;i++) {
        a.ring([0,2+i*3.2,0],5.4,i%2?p.secondary:'#7b9b9c',undefined,i%2===1)
        for(let j=0;j<6;j++){const t=j*Math.PI/3;a.box([Math.cos(t)*5,2+i*3.2,Math.sin(t)*5],[1,.6,1],'#a88a64',[0,-t,0],false,'metal')}
      }
      a.add('rock',[0,17,0],[3,3,3],p.accent,undefined,true)
      for(const side of [-1,1]) {
        a.box([side*10,7,0],[2,14,5],'#647a80',undefined,false,'metal')
        a.add('orb',[side*10,14,0],[1.4,1.4,1.4],'#c19a6b',undefined,false,'metal')
        a.beam(V(side*10,14,0),V(side*6,20,0),.9,'#c19a6b',false,'metal')
        a.add('orb',[side*6,20,0],[1.1,1.1,1.1],'#6f9394',undefined,false,'metal')
      }
      a.box([0,25,0],[24,1,5],'#a88963',undefined,false,'metal')
      for(let i=0;i<7;i++)a.box([-10+i*3.3,26,0],[.3,2,5],'#637a80',undefined,false,'metal')
      break
    }
    case 'Community': {
      // Common Ground is an open civic forum built around a shade tree, not a skyscraper.
      for(let row=0;row<4;row++)for(let i=0;i<18;i++) {
        const t=i*Math.PI*2/18,r=8+row*1.5
        a.box([Math.cos(t)*r,.2+row*.35,Math.sin(t)*r],[2.5,.35,1.2],row%2?'#b8a68a':'#9e9d87',[0,-t,0])
      }
      a.beam(V(0,0,0),V(0,13,0),1,'#806a50',false,'wood')
      for(let i=0;i<10;i++) {
        const t=i*2.4,r=i?5:0,x=Math.cos(t)*r,z=Math.sin(t)*r
        a.beam(V(0,8,0),V(x,12+i%2,z),.35,'#8a7355',false,'wood')
        a.add('orb',[x,13+i%2,z],[4,2.8,4],['#609477','#85aa7d','#b0bc82'][i%3],undefined,false,'foliage')
      }
      for(let i=0;i<6;i++) {
        const t=i*Math.PI/3,x=Math.cos(t)*13,z=Math.sin(t)*13
        a.beam(V(x,0,z),V(x,7,z),.25,'#8f7457',false,'wood')
        a.add('cone',[x,7.5,z],[4,2.5,4],i%2?'#bd7d61':'#6b9b8b',[0,Math.PI/4,0],false,'ceramic')
        a.beam(V(x,6,z),V(Math.cos(t+Math.PI/3)*13,6,Math.sin(t+Math.PI/3)*13),.06,'#f2cc8e',true)
      }
      break
    }
  }
  return a
}

function ObservatoryDish() {
  const geometry=useMemo(()=>{
    const points=Array.from({length:20},(_,i)=>{const r=i/19*8;return new THREE.Vector2(r,r*r*.07)})
    return new THREE.LatheGeometry(points,48)
  },[])
  useEffect(()=>()=>geometry.dispose(),[geometry])
  return <group position={[0,18,0]} rotation={[.72,0,-.18]}>
    <mesh geometry={geometry}><meshStandardMaterial color="#c5ced0" metalness={.55} roughness={.3} side={THREE.DoubleSide}/></mesh>
    <mesh position={[0,5,0]}><sphereGeometry args={[.45,16,12]}/><meshBasicMaterial color="#8bdcf0"/></mesh>
    {[0,1,2].map(i=>{const t=i*Math.PI*2/3;return <mesh key={i} position={[Math.cos(t)*3,2.5,Math.sin(t)*3]} rotation={[0,0,Math.cos(t)*.5]}><boxGeometry args={[.15,6,.15]}/><meshStandardMaterial color="#6f8394" metalness={.7}/></mesh>})}
  </group>
}
function ConservatoryGlass() {
  return <mesh position={[0,1,0]} scale={[1,.75,1]}><sphereGeometry args={[12,40,20,0,Math.PI*2,0,Math.PI/2]}/><meshPhysicalMaterial color="#a8ead2" transparent opacity={.12} roughness={.12} depthWrite={false} side={THREE.DoubleSide}/></mesh>
}

export function CityLandmark({city}: {city:CityId}) {
  const data=useMemo(()=>landmarkArchitecture(city),[city]),p=CITIES[city].palette
  return <group name={city+'-main-landmark'} onClick={e=>{e.stopPropagation();useDistrictSignals.getState().open(city)}} onPointerOver={()=>{document.body.style.cursor='pointer'}} onPointerOut={()=>{document.body.style.cursor='auto'}}>
    <LandmarkResponse city={city}/>
    <Parts solid data={data} />
    {city==='Graveyard' && <BlackHole />}
    {city==='AI' && <><mesh position={[0,16,0]}><sphereGeometry args={[7,28,20]} /><meshPhysicalMaterial color="#4599b4" transparent opacity={.1} roughness={.15} depthWrite={false} side={THREE.DoubleSide} /></mesh><Motion position={[0,16,0]} speed={.08}><group scale={1.5}><BrainCore color={p.accent} /></group><OrbitalRings color={p.secondary} radius={8.5}/></Motion></>}
    {city==='Health' && <><ConservatoryGlass/><Motion position={[0,15,0]} speed={.06}><OrbitalRings color={p.accent} radius={4}/></Motion></>}
    {city==='Creator' && <ImaginationEngine />}
    {city==='IdeaHub' && <RepairCycle />}
    {city==='Robotics' && <><Motion position={[0,17,0]} speed={.17}><OrbitalRings color={p.accent} radius={5.5}/></Motion><MechanicalArms /></>}
    {city==='Space' && <><ObservatoryDish/><Motion position={[0,12,0]} speed={.055}><OrbitalRings color={p.secondary} radius={10}/></Motion><CelestialPlanet position={[-55,42,-105]} radius={17} gas/><CelestialPlanet position={[58,24,-95]} radius={10}/></>}
    {city==='Legend' && <Motion position={[0,35,0]} speed={.04}><OrbitalRings color={p.accent} radius={4}/></Motion>}
    {city==='Gaming' && <Motion position={[0,26,0]} speed={.15}><mesh><octahedronGeometry args={[2]} /><meshStandardMaterial color="#d5a46f" emissive={p.secondary} emissiveIntensity={.3}/></mesh></Motion>}
    {city==='Education' && <Motion position={[0,24,0]} speed={.04}><OrbitalRings color={p.secondary} radius={8}/></Motion>}
  </group>
}
export function OrbitalRings({color,radius}: {color:string;radius:number}) {
  return <>{[0,1,2].map(i=><mesh key={i} rotation={[.5+i*.7,.3*i,0]}><torusGeometry args={[radius,.06,6,64]} /><meshBasicMaterial color={color} /></mesh>)}</>
}
export function BrainCore({color}: {color:string}) {
  const folds=useMemo(()=>{
    const paths: THREE.TubeGeometry[]=[]
    for(const side of [-1,1])for(let band=0;band<11;band++) {
      const latitude=(band/10-.5)*Math.PI*.85,points:THREE.Vector3[]=[]
      for(let i=0;i<64;i++) {
        const angle=i/63*Math.PI*2,wrinkle=Math.sin(angle*7+band*.9)*.12
        points.push(new THREE.Vector3(side*(1.65+Math.cos(angle)*(1.65+wrinkle)*Math.cos(latitude)),Math.sin(latitude)*2.45+Math.sin(angle*6+band)*.09,Math.sin(angle)*(2.6+wrinkle)*Math.cos(latitude)))
      }
      paths.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),64,.095,5,true))
    }
    return paths
  },[])
  useEffect(()=>()=>folds.forEach(geometry=>geometry.dispose()),[folds])
  return <group name="volumetric-neural-brain">
    {[-1,1].map(side=><mesh key={side} position={[side*1.65,0,0]} scale={[1.65,2.45,2.6]}><sphereGeometry args={[1,24,16]}/><meshStandardMaterial color="#5c9dab" roughness={.6} metalness={.15}/></mesh>)}
    {folds.map((geometry,i)=><mesh key={i} geometry={geometry}><meshStandardMaterial color={i%3===0?color:'#a8cdd3'} emissive={color} emissiveIntensity={i%3===0?.35:.08} roughness={.5}/></mesh>)}
    <mesh position={[0,-2.8,-.5]} rotation={[.3,0,0]}><cylinderGeometry args={[.45,.3,1.8,8]}/><meshStandardMaterial color="#6592a9"/></mesh>
  </group>
}
function ImaginationEngine() {
  const ref=useRef<THREE.Group>(null),{reduced,lowEffects}=useEnvironment(),time=useRef(0)
  useFrame((_,delta)=>{if(reduced||!ref.current)return;time.current+=Math.min(delta,.1);ref.current.children.forEach((child,i)=>{child.position.set(Math.cos(i*2.4+time.current*.1)*(3+Math.sin(time.current*.3+i)),Math.sin(i*1.7+time.current*.25)*3,Math.sin(i*2.4+time.current*.1)*4);child.rotation.set(time.current*.1+i,i,time.current*.08)})})
  return <group position={[0,18,0]}><group ref={ref}>{Array.from({length:lowEffects?7:12},(_,i)=><mesh key={i} position={[Math.cos(i*2.4)*4,Math.sin(i)*3,Math.sin(i*2.4)*4]}><octahedronGeometry args={[1.3]} /><meshStandardMaterial color={['#b978bb','#719cdb','#e6b987'][i%3]} metalness={.6} roughness={.25}/></mesh>)}</group></group>
}
function RepairCycle() {
  const ref=useRef<THREE.Group>(null),{reduced}=useEnvironment(),t=useRef(0)
  useFrame((_,delta)=>{if(reduced||!ref.current)return;t.current+=Math.min(delta,.1);const phase=(t.current*.1)%1;ref.current.position.set(-5+phase*10,9+Math.sin(phase*Math.PI)*9,3)})
  return <group ref={ref} position={[-5,9,3]}><mesh><boxGeometry args={[3,.5,3]}/><meshStandardMaterial color="#8dc8b2" /></mesh><mesh position={[0,1.4,0]}><boxGeometry args={[1,.5,1]}/><meshBasicMaterial color="#dfbe7c"/></mesh></group>
}
function MechanicalArms() {
  return <>{[-1,1].map(side=><Motion key={side} position={[side*10,14,0]} axis="z" speed={side*.35} swing><mesh position={[0,3,0]}><boxGeometry args={[.8,6,1]}/><meshStandardMaterial color="#c39465" /></mesh><mesh position={[0,6,0]}><sphereGeometry args={[1,10,8]}/><meshStandardMaterial color="#75a8b6" /></mesh><mesh position={[side*2,6,0]}><boxGeometry args={[4,.6,.8]}/><meshStandardMaterial color="#ab9479" /></mesh></Motion>)}</>
}

function LandmarkResponse({city}:{city:CityId}) {
  const group=useRef<THREE.Group>(null),scan=useRef<THREE.Mesh>(null),{reduced}=useEnvironment()
  const active=useDistrictSignals(s=>s.repairPreview),pulse=useDistrictSignals(s=>s.pulse)
  useFrame(()=>{
    const seconds=(performance.now()-pulse)/1000
    if(scan.current){scan.current.visible=pulse>0&&seconds<4;scan.current.scale.setScalar(1+Math.min(seconds,4)*.35)}
    if(group.current)group.current.children.forEach((child,i)=>{child.visible=active&&(reduced||seconds>i*.55);child.position.y=1+i*1.6+(reduced?0:Math.max(0,1-(seconds-i*.55))*5)})
  })
  return <><mesh ref={scan} visible={false} rotation={[-Math.PI/2,0,0]} position={[0,.4,0]}><ringGeometry args={[10,10.12,64]}/><meshBasicMaterial color={CITIES[city].palette.accent} transparent opacity={.65} side={THREE.DoubleSide}/></mesh>
  {city==='IdeaHub'&&<group ref={group} position={[0,0,5]}>{Array.from({length:7},(_,i)=><mesh key={i} visible={active} position={[0,1+i*1.6,0]}><boxGeometry args={[3-i*.22,1.3,3-i*.22]}/><meshStandardMaterial color="#91d4bb" emissive="#46b8b0" emissiveIntensity={.18}/></mesh>)}</group>}</>
}
