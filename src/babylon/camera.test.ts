import { describe, it, expect } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { restoreOverview, setOrbitTarget } from './camera';
import { createIntroduction } from './intro';

describe('authored orbit transitions', () => {
 it('moves the target without replacing authored angles or distance', () => {
  const engine=new NullEngine();const scene=new Scene(engine);
  const camera=new ArcRotateCamera('camera',.8,1.2,50,Vector3.Zero(),scene);
  camera.getViewMatrix(true);setOrbitTarget(camera,new Vector3(-40,6,160));camera.getViewMatrix(true);
  expect(camera.alpha).toBe(.8);expect(camera.beta).toBe(1.2);expect(camera.radius).toBe(50);
  expect(Vector3.Distance(camera.position,camera.target)).toBeCloseTo(50);
  scene.dispose();engine.dispose();
 });
 it('holds the choreographed orbit throughout the moving portal approach', () => {
  const engine=new NullEngine();const scene=new Scene(engine);
  const camera=new ArcRotateCamera('camera',.8,1.2,285,new Vector3(0,30,0),scene);
  const intro=createIntroduction(scene,camera);
  for(let time=0;time<=22;time+=.25){intro.update(time);camera.getViewMatrix(true);expect(camera.radius).toBeGreaterThanOrEqual(36);expect(camera.radius).toBeLessThanOrEqual(180);}
  expect(camera.radius).toBe(36);expect(camera.alpha).toBeCloseTo(-Math.PI/2);
  intro.dispose();scene.dispose();engine.dispose();
 });
 it('restores the exact overview after an introduction with a different target', () => {
  const engine=new NullEngine();const scene=new Scene(engine);
  const camera=new ArcRotateCamera('camera',-.8,1.4,36,new Vector3(0,1,-43),scene);
  camera.getViewMatrix(true);restoreOverview(camera);camera.getViewMatrix(true);
  expect(camera.alpha).toBeCloseTo(Math.PI*.3);expect(camera.beta).toBe(1.3);expect(camera.radius).toBe(285);
  expect(camera.target.asArray()).toEqual([0,30,0]);expect(Vector3.Distance(camera.position,camera.target)).toBeCloseTo(285);
  scene.dispose();engine.dispose();
 });
});
