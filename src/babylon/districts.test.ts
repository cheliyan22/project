import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CITY_IDS, type Quality } from './profiles';
import { groundHeight } from './terrain';
import { buildDistricts, DISTRICT_COUNTS, planDistricts } from './districts';

describe('deterministic district planning',()=>{
 for(const city of CITY_IDS)it(`${city} preserves landmarks and project corridor across all density tiers`,()=>{
  const ultra=planDistricts(city,'ultra' as Quality);
  expect(ultra).toHaveLength(1200);
  const compositions=new Set(ultra.map(p=>`${p.family}:${p.variant}:${p.crown}:${p.annex}`));
  expect(compositions.size).toBeGreaterThanOrEqual(90);
  expect(new Set(ultra.map(p=>p.width.toFixed(4)+':'+p.depth.toFixed(4))).size).toBeGreaterThan(1100);
  for(const lot of ultra){expect(lot.width).toBeGreaterThanOrEqual(.65);expect(lot.width).toBeLessThan(.95);expect(lot.depth).toBeGreaterThanOrEqual(.65);expect(lot.depth).toBeLessThan(.95);}

  for(const quality of ['low','medium','high','ultra'] as Quality[]){
   const plan=planDistricts(city,quality);
   expect(plan).toHaveLength(DISTRICT_COUNTS[quality]);
   expect(plan).toEqual(ultra.slice(0,DISTRICT_COUNTS[quality]));
   expect(plan).toEqual(planDistricts(city,quality));
   expect(new Set(plan.map(p=>p.family)).size).toBe(3);
  }
  const cells=new Set<string>();
  for(const p of ultra){
   expect(Math.hypot(p.x,p.z)).toBeGreaterThan(155);
   expect(Math.hypot(p.x,p.z)).toBeLessThanOrEqual(345);
   expect(p.z>135&&Math.abs(p.x)<58).toBe(false);
   expect(p.y).toBe(groundHeight(city,p.x,p.z));
   expect([p.x,p.y,p.z,p.height,p.yaw].every(Number.isFinite)).toBe(true);
   const cell=`${Math.round(p.x/13.2)}:${Math.round(p.z/13.2)}`;
   expect(cells.has(cell)).toBe(false);cells.add(cell);
  }
 });
});

describe('thin-instanced district rendering',()=>{
 it('builds all eleven bounded, distinct cities and switches LOD without double rendering',()=>{
  const engine=new NullEngine();const signatures=new Set<string>();
  try{for(const city of CITY_IDS){
   const scene=new Scene(engine);
   const d=buildDistricts(scene,city,'low');
   expect(d.structureCount).toBe(120);
   const sources=d.meshes.filter(m=>m.name.includes('-family-'));
   expect(sources).toHaveLength(18);
   expect(new Set(sources.filter(m=>m.name.endsWith('-near')).map(m=>JSON.stringify([m.getTotalVertices(),Array.from(m.getVerticesData('position')!).reduce((a,b)=>a+b,0)]))).size).toBe(9);
   const signature=sources.map(m=>[m.getTotalVertices(),Array.from(m.getVerticesData('position')!).reduce((sum,n)=>sum+n,0)]);
   signatures.add(JSON.stringify(signature));
   for(const m of sources)expect(Array.from(m.getVerticesData('position')!).every(Number.isFinite)).toBe(true);
   const chunks=d.meshes.filter(m=>m.metadata?.district) as Mesh[];
   expect(chunks.reduce((sum,m)=>sum+m.thinInstanceCount,0)).toBe(240);
   // Inspect the actual GPU-bound attributes, not merely the CPU instance list.
   // Shared geometry must not let a later chunk replace an earlier one's matrix buffer.
   expect(new Set(chunks.map(m=>m.geometry)).size).toBe(chunks.length);
   const attachments=d.meshes.filter(m=>m.metadata?.districtAttachment) as Mesh[];
   expect(attachments).toHaveLength(7);
   expect(attachments.reduce((sum,m)=>sum+m.thinInstanceCount,0)).toBe(240);
   for(const mesh of [...chunks,...attachments]){
    const gpu=mesh.getVertexBuffer('world0')!.getData()!;
    if(!(gpu instanceof Float32Array))throw new Error('Instance matrix GPU buffer must contain Float32 values');
    const cpu=mesh.thinInstanceGetWorldMatrices();
    expect(gpu.length).toBe(cpu.length*16);
    let minRadius=Infinity,maxRadius=0,minHeight=Infinity,maxHeight=-Infinity;
    for(let i=0;i<cpu.length;i++){
     expect(Array.from(gpu.slice(i*16,i*16+16))).toEqual(Array.from(cpu[i].asArray()));
     const matrix=Matrix.FromArray(gpu,i*16),positions=mesh.getVerticesData('position')!;
     for(let p=0;p<positions.length;p+=3){
      const world=Vector3.TransformCoordinates(new Vector3(positions[p],positions[p+1],positions[p+2]),matrix);
      const radius=Math.hypot(world.x,world.z);
      minRadius=Math.min(minRadius,radius);maxRadius=Math.max(maxRadius,radius);
      minHeight=Math.min(minHeight,world.y);maxHeight=Math.max(maxHeight,world.y);
     }
    }
    expect(minRadius).toBeGreaterThan(140);expect(maxRadius).toBeLessThan(365);
    expect(minHeight).toBeGreaterThan(-40);expect(maxHeight).toBeLessThan(130);
   }

   d.update(new Vector3(0,100,1000),10);
   expect(chunks.filter(m=>m.isEnabled()).every(m=>m.name.endsWith('-far'))).toBe(true);
   expect(chunks.filter(m=>m.isEnabled()).reduce((sum,m)=>sum+m.thinInstanceCount,0)).toBe(120);
   d.update(new Vector3(-205,20,-90),20);
   expect(chunks.some(m=>m.isEnabled()&&m.name.endsWith('-near'))).toBe(true);
   expect(chunks.filter(m=>m.isEnabled()).reduce((sum,m)=>sum+m.thinInstanceCount,0)).toBe(120);
   expect(d.meshes.length).toBeLessThan(250);
   d.dispose();d.dispose();expect(scene.meshes).toHaveLength(0);expect(scene.materials).toHaveLength(0);scene.dispose();
  }expect(signatures.size).toBe(11);}finally{engine.dispose();}
 },30000);
 it('holds ultra density to a fixed draw-call and rendered triangle budget',()=>{
  const engine=new NullEngine();
  try{for(const city of CITY_IDS){
   const scene=new Scene(engine),d=buildDistricts(scene,city,'ultra' as Quality);
   expect(d.structureCount).toBe(1200);
   d.update(new Vector3(0,80,0),0);
   const chunks=d.meshes.filter(m=>m.metadata?.district) as Mesh[];
   const active=chunks.filter(m=>m.isEnabled());
   expect(active.reduce((sum,m)=>sum+m.thinInstanceCount,0)).toBe(1200);
   expect(active.length).toBeLessThan(100);
   const attachments=d.meshes.filter(m=>m.metadata?.districtAttachment&&m.isEnabled()) as Mesh[];
   expect(attachments.length).toBeLessThanOrEqual(7);
   expect(attachments.reduce((sum,m)=>sum+m.thinInstanceCount,0)).toBe(2400);
   expect([...active,...attachments].reduce((sum,m)=>sum+m.getTotalIndices()/3*m.thinInstanceCount,0)).toBeLessThan(2_000_000);
   d.dispose();scene.dispose();
  }}finally{engine.dispose();}
 },30000);
});
