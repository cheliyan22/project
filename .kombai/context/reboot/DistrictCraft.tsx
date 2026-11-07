import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { type CityId } from '../cityRegistry'
import { Architecture, Parts, useEnvironment } from './ScenePrimitives'
import type { Finish } from './SurfaceMaterials'
import type { TowerDNA } from '../cities/cityKit'

export function occupiedCraftPlots(towers: readonly TowerDNA[]) {
  // Reserve enough room for the largest allowed customized height and abandoned-building lean.
  return [-1,1].filter(side=>towers.some(tower=>{
    const clearance=tower.width+Math.max(1,tower.height*.3)
    return Math.abs(tower.pos[0]-side*30)<11+clearance && Math.abs(tower.pos[2]-32)<11+clearance
  }))
}

function arch(a: Architecture, x: number, z: number, radius: number, spring: number, color: string, finish: Finish = 'stone') {
  for (const side of [-1,1]) a.beam([x+side*radius,0,z],[x+side*radius,spring,z],.45,color,false,finish)
  for (let i=0;i<12;i++) {
    const t=i*Math.PI/12,u=(i+1)*Math.PI/12
    a.beam([x+Math.cos(t)*radius,spring+Math.sin(t)*radius,z],[x+Math.cos(u)*radius,spring+Math.sin(u)*radius,z],.45,color,false,finish)
  }
}
function tree(a: Architecture, d: Architecture, x: number, z: number, size: number, low: boolean, autumn = false) {
  a.add('pillar',[x,size*.42,z],[.18,size*.84,.18],'#78644e',undefined,false,'wood')
  for(let i=0;i<(low?3:7);i++) {
    const angle=i*2.4,r=i?size*.24:0
    d.add('orb',[x+Math.cos(angle)*r,size*.82+Math.sin(i)*size*.12,z+Math.sin(angle)*r],[size*.34,size*.28,size*.32],autumn?['#bd8558','#dfb775','#947b50'][i%3]:['#54866a','#82a36d','#abc183'][i%3],undefined,false,'foliage')
  }
}
function windowFrame(d: Architecture,x:number,y:number,z:number,w:number,h:number,trim:string,warm=false) {
  d.box([x,y,z],[w,h,.1],warm?'#e6bc77':'#345866',undefined,false,'ceramic')
  for(const side of [-1,1]) {
    d.box([x+side*w*.5,y,z+.09],[.12,h+.18,.18],trim,undefined,false,'wood')
    d.box([x,y+side*h*.5,z+.09],[w+.18,.12,.18],trim,undefined,false,'wood')
  }
  d.box([x,y,z+.13],[.09,h,.12],trim,undefined,false,'wood')
}
function home(a:Architecture,d:Architecture,x:number,z:number,color:string,roof:string,low:boolean) {
  // Real doorway: separate piers and lintel leave a passage into the room.
  a.box([x,4.3,z-2.8],[10,8.6,.4],color)
  for(const side of [-1,1]) {
    a.box([x+side*4.8,4.3,z],[.4,8.6,6],color)
    a.box([x+side*3.1,1.7,z+2.8],[3.4,3.4,.4],color)
  }
  a.box([x,6,z+2.8],[10,5.2,.4],color)
  a.box([x,4.1,z],[10,.35,6],color)
  for(const side of [-1,1]) a.box([x+side*2.55,9.4,z],[5.8,.3,7],roof,[0,0,-side*.4],false,'ceramic')
  a.box([x-3,9.4,z-1],[.8,3,.9],'#947b6b')
  for(const y of [2,6]) for(const dx of [-3.2,3.2])windowFrame(d,x+dx,y,z+3.04,1.8,1.8,'#cbb891',true)
  for(const side of [-1,1])d.box([x+side*4.35,5.6,z+3.12],[.5,1.9,.18],roof,undefined,false,'wood')
  a.box([x,4.05,z+4],[5,.3,2],roof,undefined,false,'wood')
  for(let i=0;i<7;i++)a.beam([x-2.4+i*.8,4.1,z+4.8],[x-2.4+i*.8,5.15,z+4.8],.09,'#c9b48e',false,'wood')
  a.beam([x-2.5,5.15,z+4.8],[x+2.5,5.15,z+4.8],.12,'#c9b48e',false,'wood')
  if(!low)for(let i=0;i<7;i++)for(const side of [-1,1])d.box([x+side*2.55,9.59,z-2.7+i*.9],[5.85,.06,.05],'#a7806c',[0,0,-side*.4])
}

/** Additional inhabited places, with collision kept separate from small surface detail. */
export function districtCraft(city:CityId,low=false,occupied:readonly number[]=[]) {
  const solid=new Architecture(),detail=new Architecture(),a=solid,d=detail
  const natural=['Health','Community','Education','Legend'].includes(city)
  for(const side of [-1,1]) {
    a.box([side*31,-.22,32],[18,.4,20],natural?'#9d9e88':'#657481')
    a.box([side*23,-.2,32],[6,.4,4],natural?'#b7b199':'#8593a1')
    for(const z of [23,41])a.box([side*31,.08,z],[18,.2,.3],natural?'#c7bd9e':'#a2afbb')
  }
  switch(city) {
    case 'Community':
      home(a,d,-31,28,'#d2b891','#b57155',low)
      home(a,d,32,27,'#abc2b0','#5e8f86',low)
      for(const x of [-37,-25,25,38])tree(a,d,x,38,5.5,low)
      // Cafe tables, a striped awning and planter boxes around the courtyard.
      for(const x of [-34,-28]) {
        a.add('pillar',[x,1,37],[1.25,.18,1.25],'#bd9871',undefined,false,'wood')
        a.add('pillar',[x,.5,37],[.15,1,.15],'#675b49',undefined,false,'metal')
        for(const dz of [-1.8,1.8])a.box([x,.55,37+dz],[1,.16,1],'#9f8263',undefined,false,'wood')
      }
      for(let i=0;i<8;i++)d.box([28+i,3.5,33],[.98,.16,3.5],i%2?'#eee0bc':'#b67055',[.12,0,0],false,'wood')
      break
    case 'Education':
      for(const x of [-31,31]) {
        for(const z of [25,30,35])arch(a,x,z,5,5,'#c9c1a4')
        a.box([x,8.8,30],[11,.3,12],'#b9aa8d')
        for(const side of [-1,1]) {
          a.box([x+side*4.8,3.5,30],[.3,7,10],'#647e79')
          for(let level=0;level<4;level++) {
            d.box([x+side*4.4,1+level*1.6,30],[.8,.15,9],'#ae9067',undefined,false,'wood')
            for(let j=0;j<(low?6:13);j++)d.box([x+side*4.4,1.5+level*1.6,26+j*(low?1.4:.65)],[.6,.85,.4],['#bbaa7e','#548f8c','#935e62','#7890a5'][j%4],undefined,false,'wood')
          }
        }
        tree(a,d,x+6,38,7,low)
      }
      break
    case 'Legend':
      // A curved amphitheatre and a columned rotunda, each open to the approach.
      for(let row=0;row<5;row++)for(let i=0;i<12;i++) {
        const t=Math.PI*.1+i*Math.PI*.8/11,r=4+row*1.15
        a.box([-31+Math.cos(t)*r,.2+row*.38,30-Math.sin(t)*r],[1.7,.4,1.1],'#d8cbb0',[0,t-Math.PI/2,0])
      }
      for(let i=0;i<8;i++) {
        const t=i*Math.PI/4,x=31+Math.cos(t)*6,z=30+Math.sin(t)*6
        a.add('pillar',[x,4,z],[.48,8,.48],'#e5d8bd');a.add('pillar',[x,8,z],[.8,.4,.8],'#bd9864')
      }
      a.add('pillar',[31,8.5,30],[7,.6,7],'#d7c9aa');a.add('orb',[31,8.8,30],[6,2,6],'#cdb98c',undefined,false,'ceramic')
      for(const x of [-38,38])tree(a,d,x,39,5,low,true)
      break
    case 'Health':
      // Conservatory ribs frame planted beds; the pool receives animated water below.
      for(const z of [25,29,33,37])arch(a,31,z,6,2,'#d1e4cf','metal')
      for(const x of [26,36]) {
        a.box([x,.45,31],[2,.9,13],'#a9bba0')
        for(let i=0;i<5;i++)tree(a,d,x,26+i*2.5,2.6,low)
      }
      a.add('pillar',[-31,.18,32],[7,.4,7],'#b3c8b6')
      for(let i=0;i<10;i++){const t=i*Math.PI/5;d.add('orb',[-31+Math.cos(t)*7,.5,32+Math.sin(t)*7],[.7,.5,.7],'#91af9b')}
      for(const x of [-38,-24])tree(a,d,x,26,6,low)
      break
    case 'AI':
      for(const x of [-31,31]) {
        for(const z of [25,30,35])arch(a,x,z,5,6,'#7ca6b7','metal')
        for(let i=0;i<6;i++) {
          const dx=x+(i%2?3.7:-3.7),z=25+Math.floor(i/2)*5
          a.box([dx,3,z],[1.8,6,2.8],'#304b60',undefined,false,'metal')
          for(let j=0;j<(low?3:6);j++)d.box([dx,1+j*.8,z+1.43],[1.25,.15,.04],j%3?'#74c5d3':'#d8ac6c',undefined,true)
        }
        d.beam([x,.04,38],[x,.04,24],.08,'#8bd9e4',true)
      }
      break
    case 'Gaming':
      for(const side of [-1,1]) {
        for(let i=0;i<5;i++) {
          const x=side*(26+i*2.5),height=2+((i+2)%4)*1.4
          a.box([x,height*.5,25],[2.5,height,4],['#8c6aae','#6c92a0','#c39264'][i%3])
          d.box([x,height+.1,25],[2.6,.2,4.1],'#d6caa2')
        }
        for(let i=0;i<6;i++)a.box([side*31,.2+i*.38,38-i*1.6],[7,.4,1.7],i%2?'#776196':'#b49075')
        for(const dx of [-5,5])a.box([side*31+dx,4.5,32],[1.5,9,1.5],'#8368a7')
        a.box([side*31,9,32],[12,1.5,2],'#dfaa67')
        for(let i=0;i<5;i++)d.box([side*31-4+i*2,9,33.04],[1,.6,.06],i%2?'#e7d7b4':'#a5decd',undefined,true)
      }
      break
    case 'Creator':
      for(const [x,z,angle] of [[-31,27,-.2],[32,28,.23],[-34,36,.1]] as const) {
        for(const side of [-1,1])a.box([x+side*4,4.5,z],[.5,9,1],'#d1b38f',[0,0,angle],false,'metal')
        a.box([x,9,z],[9,.5,1],'#d1b38f',[0,0,angle],false,'metal')
        for(let i=0;i<5;i++)d.box([x-3+i*1.5,4.5+Math.sin(i)*1.2,z],[1.3,5,.2],['#be7b98','#84a5bd','#e0bc7d','#80b6a6','#ab8db7'][i],[0,.3,angle],false,'ceramic')
      }
      for(let i=0;i<7;i++)a.box([29,.2+i*.42,39-i*1.4],[5,.4,1.6],i%2?'#bba4ba':'#6d91a4',[0,i*.025,0])
      break
    case 'Space':
      a.add('pillar',[-31,2,29],[5,4,5],'#a8b4c2',undefined,false,'metal')
      a.add('orb',[-31,4,29],[5,4,5],'#d4d6ce',undefined,false,'ceramic')
      a.box([-31,4.5,32.7],[2,2.5,.4],'#304a67',undefined,false,'metal')
      for(let i=0;i<4;i++) {
        const z=25+i*4
        a.beam([31,0,z],[31,3,z],.35,'#98a9b7',false,'metal')
        for(const side of [-1,1]) {
          a.box([31+side*3.8,3.5,z],[7,.22,3.2],'#263f72',[0,0,side*.22],false,'metal')
          for(let j=0;j<6;j++)d.box([31+side*3.8+(j-2.5),3.66,z],[.035,.03,3.1],'#9aaed1',[0,0,side*.22])
        }
      }
      for(let i=0;i<7;i++)d.add('rock',[-37+i*2,-.1,40],[1.4,.7,1],'#737b92',[i,.2,i])
      break
    case 'Robotics':
    case 'IdeaHub': {
      const revival=city==='IdeaHub',trim=revival?'#ca9a6e':'#d5a366',body=revival?'#77a99b':'#607580'
      for(const x of [-31,31]) {
        for(const z of [24,30,36]) {
          for(const side of [-1,1])a.beam([x+side*6,0,z],[x+side*6,10,z],.5,trim,false,'metal')
          a.beam([x-6,10,z],[x+6,10,z],.5,trim,false,'metal')
          a.beam([x-6,7,z],[x-3,10,z],.25,trim,false,'metal')
          a.beam([x+6,7,z],[x+3,10,z],.25,trim,false,'metal')
        }
        a.box([x,10.5,30],[13,.5,14],body,undefined,false,'metal')
        a.box([x,1.2,30],[5,.6,11],'#42545e',undefined,false,'metal')
        for(let i=0;i<9;i++)a.add('pillar',[x,1.65,25+i*1.25],[.22,5,.22],'#b4bcc0',[0,0,Math.PI/2],false,'metal')
        for(let i=0;i<3;i++)a.box([x,2.4,26+i*3],[1.7,1.2,1.7],revival?'#99baad':'#b59163',undefined,false,'metal')
        for(const side of [-1,1])d.beam([x+side*4,.06,24],[x+side*4,.06,39],.14,trim,true)
      }
      break
    }
    case 'Graveyard':
      for(const x of [-31,31]) {
        for(let i=0;i<5;i++) {
          const dx=x-6+i*3,height=6+(i*7)%9
          a.beam([dx,0,26],[dx+1,height,26],.4,'#777c8c',false,'metal')
          if(i<3)a.beam([dx+1,height,26],[dx+4,height+1,26],.4,'#656675',false,'metal')
          a.box([dx,.4,32+i%2*3],[2.4,.7,4],'#6f6675',[.08,i*.3,.12])
        }
        a.box([x-5,4,33],[.7,8,7],'#555a6c',[0,0,-.18])
        a.box([x+4,2,29],[6,.6,8],'#6c6374',[0,.3,.3])
        for(let i=0;i<5;i++)d.beam([x-5+i,0,33],[x-4+i,5-i*.4,32],.07,'#a78c82',false,'metal')
        for(const dx of [-4,4])d.box([x+dx,1.4,38],[.3,1,.3],'#ca746f',undefined,true)
      }
      break
  }
  // Footpath inlays give scale and guide the player through every new district.
  for(const side of [-1,1])for(let i=0;i<8;i++)d.box([side*(23+i*1.7),.018,32],[.7,.025,2.8],natural?'#d1c5a9':'#9aabb6')
  if(occupied.length) {
    solid.parts=solid.parts.filter(part=>!occupied.includes(Math.sign(part.p[0])))
    detail.parts=detail.parts.filter(part=>!occupied.includes(Math.sign(part.p[0])))
  }
  return {solid,detail}
}

function GardenWater({city}:{city:CityId}) {
  const ref=useRef<THREE.ShaderMaterial>(null),{reduced,lowEffects}=useEnvironment()
  const uniforms=useMemo(()=>({time:{value:0},deep:{value:new THREE.Color(city==='Health'?'#246e74':'#3c797c')},shallow:{value:new THREE.Color('#afd3bc')}}),[city])
  useFrame((_,delta)=>{if(ref.current&&!reduced)ref.current.uniforms.time.value+=Math.min(delta,.1)})
  return <mesh name="garden-water" position={[-31,.405,32]} rotation={[-Math.PI/2,0,0]}>
    <circleGeometry args={[6.5,lowEffects?32:64]}/>
    <shaderMaterial ref={ref} uniforms={uniforms} transparent={false}
      vertexShader="varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }"
      fragmentShader={`varying vec2 vP;uniform float time;uniform vec3 deep;uniform vec3 shallow;
        void main(){float wave=sin(vP.x*3.+time*.6)*sin(vP.y*3.7-time*.4);float ripple=pow(.5+.5*sin(length(vP)*7.-time),18.);
        vec3 color=mix(deep,shallow,.18+wave*.07+ripple*.14);gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`}/>
  </mesh>
}

export function DistrictCraft({city,towers}:{city:CityId;towers:readonly TowerDNA[]}) {
  const {lowEffects}=useEnvironment()
  const occupied=useMemo(()=>occupiedCraftPlots(towers),[towers])
  const craft=useMemo(()=>districtCraft(city,lowEffects,occupied),[city,lowEffects,occupied])
  return <group name={`${city}-crafted-district`}>
    <Parts solid data={craft.solid}/><Parts data={craft.detail}/>
    {city==='Health'&&!occupied.includes(-1)&&<GardenWater city={city}/>}
  </group>
}
