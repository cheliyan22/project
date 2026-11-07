import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import '@babylonjs/core/Culling/ray';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { Scene } from '@babylonjs/core/scene';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { getSnapshot, refresh, subscribe, type Project } from '../beta/data';
import { buildArchitecture } from './architecture';
import { buildEnvironment } from './environment';
import { cityFromQuery, PROFILES, type CityId, type Quality } from './profiles';
import { projectsForCity } from './pulse';
import { buildProjectMarkers } from './projectMarkers';
import { applySurfaceDetail } from './materials';
import { applyReducedMaterials } from './quality';
import WorldOverlay from './WorldOverlay';
import {createRenderer,QUALITY_LEVELS,RendererInitializationError} from './rendering';
import {buildDistricts} from './districts';
import {createIntroduction} from './intro';
import {WorldAudio} from './audio';
import {restoreOverview,setOrbitTarget} from './camera';

type Runtime={scene:Scene;engine:AbstractEngine;camera:ArcRotateCamera;markers:AbstractMesh[];markerMaterial:PBRMaterial;markerStartZ:number};
export default function BabylonWorld(){
 const query=new URLSearchParams(window.location.search);
 const [city,setCity]=useState<CityId>(()=>cityFromQuery(query.get('city')));
 const [quality,setQuality]=useState<Quality>(()=>['low','medium','high','ultra'].includes(query.get('quality')||'')?query.get('quality') as Quality:'medium');
 const [introActive,setIntroActive]=useState(()=>{if(query.has('capture'))return false;try{return localStorage.getItem('reboot-cinematic-intro-v2')!=='seen';}catch{return true;}});
 const [canvasGeneration,setCanvasGeneration]=useState(0);
 const [transitioning,setTransitioning]=useState(false),[audioEnabled,setAudioEnabled]=useState(false),[volume,setVolume]=useState(.35);
 const audio=useRef<WorldAudio|null>(null),introWanted=useRef(introActive),transitionTimer=useRef<number>();introWanted.current=introActive;
 const focus=useRef<{target:Vector3;radius:number;alpha?:number;beta?:number}|null>(null),savedCamera=useRef<{target:Vector3;radius:number;alpha:number;beta:number}|null>(null);
 const [touring,setTouring]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState<string|null>(null),[fps,setFps]=useState(0),[selected,setSelected]=useState<Project|null>(null),[dataError,setDataError]=useState<string|null>(null);
 const canvas=useRef<HTMLCanvasElement>(null),runtime=useRef<Runtime|null>(null),tour=useRef(touring);
 const explicitQuality=useRef(query.has('quality'));
 const motionPreference=useRef(matchMedia('(prefers-reduced-motion: reduce)').matches);
 const snapshot=useSyncExternalStore(subscribe,getSnapshot);tour.current=touring;
 const projects=projectsForCity(snapshot,city);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const listener=()=>{motionPreference.current=media.matches;if(media.matches)setTouring(false);};media.addEventListener('change',listener);return()=>media.removeEventListener('change',listener);},[]);
 useEffect(()=>{let disposed=false;const poll=()=>{if(!document.hidden)void refresh().then(()=>{if(!disposed)setDataError(null)}).catch(()=>{if(!disposed)setDataError('Project activity is temporarily unavailable. The world remains open.');});};poll();const timer=window.setInterval(poll,15000);return()=>{disposed=true;clearInterval(timer)};},[]);
 useEffect(()=>{
  const element=canvas.current;if(!element)return;
  let engine:AbstractEngine|undefined,scene:Scene|undefined,disposed=false,resize:(()=>void)|undefined,visibility:(()=>void)|undefined;
  let stopMotion:(()=>void)|undefined;
  setReady(false);setError(null);setFps(0);setSelected(null);focus.current=null;savedCamera.current=null;
  (window as Window&{__rebootBabylon?:unknown}).__rebootBabylon=undefined;
  const initialize=async()=>{try{
   const renderer=await createRenderer(element,quality);engine=renderer.engine;
   if(disposed){engine.dispose();return;}
   if(renderer.software&&!explicitQuality.current&&quality!=='low'){engine.dispose();engine=undefined;setQuality('low');return;}
   // Evidence captures use the baseline's exact render resolution; normal browsing retains device scaling.
   if(new URLSearchParams(window.location.search).get('capture')==='1'&&quality==='high')engine.setHardwareScalingLevel(1);
   const settings=QUALITY_LEVELS[quality];
   scene=new Scene(engine);scene.skipPointerMovePicking=true;const currentScene=scene,currentEngine=engine;const instrumentation=new SceneInstrumentation(scene);instrumentation.captureFrameTime=true;scene.onDisposeObservable.add(()=>instrumentation.dispose());
   const camera=new ArcRotateCamera('explorer',Math.PI*.30,1.30,285,new Vector3(0,30,0),scene);
   camera.lowerRadiusLimit=45;camera.upperRadiusLimit=1100;camera.lowerBetaLimit=.28;camera.upperBetaLimit=Math.PI*.48;camera.minZ=.5;camera.maxZ=1800;camera.fov=.72;camera.wheelDeltaPercentage=.025;camera.panningSensibility=55;camera.attachControl(element,true);
   camera.keysUp=[38,87];camera.keysDown=[40,83];camera.keysLeft=[37,65];camera.keysRight=[39,68];
   const {sun}=buildEnvironment(scene,city,quality);const architecture=buildArchitecture(scene,city,quality==='low'?'low':'high');
   const districts=buildDistricts(scene,city,quality);
   scene.onDisposeObservable.add(()=>districts.dispose());
   if(quality==='high'||quality==='ultra')applySurfaceDetail(scene);else applyReducedMaterials(scene);
   if(settings.shadowSize>0){
    const shadows=new ShadowGenerator(settings.shadowSize,sun);shadows.usePercentageCloserFiltering=true;shadows.filteringQuality=ShadowGenerator.QUALITY_LOW;shadows.bias=.001;shadows.normalBias=.04;shadows.darkness=.18;
    for(const mesh of architecture.meshes){shadows.addShadowCaster(mesh);mesh.receiveShadows=true;}
    const glow=new GlowLayer('restrained-emission',scene,{mainTextureRatio:.35,blurKernelSize:24});glow.intensity=.14;
   }
   scene.imageProcessingConfiguration.contrast=1.2;scene.imageProcessingConfiguration.exposure=PROFILES[city].exposure;scene.imageProcessingConfiguration.toneMappingEnabled=true;
   if(settings.postProcessing){const pipeline=new DefaultRenderingPipeline('cinematic-grade',false,scene,[camera]);pipeline.fxaaEnabled=true;pipeline.samples=1;}
   const markerMaterial=new PBRMaterial('live-projects',scene);markerMaterial.albedoColor=Color3.FromHexString(PROFILES[city].accent);markerMaterial.emissiveColor=markerMaterial.albedoColor.scale(.35);markerMaterial.metallic=.55;markerMaterial.roughness=.3;
   const markerStartZ=Math.max(150,...architecture.meshes.map(mesh=>{mesh.computeWorldMatrix(true);return mesh.getBoundingInfo().boundingBox.maximumWorld.z+8;}));
   runtime.current={scene,engine,camera,markers:[],markerMaterial,markerStartZ};
   let lastHover=0;
   scene.onPointerObservable.add(info=>{if(info.type!==PointerEventTypes.POINTERMOVE||performance.now()-lastHover<120||introWanted.current)return;lastHover=performance.now();const hit=currentScene.pick(currentScene.pointerX,currentScene.pointerY,mesh=>!!mesh.metadata?.projectId);element.style.cursor=hit?.hit?'pointer':'grab';});
   scene.onPointerObservable.add(info=>{if(info.type===PointerEventTypes.POINTERPICK){const id=info.pickInfo?.pickedMesh?.metadata?.projectId as string|undefined;if(id){focusProject(id);}}});
   stopMotion=()=>{setTouring(false);focus.current=null;};element.addEventListener('pointerdown',stopMotion);element.addEventListener('wheel',stopMotion,{passive:true});element.addEventListener('keydown',stopMotion);
   let intro:ReturnType<typeof createIntroduction>|null=null;let introStarted=0;let hidden:{mesh:AbstractMesh;enabled:boolean}[]=[];
   const endIntroduction=()=>{if(!intro)return;intro.dispose();intro=null;hidden.forEach(({mesh,enabled})=>{if(!mesh.isDisposed())mesh.setEnabled(enabled);});hidden=[];restoreOverview(camera);camera.attachControl(element,true);};
   scene.onDisposeObservable.add(()=>intro?.dispose());
   let previous=performance.now(),lastMetrics=previous,frames=0,elapsed=0;
   const render=()=>{
    if(disposed)return;const now=performance.now(),dt=Math.min((now-previous)/1000,.05);previous=now;
    if(introWanted.current&&!intro){hidden=currentScene.meshes.map(mesh=>({mesh,enabled:mesh.isEnabled()}));hidden.forEach(({mesh})=>mesh.setEnabled(false));camera.detachControl();intro=createIntroduction(currentScene,camera);introStarted=now;}
    if(intro&&!introWanted.current)endIntroduction();
    if(intro)intro.update((now-introStarted)/1000);
    if(!intro&&focus.current){const amount=1-Math.exp(-dt*4);setOrbitTarget(camera,Vector3.Lerp(camera.target,focus.current.target,amount));camera.radius+=(focus.current.radius-camera.radius)*amount;if(focus.current.alpha!==undefined)camera.alpha+=(focus.current.alpha-camera.alpha)*amount;if(focus.current.beta!==undefined)camera.beta+=(focus.current.beta-camera.beta)*amount;if(Vector3.Distance(camera.target,focus.current.target)<.05&&Math.abs(camera.radius-focus.current.radius)<.1&&Math.abs(camera.alpha-(focus.current.alpha??camera.alpha))<.002&&Math.abs(camera.beta-(focus.current.beta??camera.beta))<.002)focus.current=null;}
    if(!intro)districts.update(camera.position,motionPreference.current?0:now/1000);
    runtime.current?.markers.forEach(marker=>marker.setEnabled(!intro));
    if(!intro&&tour.current){elapsed+=dt;camera.alpha+=dt*.035;camera.beta=1.30+Math.sin(elapsed*.08)*.06;camera.radius=245+Math.cos(elapsed*.07)*40;setOrbitTarget(camera,new Vector3(Math.sin(elapsed*.045)*24,30+Math.sin(elapsed*.06)*9,Math.cos(elapsed*.045)*14-14));}
    if(!motionPreference.current)architecture.animate?.(now/1000);
    try{currentScene.render();frames++;}catch(cause){setError(cause instanceof Error?cause.message:'The graphics device stopped responding. Try reduced effects.');currentEngine.stopRenderLoop();return;}
    if(now-lastMetrics>1000){const measured=Math.round(frames*1000/(now-lastMetrics));setFps(measured);frames=0;lastMetrics=now;
     (window as Window&{__rebootBabylon?:unknown}).__rebootBabylon={city,quality,backend:renderer.backend,structures:districts.structureCount,intro:!!intro,fps:measured,drawCalls:instrumentation.drawCallsCounter.current,frameMs:instrumentation.frameTimeCounter.current,sceneMeshes:currentScene.meshes.length,materials:currentScene.materials.length,textures:currentScene.textures.length,camera:{alpha:camera.alpha,beta:camera.beta,radius:camera.radius},meshes:currentScene.getActiveMeshes().length,triangles:currentScene.getActiveMeshes().data.slice(0,currentScene.getActiveMeshes().length).reduce((total,mesh)=>total+mesh.getTotalIndices()/3*Math.max(1,'thinInstanceCount' in mesh?Number(mesh.thinInstanceCount):1),0),width:currentEngine.getRenderWidth(),height:currentEngine.getRenderHeight(),ready:currentScene.isReady()};
    }
   };
   if(new URLSearchParams(window.location.search).get('capture')==='1')(window as Window&{__rebootCapture?:()=>void}).__rebootCapture=()=>currentEngine.stopRenderLoop(render);
   scene.executeWhenReady(()=>{if(disposed)return;setReady(true);setTransitioning(false);currentEngine.runRenderLoop(render);});
   resize=()=>currentEngine.resize();window.addEventListener('resize',resize);
   visibility=()=>{if(document.hidden)currentEngine.stopRenderLoop(render);else{previous=performance.now();lastMetrics=previous;frames=0;currentEngine.runRenderLoop(render);}};document.addEventListener('visibilitychange',visibility);
   engine.onContextLostObservable.add(()=>{setReady(false);setError('Graphics context lost. Reload the world to reconnect.');});
   engine.onContextRestoredObservable.add(()=>{setReady(true);setError(null);});
  }catch(cause){if(!disposed){if(cause instanceof RendererInitializationError&&canvasGeneration===0){setCanvasGeneration(1);return;}setError(cause instanceof Error?cause.message:'Rendering is unavailable. Open Zero Hub to continue.');setTransitioning(false);}}};
  void initialize();
  return()=>{disposed=true;if(resize)window.removeEventListener('resize',resize);if(visibility)document.removeEventListener('visibilitychange',visibility);if(stopMotion){element.removeEventListener('pointerdown',stopMotion);element.removeEventListener('wheel',stopMotion);element.removeEventListener('keydown',stopMotion);}runtime.current=null;delete (window as Window&{__rebootCapture?:()=>void}).__rebootCapture;scene?.dispose();engine?.dispose();};
 },[city,quality,canvasGeneration]);
 useEffect(()=>{
  const active=runtime.current;if(!active||!ready)return;
  for(const marker of active.markers)marker.dispose();active.markers=[];
  active.markers=buildProjectMarkers(active.scene,projects,snapshot,active.markerMaterial,city,active.markerStartZ);
  if(selected&&!projects.some(project=>project.id===selected.id))setSelected(null);
 // Snapshot changes are the only source of construction and recognition updates.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[snapshot,city,ready]);
 function finishIntro(){introWanted.current=false;setIntroActive(false);try{localStorage.setItem('reboot-cinematic-intro-v2','seen');}catch{/* Browsing still works. */}}
 function focusProject(id:string){const active=runtime.current,project=getSnapshot().projects.find(p=>p.id===id);if(!active||!project)return;const marker=active.markers.find(m=>m.metadata?.projectId===id);setSelected(project);setTouring(false);if(marker){if(!savedCamera.current)savedCamera.current={target:active.camera.target.clone(),radius:active.camera.radius,alpha:active.camera.alpha,beta:active.camera.beta};focus.current={target:marker.position.clone(),radius:50};}}
 function closeProject(){setSelected(null);const saved=savedCamera.current;if(saved){focus.current={target:saved.target,radius:saved.radius,alpha:saved.alpha,beta:saved.beta};savedCamera.current=null;}}
 function changeCity(next:string){if(next===city){finishIntro();return;}finishIntro();setTouring(false);focus.current=null;savedCamera.current=null;setTransitioning(true);clearTimeout(transitionTimer.current);transitionTimer.current=window.setTimeout(()=>{setCity(cityFromQuery(next));const url=new URL(window.location.href);url.searchParams.set('city',next);window.history.replaceState(null,'',url);audio.current?.setCity(next);},motionPreference.current?0:240);}
 async function toggleAudio(){try{if(audioEnabled){audio.current?.mute();setAudioEnabled(false);}else{audio.current??=new WorldAudio();await audio.current.start(city,volume);setAudioEnabled(true);}}catch{setDataError('Audio is unavailable in this browser.');}}
 useEffect(()=>()=>{clearTimeout(transitionTimer.current);audio.current?.dispose();},[]);
 return <main className="babylon-world" style={{position:'fixed',inset:0,background:'#102333'}}>
  <canvas key={canvasGeneration} ref={canvas} tabIndex={0} aria-label={`${PROFILES[city].name} interactive 3D world. Drag to orbit, scroll to zoom, arrow keys to rotate.`} style={{display:'block',width:'100%',height:'100%',touchAction:'none',outline:'none'}}/>
  <WorldOverlay city={city} onCity={changeCity} ready={ready} quality={quality} onQuality={next=>{explicitQuality.current=true;setQuality(next);}} touring={touring} onTour={()=>{focus.current=null;savedCamera.current=null;setSelected(null);setTouring(value=>!value);}} projectCount={projects.length} fps={fps} error={error||dataError} selectedProject={selected} onCloseProject={closeProject} onProjectSelect={focusProject} introActive={introActive} onSkipIntro={finishIntro} onEnterIntro={finishIntro} onReplayIntro={()=>{focus.current=null;savedCamera.current=null;setSelected(null);setIntroActive(true);setTouring(false);}} transitioning={transitioning} audioEnabled={audioEnabled} onAudio={()=>void toggleAudio()} volume={volume} onVolume={next=>{setVolume(next);audio.current?.setVolume(audioEnabled?next:0);}}/>
 </main>;
}
