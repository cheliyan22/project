import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Scene } from '@babylonjs/core/scene';
import { PROFILES, randomSource, seedOf, type CityId, type Quality } from './profiles';
import { groundHeight } from './terrain';

type V = [number, number, number];
export const DISTRICT_COUNTS: Record<string, number> = { low:120, medium:300, high:600, ultra:1200 };
export interface DistrictLot { x:number; y:number; z:number; family:number; variant:number; width:number; depth:number; crown:number; annex:number; height:number; yaw:number; chunk:string }
const TAU=Math.PI*2;
/** Quality levels are prefixes of one plan: increasing quality expands actual
 * districts instead of reshuffling the structures already visible. */
export function planDistricts(city:CityId,quality:Quality):DistrictLot[] {
 const rng=randomSource(seedOf(`districts-v1-${city}`));
 const anchors=[[-205,-90],[200,-105],[0,-260]];
 const candidates:{lot:DistrictLot; rank:number}[]=[];
 for(let gx=-25;gx<=25;gx++)for(let gz=-25;gz<=25;gz++){
  const x=gx*13.2+(rng()-.5)*2,z=gz*13.2+(rng()-.5)*2,r=Math.hypot(x,z);
  if(r<156||r>345||(z>135&&Math.abs(x)<58))continue;
  const distances=anchors.map(([ax,az])=>Math.hypot(x-ax,z-az));
  const family=distances.indexOf(Math.min(...distances));
  const height=(z>80?10:16)+rng()*(z>80?9:27);
  const moduleRandom=randomSource(seedOf(`modules:${city}:${gx}:${gz}`));
  const width=.65+moduleRandom()*.3,depth=.65+moduleRandom()*.3,crown=Math.floor(moduleRandom()*3),annex=Math.floor(moduleRandom()*4);
  candidates.push({lot:{x,y:groundHeight(city,x,z),z,family,width,depth,crown,annex,variant:seedOf(`${city}:${Math.floor(x/80)}:${Math.floor(z/80)}`)%3,height,yaw:city==='robotics'||city==='education'?0:Math.atan2(x,z)*.3,chunk:`${Math.floor(x/80)}:${Math.floor(z/80)}:${family}`},rank:distances[family]+rng()*4});
 }
 candidates.sort((a,b)=>a.rank-b.rank||a.lot.x-b.lot.x||a.lot.z-b.lot.z);
 const count=DISTRICT_COUNTS[quality]??DISTRICT_COUNTS.high;
 if(candidates.length<count)throw new Error('District capacity is smaller than requested density');
 return candidates.slice(0,count).map(({lot})=>lot);
}

export function buildDistricts(scene:Scene,city:CityId,quality:Quality):{meshes:AbstractMesh[];structureCount:number;update:(cameraPosition:Vector3,time:number)=>void;dispose:()=>void}{
 const lots=planDistricts(city,quality),owned:Mesh[]=[],sources:Mesh[]=[];
 const palette=[Color3.FromHexString(PROFILES[city].horizon).scale(.78),Color3.FromHexString('#17313b'),Color3.FromHexString(PROFILES[city].accent).scale(.72),Color3.FromHexString('#678879')];
 const material=new PBRMaterial(`${city}-district-physical`,scene);material.albedoColor=Color3.White();material.metallic=.28;material.roughness=.6;material.backFaceCulling=false;
 const makeTemplate=(family:number,variant:number,detailed:boolean,module?:{kind:'crown'|'annex';form:number})=>{
  const parts:Mesh[]=[];let serial=0;
  const paint=(m:Mesh,color:number,p:V=[0,0,0],r:V=[0,0,0])=>{
   m.position.set(...p);m.rotation.set(...r);const c=palette[color],colors:number[]=[];
   for(let i=0;i<m.getTotalVertices();i++)colors.push(c.r,c.g,c.b,1);
   m.setVerticesData('color',colors);m.material=material;parts.push(m);return m;
  };
  const box=(p:V,s:V,c=0,r?:V)=>paint(MeshBuilder.CreateBox(`district-part-${serial++}`,{width:s[0],height:s[1],depth:s[2]},scene),c,p,r);
  const beam=(a:V,b:V,w=.22,c=2)=>{const start=new Vector3(...a),end=new Vector3(...b),d=end.subtract(start);const m=box(start.add(end).scale(.5).asArray() as V,[w,d.length(),w],c);m.rotationQuaternion=Quaternion.FromUnitVectorsToRef(Vector3.Up(),d.normalize(),new Quaternion());return m;};
  const tube=(points:V[],radius:number,c=0)=>paint(MeshBuilder.CreateTube(`district-tube-${serial++}`,{path:points.map(p=>new Vector3(...p)),radius,tessellation:detailed?6:4,cap:Mesh.CAP_ALL},scene),c);
  const roof=(width:number,length:number,spring:number,rise:number,c=0)=>{
   const steps=detailed?12:6;
   const paths=[-length/2,length/2].map(z=>Array.from({length:steps+1},(_,i)=>new Vector3(Math.cos(i*Math.PI/steps)*width/2,spring+Math.sin(i*Math.PI/steps)*rise,z)));
   paint(MeshBuilder.CreateRibbon(`district-vault-${serial++}`,{pathArray:paths},scene),c);
   if(detailed)for(let z=-length/2;z<=length/2;z+=3)tube(Array.from({length:9},(_,i)=>[Math.cos(i*Math.PI/8)*width/2,spring+Math.sin(i*Math.PI/8)*rise,z] as V),.12,2);
  };
  const leaf=(p:V,width:number,height:number,yaw:number,c=0)=>{
   const paths=[-1,0,1].map(v=>Array.from({length:detailed?13:7},(_,i)=>{const u=i/(detailed?12:6);return new Vector3(Math.sin(u*Math.PI)*width*v,u*height,Math.sin(u*Math.PI)*width*.7+v*v*.3);}));
   return paint(MeshBuilder.CreateRibbon(`district-leaf-${serial++}`,{pathArray:paths},scene),c,p,[0,yaw,0]);
  };
  const ring=(p:V,radius:number,c=2)=>{const count=detailed?20:12;tube(Array.from({length:count+1},(_,i)=>[p[0]+Math.cos(i*TAU/count)*radius,p[1]+Math.sin(i*TAU/count)*radius,p[2]] as V),.18,c);};
  const windows=(width:number,height:number,depth:number)=>{
   if(!detailed)return;
   for(let y=2;y<height;y+=3)for(const side of [-1,1]){
    box([0,y,side*(depth/2+.02)],[width-.5,.75,.08],1);
    for(let x=-width/2+.6;x<width/2;x+=2)box([x,y,side*(depth/2+.1)],[.12,1.4,.12],2);
   }
  };
  // The reference height is 20. Individual modules occupy <=11-unit lots;
  // broad structures stretch longitudinally, with lanes between every row.
  if(!module){
  if(city==='ai'){
   const tiers=family===0?5:family===1?3:7;
   for(let i=0;i<tiers;i++){
    const y=2+i*18/tiers,w=family===1?8:7-i*.35;
    box([Math.sin(i*family)*.7,y,0],[w,18/tiers-.5,6],1,[0,family===2?i*.12:0,0]);
    box([0,y+18/tiers*.45,0],[w+.6,.25,6.5],2);
   }
   for(const side of [-1,1])beam([side*4,0,0],[side*2,22,0],.3,0);
   windows(7,19,6);
   if(family===1)ring([0,22,0],3);
  }else if(city==='gaming'){
   const islands=family+1;
   for(let i=0;i<islands;i++){
    const y=5+i*6,x=Math.sin(i*2)*2;
    paint(MeshBuilder.CreateCylinder(`play-island-${i}`,{diameterTop:10-i,height:4,diameterBottom:.3,tessellation:family===1?3:4},scene),i%2?2:0,[x,y,0],[0,i*.4,0]);
    box([x,y+2.2,0],[6,.3,5],1);
    if(detailed)for(let k=0;k<3;k++)box([x-2+k*2,y+3+k,0],[1.4,.4,2],2);
   }
   if(family===2)ring([0,20,0],4);else beam([0,0,0],[0,5,0],.3);
  }else if(city==='education'){
   const width=family===1?9:7,length=family===2?12:10;
   roof(width,length,5,family===0?4:7);
   for(const side of [-1,1])box([side*(width/2-.3),2.5,0],[.6,5,length],0);
   if(family===1)for(let i=0;i<3;i++)box([0,1+i*1.4,5-i],[10-i*2,.5,3],2);
   if(family===2){beam([-4,0,0],[-4,20,0],.8,0);for(let y=6;y<20;y+=4)box([-4,y,0],[3,.3,3],2);}
   windows(width,5,length);
  }else if(city==='health'){
   const arms=family+2;
   for(let i=0;i<arms;i++){
    const a=i*TAU/arms,dx=Math.cos(a),dz=Math.sin(a);
    tube([[0,0,0],[dx*1.5,6,dz*1.5],[dx*3,10+family*2,dz*3]],.5,0);
    const m=leaf([dx*2,8+family*2,dz*2],2.5,7,-a,i%2?3:0);m.rotation.x=-.8;
   }
   if(family===2)leaf([0,0,0],3,22,0,0);
  }else if(city==='creative'){
   for(let i=0;i<family+2;i++){
    const m=leaf([Math.cos(i*2)*2,0,Math.sin(i*2)*2],4,12+i*4,i*2+family, i%2?2:0);
    m.rotation.z=(i%2?1:-1)*.3;
   }
   if(family===1)box([0,9,0],[9,.5,5],1,[0,.5,.3]);
   if(family===2){ring([0,14,0],4);beam([-4,0,0],[4,16,0],.3);}
  }else if(city==='revival'){
   const height=15+family*4;
   for(const x of [-4,4])for(const z of [-3,3])beam([x,0,z],[x,height,z],.3);
   for(let y=0;y<height-4;y+=4){box([0,y,0],[8,.25,6],0);if(detailed)for(const z of [-3,3])beam([-4,y,z],[4,y+4,z],.12);}
   box([-3,4,0],[1,8,5],1);
   if(family!==1){beam([-6,height,0],[7,height,0],.4);beam([5,height,0],[5,7,0],.08);}
  }else if(city==='graveyard'){
   for(let i=0;i<family+3;i++){
    const h=7+((i*7+family*3)%13);
    box([-4+i*2,h/2,0],[1.2,h,5],i%2?1:0,[.05,0,(i-2)*.07]);
    if(detailed&&i%2)box([-3+i*2,1,4],[4,1,2],1,[.1,i,.3]);
   }
   if(family===1)roof(8,7,8,6,1);
  }else if(city==='success'){
   for(const side of [-1,1]){
    box([side*2.5,10,0],[.7,20+family*3,6],0,[0,0,-side*.07]);
    box([side*1.9,9,0],[.35,17,5],1,[0,0,-side*.07]);
    if(detailed)box([side*3,10,0],[.15,22,6],2,[0,0,-side*.07]);
   }
   for(let y=8;y<20;y+=5)beam([-2.5,y,0],[2.5,y,0],.4,2);
   if(family===1)roof(8,6,0,5);if(family===2)ring([0,23,0],3);
  }else if(city==='space'){
   const length=family===1?11:8;
   paint(MeshBuilder.CreateCylinder('pressure-vessel',{diameter:5,height:length,tessellation:detailed?12:6},scene),0,[0,6,0],[Math.PI/2,0,0]);
   for(const side of [-1,1]){beam([side*2,0,-3],[side*2,6,-3],.3);beam([side*2,0,3],[side*2,6,3],.3);box([side*4,7,0],[3,.2,10],1,[0,0,side*.2]);}
   if(detailed)for(let z=-length/2+1;z<length/2;z+=3)ring([0,6,z],2.6,2);
   if(family!==0){ring([0,12,0],family===1?4:5,0);beam([0,6,0],[0,17,0],.2);}
  }else if(city==='robotics'){
   box([0,4,0],[9,8,10],1);
   for(let z=-4;z<=4;z+=4){beam([-5,0,z],[-5,12,z],.4);beam([-5,12,z],[0,18,z],.4);beam([0,18,z],[5,10,z],.4);}
   for(let i=0;i<3;i++)box([-3+i*3,11,0],[2.8,.35,10],2,[0,0,.35]);
   if(family===1){beam([4,0,0],[4,24,0],.9,0);ring([4,22,0],2);}
   if(family===2){beam([-6,20,0],[6,20,0],.6);beam([4,20,0],[4,5,0],.12);}
   windows(9,8,10);
  }else{
   const h=family===2?8:5;
   for(const side of [-1,1]){
    box([side*3.3,h/2,0],[2.7,h,9],0);
    box([0,h/2,side*3.4],[4,h,2.2],family===1?2:0);
    box([side*3.3,h+.2,0],[3,.35,9.5],2,[0,0,side*.15]);
   }
   if(family===1)roof(7,3,h,4,2);
   if(detailed){box([0,2,4.6],[1.8,4,.1],1);for(const side of [-1,1])for(let z=-3;z<=3;z+=3)box([side*4.7,h*.55,z],[.1,1.5,1.2],1);}
  }
  // Three structural variants per family vary actual massing, cantilevers and
  // negative space, with a stable choice for each coherent neighbourhood chunk.
  if(variant>0){
   if(city==='ai'){
    box([variant===1?3:-3,12,0],[4,5,8],1,[0,variant*.3,0]);
    for(const side of [-1,1])beam([side*4,7,0],[side*4,18,0],.28,2);
    box([0,18,0],[10,.5,4],0);
   }else if(city==='gaming'){
    if(variant===1)ring([0,13,0],5,2);
    else for(let step=0;step<5;step++)box([-4+step*2,3+step*2,4],[1.7,.4,2],2);
   }else if(city==='education'){
    if(variant===1){box([0,3,5],[9,.5,3],2);for(const x of [-4,-2,0,2,4])beam([x,0,5],[x,6,5],.28,0);}
    else {for(let i=0;i<4;i++)box([4,3+i*3,0],[2.5,.4,8],2);beam([4,0,0],[4,17,0],.5,0);}
   }else if(city==='health'){
    const wing=leaf([variant===1?3:-3,6,0],3,11,variant,3);wing.rotation.z=variant===1?-.45:.45;
    tube([[0,0,0],[variant===1?3:-3,6,0],[variant===1?5:-5,11,0]],.35,0);
   }else if(city==='creative'){
    const fold=leaf([variant===1?-3:3,0,0],4,18,variant*1.2,2);fold.rotation.z=variant===1?.45:-.45;
    if(variant===2)box([0,12,0],[9,.4,3],1,[0,.5,.25]);
   }else if(city==='revival'){
    const h=variant===1?13:23;
    beam([-5,0,4],[-5,h,4],.3);beam([5,0,4],[5,h,4],.3);beam([-6,h,4],[6,h,4],.4);
    if(variant===2)box([2,8,-3],[5,12,.5],0);
   }else if(city==='graveyard'){
    if(variant===1)box([0,3,4],[9,1,3],0,[0,.3,.35]);
    else {beam([-5,0,0],[-4,18,0],.8,1);beam([-4,18,0],[2,22,0],.6,0);}
   }else if(city==='success'){
    if(variant===1)box([0,12,-3],[.7,25,4],2,[0,0,.14]);
    else {box([-4,9,0],[.8,18,4],0,[0,0,-.1]);box([4,9,0],[.8,18,4],0,[0,0,.1]);beam([-4,16,0],[4,16,0],.4);}
   }else if(city==='space'){
    if(variant===1){paint(MeshBuilder.CreateCylinder('annex-vessel',{diameter:3,height:10,tessellation:detailed?12:6},scene),0,[0,10,0],[0,0,Math.PI/2]);}
    else {ring([0,18,0],4,0);beam([0,6,0],[0,22,0],.2);}
   }else if(city==='robotics'){
    if(variant===1){beam([-4,10,0],[-2,18,0],.7);beam([-2,18,0],[4,15,0],.5);}
    else {box([0,3,5],[10,.5,2],1);for(let x=-4;x<=4;x+=2)box([x,3.4,5],[.5,.3,2.4],2);}
   }else{
    if(variant===1){roof(6,4,5,3,2);for(const x of [-3,3])beam([x,0,4],[x,5,4],.25);}
    else {box([0,8,-3],[4,.4,4],3);beam([-2,0,-3],[-2,8,-3],.3);beam([2,0,-3],[2,8,-3],.3);}
   }
  }
  }else if(module.kind==='crown'){
   const f=module.form;
   if(city==='ai'){
    if(f===0){for(const x of [-2,2])beam([x,0,0],[x,5,0],.3);beam([-2,5,0],[2,5,0],.4);}
    else if(f===1)ring([0,3,0],2.8);
    else {for(let i=0;i<3;i++)box([i-1,1+i*1.7,0],[3-i*.6,.6,3],2);}
   }else if(city==='gaming'){
    if(f===0){ring([0,3,0],3);box([0,0,0],[6,.4,3],2);}
    else if(f===1)for(let i=0;i<4;i++)box([-3+i*2,i+1,0],[1.5,.5,2],2);
    else paint(MeshBuilder.CreateCylinder('play-crown',{height:5,diameterTop:5,diameterBottom:.5,tessellation:3},scene),2,[0,2.5,0]);
   }else if(city==='education'){
    if(f===0)roof(6,4,0,4,2);
    else if(f===1)for(let i=0;i<4;i++){const m=leaf([i-1.5,0,0],1,5+i%2,0,2);m.rotation.z=(i-1.5)*.15;}
    else {for(const x of [-2,0,2])beam([x,0,0],[x,5,0],.3,0);box([0,5,0],[5,.3,3],2);}
   }else if(city==='health'||city==='creative'){
    for(let i=0;i<f+2;i++){const a=i*TAU/(f+2);const m=leaf([Math.cos(a),0,Math.sin(a)],2,5+f,a,city==='health'?3:2);m.rotation.z=city==='health'?.5:(i%2?-.4:.4);}
   }else if(city==='revival'){
    const h=3+f;for(const side of [-1,1])beam([side*2,0,0],[side*2,h,0],.2);
    beam([-3,h,0],[3,h,0],.3);beam([f-1,h,0],[f-1,0,0],.06);
   }else if(city==='graveyard'){
    for(let i=0;i<f+2;i++)box([i*1.4-2,1+i*.5,0],[.8,3+i,2],i%2,[.1,0,(i-1)*.3]);
   }else if(city==='success'){
    for(let i=0;i<f+2;i++)box([(i-(f+1)/2)*1.4,2.5,0],[.4,5+i,3],i%2?2:0,[0,0,(i-(f+1)/2)*.12]);
   }else if(city==='space'){
    if(f===0)ring([0,2.5,0],2.5,0);
    else if(f===1){beam([-3,3,0],[3,3,0],.2);beam([0,0,0],[0,5,0],.2);for(const x of [-2,2])box([x,3,0],[2,.15,4],1);}
    else {paint(MeshBuilder.CreateCylinder('docking-collar',{diameter:3,height:4,tessellation:8},scene),0,[0,2,0]);ring([0,4,0],2);}
   }else if(city==='robotics'){
    for(let i=0;i<f+1;i++){box([i*1.5-1,3,0],[.8,6,1],2);box([i*1.5-1,5.5,0],[1.2,.3,1.4],0);}
   }else{
    if(f===0){roof(5,4,0,2,2);for(const x of [-2,2])beam([x,-2,0],[x,1,0],.2);}
    else if(f===1){box([0,0,0],[5,.4,4],3);for(const x of [-2,2])beam([x,0,0],[x,3,0],.15);box([0,3,0],[5,.2,3],2);}
    else {for(let i=0;i<4;i++)box([-2+i*1.3,1,0],[.25,2,4],2);box([0,2,0],[5,.2,4],2);}
   }
  }else{
   const positions:V[]=module.form===0?[[-3.7,0,0]]:module.form===1?[[3.7,0,0]]:module.form===2?[[0,0,-3.7]]:[[-2.8,0,-2.8],[2.8,0,2.8]];
   for(const [x,,z]of positions){
    if(city==='health'||city==='creative'){
     tube([[x,0,z],[x*.7,4,z*.7],[x,8,z]],.25,0);const m=leaf([x,5,z],1.8,6,Math.atan2(x,z),city==='health'?3:2);m.rotation.z=.45;
    }else if(city==='space'){
     paint(MeshBuilder.CreateCylinder('habitat-wing',{diameter:2.1,height:6,tessellation:6},scene),0,[x,4,z],[Math.PI/2,0,0]);beam([x,0,z],[x,4,z],.25);
    }else if(city==='education'){
     box([x,2,z],[2,4,5],0);for(let i=0;i<3;i++)box([x,3+i*1.2,z],[2.5,.2,5.5],2);
    }else if(city==='gaming'){
     paint(MeshBuilder.CreateCylinder('play-annex',{height:3,diameterTop:4,diameterBottom:.4,tessellation:4},scene),2,[x,6,z]);beam([x,0,z],[x,4,z],.15);
    }else if(city==='revival'||city==='robotics'){
     beam([x,0,z-2],[x,10,z-2],.25);beam([x,0,z+2],[x,10,z+2],.25);beam([x,10,z-2],[x,10,z+2],.35);beam([x,1,z-2],[x,9,z+2],.12);
    }else if(city==='graveyard'){
     box([x,3,z],[1.2,7,3],0,[.2,0,.3]);box([x,1,z+1],[2,.6,4],1,[0,.3,.2]);
    }else if(city==='success'){
     box([x,7,z],[.5,14,3],0,[0,0,x*.025]);beam([x,9,z],[0,12,0],.2,2);
    }else if(city==='community'){
     box([x,2,z],[2.6,4,4],0);box([x,4.3,z],[3,.3,4.5],2,[0,0,.18]);box([x,2,z+2.05],[1,1.5,.1],1);
    }else{
     box([x,6,z],[2,9,3],1);for(let y=2;y<11;y+=3)box([x,y,z],[2.3,.25,3.2],2);beam([x,0,z],[x,12,z],.2,0);
    }
   }
  }
  const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,false)!;
  merged.name=module?`${city}-module-${module.kind}-${module.form}`:`${city}-family-${family}-variant-${variant}-${detailed?'near':'far'}`;merged.material=material;merged.useVertexColors=true;merged.isPickable=false;merged.receiveShadows=true;merged.setEnabled(false);sources.push(merged);return merged;
 };
 const templates=Array.from({length:3},(_,family)=>Array.from({length:3},(_,variant)=>({near:makeTemplate(family,variant,true),far:makeTemplate(family,variant,false)})));
 const chunks=new Map<string,DistrictLot[]>();for(const lot of lots){const list=chunks.get(lot.chunk)??[];list.push(lot);chunks.set(lot.chunk,list);}
 const lods:{near:Mesh;far:Mesh;center:Vector3;radius:number}[]=[];
 for(const [key,list]of chunks){
  const matrices=new Float32Array(list.length*16);
  list.forEach((lot,i)=>Matrix.Compose(new Vector3(lot.width,lot.height/20,lot.depth),Quaternion.FromEulerAngles(0,lot.yaw,0),new Vector3(lot.x,lot.y,lot.z)).copyToArray(matrices,i*16));
  const pair=templates[list[0].family][list[0].variant];
  const near=pair.near.clone(`${city}-district-${key}-near`,null,true)!,far=pair.far.clone(`${city}-district-${key}-far`,null,true)!;
  for(const mesh of [near,far]){
   // Thin-instance world0..world3 attributes belong to Geometry. A clone shares
   // Geometry by default; isolate it before binding each chunk's matrices.
   mesh.makeGeometryUnique();
   mesh.thinInstanceSetBuffer('matrix',matrices,16,true);mesh.thinInstanceRefreshBoundingInfo(true);mesh.setEnabled(true);mesh.metadata={district:true,structures:list.length,family:list[0].family,variant:list[0].variant};owned.push(mesh);}
  const center=new Vector3(list.reduce((n,p)=>n+p.x,0)/list.length,list.reduce((n,p)=>n+p.y,0)/list.length,list.reduce((n,p)=>n+p.z,0)/list.length);
  lods.push({near,far,center,radius:Math.max(...list.map(l=>Math.hypot(l.x-center.x,l.z-center.z)))});
 }
 // Seven global thin-instance attachment batches compose 3 crowns × 4 wing
 // arrangements with nine structural bases:108 combinations before proportions.
 // They share the physical material; each owns its GPU matrix attributes.
 const attachments:Mesh[]=[];
 const crownHeight:Record<CityId,number>={ai:21,gaming:15,education:11,health:13,creative:17,revival:19,graveyard:11,success:23,space:9,robotics:15,community:5};
 for(const kind of ['crown','annex'] as const)for(let form=0;form<(kind==='crown'?3:4);form++){
  const selected=lots.filter(l=>l[kind]===form);if(!selected.length)continue;
  const source=makeTemplate(0,0,false,{kind,form});
  const mesh=source.clone(`${city}-attachment-${kind}-${form}`,null,true)!;mesh.makeGeometryUnique();
  const matrices=new Float32Array(selected.length*16);
  selected.forEach((lot,i)=>Matrix.Compose(new Vector3(lot.width,lot.height/20,lot.depth),Quaternion.FromEulerAngles(0,lot.yaw,0),new Vector3(lot.x,lot.y+(kind==='crown'?crownHeight[city]*lot.height/20:0),lot.z)).copyToArray(matrices,i*16));
  mesh.thinInstanceSetBuffer('matrix',matrices,16,true);mesh.thinInstanceRefreshBoundingInfo(true);mesh.setEnabled(true);mesh.metadata={districtAttachment:true,kind,form,components:selected.length};owned.push(mesh);attachments.push(mesh);
 }
 // District transit is ambient infrastructure, never fabricated project activity.
 const transit: {mesh:Mesh;start:Vector3;end:Vector3}[]=[];
 if(['ai','gaming','space','robotics','revival','community'].includes(city))for(let i=0;i<3;i++){
  const selected=lots.filter(l=>l.family===i);if(selected.length<2)continue;
  const first=selected[0],last=selected[Math.min(selected.length-1,20)];
  const start=new Vector3(first.x,first.y+9,first.z),end=new Vector3(last.x,last.y+9,last.z);
  const rail=MeshBuilder.CreateTube(`${city}-district-transit-${i}`,{path:[start,end],radius:.45,tessellation:5},scene);rail.material=material;rail.isPickable=false;owned.push(rail);
  const car=MeshBuilder.CreateBox(`${city}-ambient-transit-car-${i}`,{width:1.5,height:1,depth:3},scene);car.material=material;car.isPickable=false;car.metadata={ambientInfrastructure:true};owned.push(car);transit.push({mesh:car,start,end});
 }
 let disposed=false;
 const update=(cameraPosition:Vector3,time:number)=>{
  if(disposed)return;
  const limit=quality==='low'?125:quality==='medium'?190:quality==='ultra'?320:250;
  for(const {near,far,center,radius}of lods){const close=Vector3.Distance(cameraPosition,center)-radius<limit;near.setEnabled(close);far.setEnabled(!close);}
  for(const mesh of attachments)mesh.setEnabled(cameraPosition.length()<1100);
  for(let i=0;i<transit.length;i++){const {mesh,start,end}=transit[i];const t=(Math.sin(time*.09+i*2)+1)/2;Vector3.LerpToRef(start,end,t,mesh.position);}
 };
 update(new Vector3(0,80,285),0);
 return {meshes:[...owned,...sources],structureCount:lots.length,update,dispose:()=>{if(disposed)return;disposed=true;for(const mesh of [...owned,...sources])mesh.dispose();material.dispose();}};
}
