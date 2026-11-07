import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

/** Authored target movement carries its orbit with it. Babylon otherwise
 * recomputes alpha/beta/radius from the camera's previous world position. */
export function setOrbitTarget(camera: ArcRotateCamera, target: Vector3) {
  camera.setTarget(target, false, false, true);
}

export function restoreOverview(camera: ArcRotateCamera) {
  camera.alpha = Math.PI * .3;
  camera.beta = 1.30;
  camera.radius = 285;
  setOrbitTarget(camera, new Vector3(0, 30, 0));
}
