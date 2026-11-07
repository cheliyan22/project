import {describe,it,expect} from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {buildProjectMarkers} from './projectMarkers';
import {buildArchitecture} from './architecture';
import {CITY_IDS,cityFromQuery,randomSource,seedOf} from './profiles';
import {projectsForCity,projectSignals} from './pulse';
import type {Snapshot,Project} from '../beta/data';
const empty:Snapshot={projects:[],revivals:[],progress:[],comments:[],supports:[],history:[],nominations:[],reports:[]};
const project:Project={id:'fixture',title:'Synthetic test fixture',description:'Test only',category:'AI',anonymous:true,founder:'Anonymous founder',status:'abandoned',createdAt:'2026-01-01',updatedAt:'2026-01-01',requirements:'',url:''};
describe('Babylon city generation',()=>{
 for(const quality of ['high','low'] as const)it(`builds all eleven finite, distinct, bounded city geometries in ${quality}`,()=>{
  const engine=new NullEngine({renderWidth:256,renderHeight:256,textureSize:256,deterministicLockstep:false,lockstepMaxSteps:4});const signatures=new Set<string>();
  try{for(const city of CITY_IDS){const scene=new Scene(engine);try{
   const result=buildArchitecture(scene,city,quality);expect(result.meshes.length).toBeGreaterThan(0);expect(result.meshes.length).toBeLessThanOrEqual(8);
   let triangles=0;const signature:number[]=[];
   for(const mesh of result.meshes){const positions=Array.from(mesh.getVerticesData('position')!);expect(positions.every(Number.isFinite)).toBe(true);triangles+=mesh.getTotalIndices()/3;signature.push(positions.length,positions.reduce((sum,x)=>sum+x,0));}
   expect(triangles).toBeLessThan(200_000);signatures.add(JSON.stringify(signature));result.animate?.(10);
  }finally{scene.dispose();}}
  expect(signatures.size).toBe(11);
  }finally{engine.dispose();}
 },30000);
 it('uses repeatable seeds and accepts old city links',()=>{
  const a=randomSource(seedOf('health')),b=randomSource(seedOf('health'));expect(Array.from({length:20},a)).toEqual(Array.from({length:20},b));
  expect(cityFromQuery('Creator')).toBe('creative');expect(cityFromQuery('IdeaHub')).toBe('revival');expect(cityFromQuery('Legend')).toBe('success');expect(cityFromQuery('invalid')).toBe('ai');
 });
});
describe('world activity integrity',()=>{
 it('does not invent projects in any city',()=>{for(const city of CITY_IDS)expect(projectsForCity(empty,city)).toEqual([]);});
 it('moves real project records through lifecycle districts and preserves completed history',()=>{
  const abandoned={...empty,projects:[project]};expect(projectsForCity(abandoned,'graveyard')).toEqual([project]);expect(projectsForCity(abandoned,'ai')).toEqual([project]);expect(projectsForCity(abandoned,'revival')).toEqual([]);
  const reviving={...abandoned,projects:[{...project,status:'under_revival' as const}]};expect(projectsForCity(reviving,'revival')).toHaveLength(1);expect(projectsForCity(reviving,'graveyard')).toHaveLength(0);
  const completed={...abandoned,history:[{id:'history',projectId:project.id,from:'revived' as const,to:'completed' as const,reason:'Real completion',createdAt:'2026-01-02'}]};expect(projectsForCity(completed,'success')).toEqual([project]);
 });
 it('only counts actual unique supporters and saved evidence',()=>{
  expect(projectSignals(empty,project)).toEqual({level:1,support:0,evidence:0});
  const data={...empty,supports:[{projectId:project.id,founder:'A'},{projectId:project.id,founder:'A'},{projectId:'other',founder:'B'}]};expect(projectSignals(data,project).support).toBe(1);
 });
});

it('builds only real markers and scales their geometry with saved lifecycle state',()=>{
 const engine=new NullEngine();const scene=new Scene(engine);const material=new PBRMaterial('test',scene);
 try{
  expect(buildProjectMarkers(scene,[],empty,material)).toEqual([]);
  const completed={...project,id:'completed',status:'completed' as const};
  const meshes=buildProjectMarkers(scene,[project,completed],{...empty,projects:[project,completed],supports:[{projectId:completed.id,founder:'Supporter'}]},material);
  expect(meshes).toHaveLength(3);expect(meshes.every(mesh=>mesh.position.z>=150)).toBe(true);expect(meshes[0].metadata.projectId).toBe(project.id);expect(meshes[1].metadata.projectId).toBe(completed.id);expect(meshes[1].scaling.y).toBeGreaterThan(meshes[0].scaling.y);expect(meshes[2].name).toBe('support-completed');
 }finally{scene.dispose();engine.dispose();}
});
