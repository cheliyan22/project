import {groundHeight} from './terrain';
import '@babylonjs/core/Meshes/instancedMesh';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Constants } from '@babylonjs/core/Engines/constants';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture';
import { Scene } from '@babylonjs/core/scene';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { PROFILES, randomSource, seedOf, type CityId, type Quality } from './profiles';

const skyVertex=`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 vPosition;void main(){vPosition=position;gl_Position=worldViewProjection*vec4(position,1.);}`;
const skyFragment=`precision highp float;varying vec3 vPosition;uniform vec3 zenith;uniform vec3 horizon;uniform vec3 sunColor;uniform float isSpace;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
void main(){vec3 d=normalize(vPosition);float y=max(d.y,0.);vec3 color=mix(horizon,zenith,pow(y,.48));float sun=pow(max(dot(d,normalize(vec3(-.58,.42,-.68))),0.),600.);color+=sunColor*sun*1.8;float haze=pow(max(dot(d,normalize(vec3(-.58,.42,-.68))),0.),8.)*.18;color+=sunColor*haze*(1.-isSpace);float cloud=sin(d.x*18.+sin(d.z*23.))*sin(d.z*19.+sin(d.x*12.));color=mix(color,horizon,clamp(cloud-.12,0.,1.)*.13*smoothstep(.05,.25,y)*(1.-isSpace));if(isSpace>.5){vec3 cell=floor(d*650.);float star=step(.9985,hash(cell))*pow(max(0.,1.-length(fract(d*650.)-.5)*2.),2.);color+=vec3(star);}gl_FragColor=vec4(color,1.);}`;
export function buildEnvironment(scene:Scene,city:CityId,quality:Quality){
 const p=PROFILES[city],random=randomSource(seedOf(city));
 scene.clearColor=Color4.FromColor3(Color3.FromHexString(p.horizon));
 scene.fogMode=Scene.FOGMODE_EXP2;scene.fogDensity=city==='space'?.0003:.0007;scene.fogColor=Color3.FromHexString(p.horizon);
 const hemi=new HemisphericLight('sky-fill',new Vector3(0,1,0),scene);hemi.intensity=.55;hemi.diffuse=Color3.FromHexString(p.horizon);hemi.groundColor=new Color3(.24,.28,.31);
 const sun=new DirectionalLight('sun',new Vector3(.58,-.68,.5),scene);sun.position=new Vector3(-110,170,-120);sun.diffuse=Color3.FromHexString(p.sun);sun.intensity=1.65;
 const rim=new HemisphericLight('architecture-fill',new Vector3(.6,.3,1),scene);rim.intensity=.23;rim.diffuse=new Color3(.65,.8,1);
 const sky=MeshBuilder.CreateSphere('atmosphere',{diameter:1800,segments:32,sideOrientation:Mesh.BACKSIDE},scene);
 const skyMaterial=new ShaderMaterial('art-directed-sky',scene,{vertexSource:skyVertex,fragmentSource:skyFragment},{attributes:['position'],uniforms:['worldViewProjection','zenith','horizon','sunColor','isSpace']});
 skyMaterial.setColor3('zenith',Color3.FromHexString(p.sky));skyMaterial.setColor3('horizon',Color3.FromHexString(p.horizon));skyMaterial.setColor3('sunColor',Color3.FromHexString(p.sun));skyMaterial.setFloat('isSpace',city==='space'?1:0);sky.material=skyMaterial;sky.isPickable=false;sky.infiniteDistance=true;sky.applyFog=false;
 // Local environment map: no CDN or production provider requests. Mipmaps soften rough reflections.
 const faces:Uint8Array[]=[];const size=32;const top=Color3.FromHexString(p.sky),bottom=Color3.FromHexString(p.horizon);
 for(let face=0;face<6;face++){const bytes=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const t=face===2?1:face===3?0:1-y/size;const c=Color3.Lerp(bottom,top,t*.8);const idx=(y*size+x)*4;bytes[idx]=c.r*255;bytes[idx+1]=c.g*255;bytes[idx+2]=c.b*255;bytes[idx+3]=255;}faces.push(bytes);}
 const environment=new RawCubeTexture(scene,faces,size,Constants.TEXTUREFORMAT_RGBA,Constants.TEXTURETYPE_UNSIGNED_BYTE,true,false,Texture.TRILINEAR_SAMPLINGMODE);environment.name='local-sky-reflection';scene.environmentTexture=environment;scene.environmentIntensity=.5;
 const terrain=MeshBuilder.CreateGround('landscape',{width:1500,height:1500,subdivisions:({low:60,medium:90,high:140,ultra:180})[quality],updatable:true},scene);
 const vertices=terrain.getVerticesData('position')!;const normals=terrain.getVerticesData('normal')!;const colors:number[]=[];
 const groundColor=Color3.FromHexString(p.ground);
 for(let i=0;i<vertices.length;i+=3){const h=groundHeight(city,vertices[i],vertices[i+2]);vertices[i+1]=h;const shade=.8+random()*.2+Math.max(0,h)*.002;colors.push(groundColor.r*shade,groundColor.g*shade,groundColor.b*shade,1);}
 VertexData.ComputeNormals(vertices,terrain.getIndices()!,normals);terrain.updateVerticesData('position',vertices);terrain.updateVerticesData('normal',normals);terrain.setVerticesData('color',colors);terrain.refreshBoundingInfo();
 const terrainMat=new PBRMaterial('mineral-ground',scene);terrainMat.albedoColor=Color3.White();terrainMat.metallic=.05;terrainMat.roughness=.96;terrain.material=terrainMat;terrain.receiveShadows=true;terrain.isPickable=false;
 const paving=new PBRMaterial('civic-paving',scene);paving.albedoColor=groundColor.scale(1.2);paving.metallic=.2;paving.roughness=.72;
 if(['ai','robotics','revival'].includes(city)){
  for(const offset of [-56,0,56]){const road=MeshBuilder.CreateBox('infrastructure-spine',{width:230,depth:city==='robotics'?5:3,height:.15},scene);road.position.set(0,-.2,offset);road.material=paving;}
 }else if(city==='education'||city==='success'){
  const road=MeshBuilder.CreateBox('ceremonial-approach',{width:18,depth:250,height:.18},scene);road.position.y=-.2;road.material=paving;
 }else if(city==='community'||city==='health'||city==='creative'){
  const arc=MeshBuilder.CreateTorus('garden-promenade',{diameter:150,thickness:2.4,tessellation:80},scene);arc.position.y=-1.1;arc.scaling.y=.15;arc.material=paving;
 }
 const lamps=new StandardMaterial('wayfinding-light',scene);lamps.diffuseColor=Color3.FromHexString(p.accent);lamps.emissiveColor=lamps.diffuseColor.scale(.55);
 const lightMesh=MeshBuilder.CreateBox('path-inlay',{width:1.4,height:.08,depth:.18},scene);lightMesh.material=lamps;lightMesh.position.set(-110,.02,4.4);lightMesh.isPickable=false;
 for(let i=1;i<45;i++){const instance=lightMesh.createInstance('path-inlay');instance.position.set(-110+i*5,.02,4.4);instance.isPickable=false;}
 if(p.water){
  const water=MeshBuilder.CreateGround('river',{width:680,height:38,subdivisions:1},scene);water.position.set(0,-.4,-123);water.rotation.y=.12;
  const waterMat=new PBRMaterial('river-surface',scene);waterMat.albedoColor=new Color3(.12,.32,.37);waterMat.metallic=.78;waterMat.roughness=.18;water.material=waterMat;water.isPickable=false;
  const quay=MeshBuilder.CreateBox('river-quay',{width:300,height:1,depth:2},scene);quay.position.set(0,-.2,-102);quay.material=paving;quay.rotation.y=.12;
 }
 if(p.vegetation){
  const bark=new StandardMaterial('bark',scene);bark.diffuseColor=new Color3(.29,.25,.2);
  const leaf=new PBRMaterial('foliage',scene);leaf.albedoColor=city==='creative'?new Color3(.55,.32,.4):new Color3(.19,.36,.26);leaf.roughness=.93;leaf.metallic=0;
  const trunk=MeshBuilder.CreateCylinder('tree-trunk',{height:5,diameterTop:.35,diameterBottom:.65,tessellation:6},scene);trunk.material=bark;
  const crown=MeshBuilder.CreateIcoSphere('tree-crown',{radius:3,subdivisions:1},scene);crown.material=leaf;crown.scaling.set(.8,1.45,.8);
  for(let i=0;i<({low:30,medium:60,high:100,ultra:140})[quality];i++){const angle=random()*Math.PI*2,r=110+random()*40,x=Math.cos(angle)*r,z=Math.sin(angle)*r;const h=groundHeight(city,x,z);const a=i?trunk.createInstance('tree-trunk'):trunk;const b=i?crown.createInstance('tree-crown'):crown;a.position.set(x,h+2.5,z);b.position.set(x,h+6,z);b.scaling.set(.7+random()*.6,1+random()*.6,.7+random()*.6);a.isPickable=b.isPickable=false;}
 }
 if(city==='space'){
  const planet=MeshBuilder.CreateSphere('distant-planet',{diameter:230,segments:40},scene);planet.position.set(-290,85,-440);const mat=new StandardMaterial('planet-atmosphere',scene);mat.diffuseColor=new Color3(.3,.48,.67);mat.emissiveColor=new Color3(.03,.06,.12);planet.material=mat;planet.isPickable=false;
  const ring=MeshBuilder.CreateTorus('planet-rings',{diameter:310,thickness:11,tessellation:100},scene);ring.position.copyFrom(planet.position);ring.rotation.z=.35;ring.material=paving;ring.isPickable=false;
 }
 return {sun,sky};
}
