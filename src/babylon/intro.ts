import '@babylonjs/core/Meshes/instancedMesh';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { RawTexture } from '@babylonjs/core/Materials/Textures/rawTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Scene } from '@babylonjs/core/scene';
import { setOrbitTarget } from './camera';

const vertex = `precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec2 uv;uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 n;varying vec3 p;varying vec2 t;void main(){p=(world*vec4(position,1.)).xyz;n=normalize(mat3(world)*normal);t=uv;gl_Position=worldViewProjection*vec4(position,1.);}`;
const planetFragment = `precision highp float;varying vec3 n;varying vec3 p;varying vec2 t;uniform sampler2D surface;uniform float reveal;void main(){vec4 map=texture2D(surface,t);float day=max(0.,dot(normalize(n),normalize(vec3(-.6,.4,-.8))));vec3 col=map.rgb*(.10+.90*day);col+=vec3(.95,.65,.28)*map.a*(1.-day)*1.5;gl_FragColor=vec4(col*reveal,1.);}`;
const atmosphereFragment = `precision highp float;varying vec3 n;varying vec3 p;uniform vec3 eye;uniform float reveal;void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(eye-p))),4.5);gl_FragColor=vec4(vec3(.20,.53,.73),rim*.24*reveal);}`;
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const hash = (x: number, y: number) => { const n = Math.imul(x + 1, 374761393) ^ Math.imul(y + 9, 668265263); return ((Math.imul(n ^ n >>> 13, 1274126177) ^ n) >>> 0) / 4294967295; };

/** Six authored beats: spark (0–3), world (3–7), orbit (7–11),
 * city approach (11–15), gateway (15–19), identity hold (19–22+).
 * Parent hides existing environment meshes and restores its overview on exit.
 * Architectural city lights are scenery, never representations of activity. */
export function createIntroduction(scene: Scene, camera: ArcRotateCamera): { update: (seconds: number) => void; dispose: () => void } {
  const root = new TransformNode('intro-world', scene);
  const saved = { clear: scene.clearColor.clone(), fog: scene.fogMode, min: camera.lowerRadiusLimit, max: camera.upperRadiusLimit, lowerBeta: camera.lowerBetaLimit, upperBeta: camera.upperBetaLimit };
  scene.clearColor = new Color4(.001, .003, .008, 1); scene.fogMode = Scene.FOGMODE_NONE;
  camera.lowerRadiusLimit = 1; camera.upperRadiusLimit = 500; camera.lowerBetaLimit = .01; camera.upperBetaLimit = Math.PI - .01;
  const reduced = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let disposed = false;
  const width = 512, height = 256, pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width * Math.PI * 2, v = y / height * Math.PI;
    const land = Math.sin(u * 3 + Math.cos(v * 5)) + Math.sin(v * 7 + Math.cos(u * 4)) * .5 + Math.sin(u * 9 - v * 8) * .2;
    const coast = smooth((land - .12) * 5), grain = hash(x, y) * .025;
    const polar = Math.pow(Math.abs(Math.cos(v)), 14);
    const at = (y * width + x) * 4;
    pixels[at] = Math.round(255 * mix(.035 + grain, .19 + grain, coast) + polar * 30);
    pixels[at + 1] = Math.round(255 * mix(.095 + grain, .23 + grain, coast) + polar * 30);
    pixels[at + 2] = Math.round(255 * mix(.16 + grain, .20 + grain, coast) + polar * 30);
    const cluster = Math.sin(u * 29 + v * 17) * Math.cos(v * 31 - u * 7);
    pixels[at + 3] = coast > .5 && cluster > .35 && hash(x, y + 479) > .88 ? 180 : 0;
  }
  const texture = RawTexture.CreateRGBATexture(pixels, width, height, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  texture.name = 'intro-planet-surface';texture.wrapU = Texture.WRAP_ADDRESSMODE;texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  const planetMaterial = new ShaderMaterial('intro-planet-material', scene, { vertexSource: vertex, fragmentSource: planetFragment }, { attributes: ['position', 'normal', 'uv'], uniforms: ['world', 'worldViewProjection', 'reveal'], samplers: ['surface'] });
  planetMaterial.setTexture('surface', texture);planetMaterial.setFloat('reveal', 0);
  const planet = MeshBuilder.CreateSphere('intro-planet', { diameter: 56, segments: 48 }, scene);planet.parent = root;planet.material = planetMaterial;
  const airMaterial = new ShaderMaterial('intro-atmosphere-material', scene, { vertexSource: vertex, fragmentSource: atmosphereFragment }, { attributes: ['position', 'normal', 'uv'], uniforms: ['world', 'worldViewProjection', 'eye', 'reveal'], needAlphaBlending: true });
  airMaterial.alphaMode = Constants.ALPHA_ADD;airMaterial.disableDepthWrite = true;airMaterial.backFaceCulling = false;
  const air = MeshBuilder.CreateSphere('intro-atmosphere', { diameter: 57.2, segments: 40 }, scene);air.parent = root;air.material = airMaterial;
  const stone = new StandardMaterial('intro-civic-stone', scene);stone.diffuseColor = new Color3(.15,.22,.27);stone.emissiveColor = new Color3(.055,.085,.10);stone.specularColor = new Color3(.2,.23,.25);
  const gold = new StandardMaterial('intro-gateway-gold', scene);gold.disableLighting = true;gold.emissiveColor = Color3.FromHexString('#e2b877');
  const teal = new StandardMaterial('intro-gateway-teal', scene);teal.disableLighting = true;teal.emissiveColor = Color3.FromHexString('#7fd6c6');
  const point = MeshBuilder.CreateSphere('intro-first-light', { diameter: .35, segments: 12 }, scene);point.parent=root;point.material=gold;
  const cityRoot = new TransformNode('intro-surface-cities', scene);cityRoot.parent=root;
  const towers: Mesh[] = [];
  // A distant miniature city contour across the visible planet hemisphere.
  for (let i=0;i<88;i++) {
    const az = -Math.PI / 2 + (hash(i,3)-.5)*1.8, lat=(hash(i,7)-.5)*.75;
    const radial=new Vector3(Math.cos(az)*Math.cos(lat),Math.sin(lat),Math.sin(az)*Math.cos(lat));
    const h=.18+hash(i,11)*1.1;
    const tower=MeshBuilder.CreateBox(`intro-civic-${i}`,{width:.15+hash(i,2)*.24,height:h,depth:.24},scene);
    tower.position=radial.scale(28+h/2);tower.setDirection(radial);tower.rotate(Vector3.Right(),Math.PI/2);tower.parent=cityRoot;tower.material=i%7===0?teal:stone;towers.push(tower);
  }
  // Merge the static city silhouette to three material groups after placement.
  for(const material of [stone,gold,teal]) {
    const parts=towers.filter(mesh=>mesh.material===material);if(!parts.length)continue;
    const merged=Mesh.MergeMeshes(parts,true,true,undefined,false,false);if(merged){merged.parent=cityRoot;merged.material=material;}
  }
  const gate = new TransformNode('intro-gateway',scene);gate.parent=root;gate.position.z=-44;
  const arcPoints:Vector3[]=[];
  for(let i=0;i<=80;i++){const angle=.55+i/80*(Math.PI*2-1.1);arcPoints.push(new Vector3(Math.sin(angle)*8.2,Math.cos(angle)*8.2,0));}
  const arc=MeshBuilder.CreateTube('intro-gateway-arc',{path:arcPoints,radius:.6,tessellation:12,cap:Mesh.CAP_ALL},scene);arc.parent=gate;arc.material=gold;
  const power=MeshBuilder.CreateBox('intro-gateway-power',{width:1.2,height:6,depth:1.1},scene);power.position.y=7.5;power.parent=gate;power.material=teal;
  const wing=MeshBuilder.CreateCylinder('intro-gateway-arrow',{diameterTop:0,diameterBottom:4,height:3,tessellation:3},scene);wing.rotation.z=-Math.PI/2;wing.position.set(2,8,0);wing.parent=gate;wing.material=teal;
  const plinth=MeshBuilder.CreateBox('intro-gateway-plinth',{width:20,height:1,depth:6},scene);plinth.position.y=-10;plinth.parent=gate;plinth.material=stone;
  const update = (seconds:number) => {
    if(disposed)return;
    const time=reduced?.matches?22:Math.max(0,Number.isFinite(seconds)?seconds:0);
    const reveal=smooth((time-2.5)/4), approach=smooth((time-7)/8), gateway=smooth((time-14)/5);
    point.setEnabled(time<6);point.scaling.setAll(mix(.08,3,smooth(time/3))*(1-smooth((time-3)/3)));
    planet.setEnabled(time>=2.5);air.setEnabled(time>=3);cityRoot.setEnabled(time>=8);
    planetMaterial.setFloat('reveal',reveal);airMaterial.setFloat('reveal',reveal);
    gate.setEnabled(time>=14);gate.scaling.setAll(mix(.001,1,gateway));
    camera.alpha=mix(-1.78,-Math.PI/2,smooth(time/18));camera.beta=mix(1.31,Math.PI/2,gateway);
    camera.radius=mix(mix(180,86,approach),36,gateway);
    setOrbitTarget(camera,new Vector3(0,mix(0,1,gateway),mix(0,-43,gateway)));
    airMaterial.setVector3('eye',camera.position);
  };
  update(0);
  return {update,dispose:()=>{
    if(disposed)return;disposed=true;root.dispose(false,false);texture.dispose();
    for(const material of [planetMaterial,airMaterial,stone,gold,teal])material.dispose(false,false);
    scene.clearColor=saved.clear;scene.fogMode=saved.fog;
    camera.lowerRadiusLimit=saved.min;camera.upperRadiusLimit=saved.max;camera.lowerBetaLimit=saved.lowerBeta;camera.upperBetaLimit=saved.upperBeta;
  }};
}
