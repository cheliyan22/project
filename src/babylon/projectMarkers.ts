import '@babylonjs/core/Meshes/instancedMesh';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Scene } from '@babylonjs/core/scene';
import type { Project, Snapshot } from '../beta/data';
import { projectSignals } from './pulse';
import {groundHeight} from './terrain';
import type {CityId} from './profiles';
/** Real saved projects share instanced geometry; the architecture itself never invents a community. */
export function buildProjectMarkers(scene:Scene,projects:Project[],snapshot:Snapshot,material:PBRMaterial,city:CityId='ai',startZ=150):AbstractMesh[]{
 const meshes:AbstractMesh[]=[];let building:Mesh|undefined,crown:Mesh|undefined;
 for(const [index,project] of projects.entries()){
  const signals=projectSignals(snapshot,project),x=(index%12-5.5)*7,z=startZ+Math.floor(index/12)*8,height=2+signals.level*1.6,base=Math.max(0,groundHeight(city,x,z)+1.5);
  const marker=building?building.createInstance('project-'+project.id):MeshBuilder.CreateBox('project-'+project.id,{width:2.8,height:1,depth:2.8},scene);
  if(!building){building=marker as Mesh;building.material=material;}
  marker.scaling.y=height;marker.position.set(x,base+height/2,z);marker.metadata={projectId:project.id,status:project.status,evidence:signals.evidence};meshes.push(marker);
  if(signals.support>0){const ring=crown?crown.createInstance('support-'+project.id):MeshBuilder.CreateTorus('support-'+project.id,{diameter:4,thickness:.16,tessellation:16},scene);if(!crown){crown=ring as Mesh;crown.material=material;}ring.position.set(x,base+height+1,z);ring.metadata={projectId:project.id};meshes.push(ring);}
 }
 return meshes;
}
