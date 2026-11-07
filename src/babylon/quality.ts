import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Scene } from '@babylonjs/core/scene';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
/** Reduced effects swaps the expensive physical shader for a lit, opaque surface.
 * Geometry, project identities and camera controls remain available on software GPUs. */
export function applyReducedMaterials(scene:Scene){
 const replacements=new Map<PBRMaterial,StandardMaterial>();
 for(const mesh of scene.meshes){
  const old=mesh.material;if(!(old instanceof PBRMaterial))continue;
  let material=replacements.get(old);
  if(!material){material=new StandardMaterial(old.name+'-reduced',scene);material.diffuseColor=old.albedoColor.clone();material.emissiveColor=old.emissiveColor.clone();material.specularColor=new Color3(.08,.08,.08);material.specularPower=24;material.backFaceCulling=old.backFaceCulling;replacements.set(old,material);}
  mesh.material=material;
 }
 for(const old of replacements.keys())old.dispose();
 scene.environmentTexture?.dispose();scene.environmentTexture=null;
}
