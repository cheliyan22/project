import { Engine } from '@babylonjs/core/Engines/engine';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { Quality } from './profiles';
import glslangJs from '@babylonjs/core/assets/glslang/glslang.js?url';
import glslangWasm from '@babylonjs/core/assets/glslang/glslang.wasm?url';
import twgslJs from '@babylonjs/core/assets/twgsl/twgsl.js?url';
import twgslWasm from '@babylonjs/core/assets/twgsl/twgsl.wasm?url';

/** Geometry identity stays fixed; these budgets control render cost. */
export const QUALITY_LEVELS = {
 low: { renderScale:.65,maxDpr:1,shadowSize:0,shadows:false,postProcessing:false,renderDistance:300,detailDistance:85,vegetationDensity:.25,particleDensity:0 },
 medium: { renderScale:.85,maxDpr:1.25,shadowSize:1024,shadows:true,postProcessing:false,renderDistance:450,detailDistance:130,vegetationDensity:.5,particleDensity:.35 },
 high: { renderScale:1,maxDpr:1.5,shadowSize:2048,shadows:true,postProcessing:true,renderDistance:650,detailDistance:190,vegetationDensity:.75,particleDensity:.65 },
 ultra: { renderScale:1,maxDpr:2,shadowSize:4096,shadows:true,postProcessing:true,renderDistance:900,detailDistance:260,vegetationDensity:1,particleDensity:1 },
} as const satisfies Record<Quality, {renderScale:number;maxDpr:number;shadowSize:number;shadows:boolean;postProcessing:boolean;renderDistance:number;detailDistance:number;vegetationDensity:number;particleDensity:number}>;

export const LOCAL_SHADER_COMPILERS = {
 glslangOptions:{jsPath:glslangJs,wasmPath:glslangWasm},
 twgslOptions:{jsPath:twgslJs,wasmPath:twgslWasm},
};
export type Renderer = {engine:AbstractEngine;backend:'webgpu'|'webgl';software:boolean};
export function isSoftwareRenderer(name:string){return /swiftshader|llvmpipe|lavapipe|software|basic render|\bwarp\b/i.test(name);}
export function resolutionScaling(quality:Quality,dpr:number,software:boolean){
 const config=QUALITY_LEVELS[quality];
 const safeDpr=Number.isFinite(dpr)&&dpr>0?dpr:1;
 return Math.max(software?2:0,1/(Math.min(safeDpr,config.maxDpr)*config.renderScale));
}
let webGPUInitializationFailed=false;
/** A canvas cannot switch context types once acquired. Caller can remount it;
 * subsequent attempts after a WebGPU failure go straight to WebGL. */
export class RendererInitializationError extends Error {
 readonly requiresFreshCanvas=true;
 constructor(){super('Unable to initialize graphics. Retry with a fresh canvas for WebGL fallback.');this.name='RendererInitializationError';}
}
export async function createRenderer(canvas:HTMLCanvasElement,quality:Quality):Promise<Renderer>{
 let gpu:import('@babylonjs/core/Engines/webgpuEngine').WebGPUEngine|undefined;
 if(!webGPUInitializationFailed&&typeof navigator!=='undefined'&&'gpu' in navigator&&navigator.gpu){
  try{
   const {WebGPUEngine}=await import('@babylonjs/core/Engines/webgpuEngine');
   if(await WebGPUEngine.IsSupportedAsync){
    gpu=new WebGPUEngine(canvas,{antialias:quality!=='low',powerPreference:quality==='low'?'low-power':'high-performance',...LOCAL_SHADER_COMPILERS});
    // Load local GLSL translators before acquiring the canvas GPU context.
    // Standard/PBR materials may compile GLSL even when the backend is WebGPU.
    await gpu.prepareGlslangAndTintAsync();
    await gpu.initAsync();
    const info=gpu.getInfo();const software=isSoftwareRenderer(`${info.vendor} ${info.renderer}`);
    gpu.setHardwareScalingLevel(resolutionScaling(quality,globalThis.devicePixelRatio,software));
    return {engine:gpu,backend:'webgpu',software};
   }
  }catch{
   webGPUInitializationFailed=true;
   try{gpu?.dispose();}catch{/* Partial device initialization can also make disposal fail. */}
  }
 }
 let engine:Engine|undefined;
 try{
  engine=new Engine(canvas,quality!=='low',{stencil:true,preserveDrawingBuffer:typeof location!=='undefined'&&new URLSearchParams(location.search).get('capture')==='1',powerPreference:quality==='low'?'low-power':'high-performance'},false);
  const info=engine.getGlInfo();const software=isSoftwareRenderer(`${info.vendor} ${info.renderer}`);
  engine.setHardwareScalingLevel(resolutionScaling(quality,globalThis.devicePixelRatio,software));
  return {engine,backend:'webgl',software};
 }catch{
  try{engine?.dispose();}catch{/* Preserve the initialization error. */}
  throw new RendererInitializationError();
 }
}
