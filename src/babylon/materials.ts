import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Scene } from '@babylonjs/core/scene';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';

type Surface = 'concrete' | 'metal' | 'paving' | 'glass';
type SurfaceMaps = { albedo: DynamicTexture; normal: DynamicTexture; roughness: DynamicTexture };
type SceneDetail = { maps: Map<Surface, SurfaceMaps>; applied: WeakSet<PBRMaterial> };
const details = new WeakMap<Scene, SceneDetail>();
const SIZE = 256;
const wrap = (value: number) => (value + SIZE) % SIZE;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Repeatable grain, independent of the city's generation/random sequence. */
function grain(x: number, y: number, salt = 0) {
  let value = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ salt;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

/** Distance to a panel joint, symmetric across each repeating texture boundary. */
function joint(value: number, spacing: number) {
  const coordinate = value % spacing;
  return 1 - Math.min(1, Math.min(coordinate, spacing - 1 - coordinate) / 1.5);
}

function makeSurface(scene: Scene, kind: Surface): SurfaceMaps | null {
  // Probe once before allocating GPU resources; environments without a real 2D
  // canvas retain their original materials instead of failing world creation.
  const probe = document.createElement('canvas');
  probe.width = SIZE; probe.height = SIZE;
  const context = probe.getContext('2d');
  if (!context) return null;
  const albedo = context.createImageData(SIZE, SIZE);
  const packed = context.createImageData(SIZE, SIZE);
  const normal = context.createImageData(SIZE, SIZE);
  const heights = new Float32Array(SIZE * SIZE);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const offset = (y * SIZE + x) * 4;
      const fine = grain(x, y) - 0.5;
      const broad = grain(Math.floor(x / 32), Math.floor(y / 32), 91) - 0.5;
      let tone: number, height: number, roughness: number;
      if (kind === 'metal') {
        const seam = Math.max(joint(x, 128), joint(y, 64));
        const brush = grain(0, y, 24) - 0.5;
        const panel = grain(Math.floor(x / 128), Math.floor(y / 64), 19) - 0.5;
        tone = 0.965 + brush * 0.018 + fine * 0.009 + panel * 0.025 - seam * 0.09;
        height = brush * 0.008 - seam * 0.055;
        roughness = 0.88 + brush * 0.035 + panel * 0.06 + seam * 0.10;
      } else if (kind === 'glass') {
        const seam = Math.max(joint(x, 64), joint(y, 128));
        const pane = grain(Math.floor(x / 64), Math.floor(y / 128), 47) - 0.5;
        // Opaque glazing keeps the existing reflection model and material tint.
        // Pane variation is deliberately broad; no painted fake reflections.
        tone = 0.98 + pane * 0.025 - seam * 0.13;
        height = -seam * 0.025;
        roughness = 0.84 + pane * 0.10 + seam * 0.12;
      } else if (kind === 'paving') {
        const stagger = Math.floor(y / 64) % 2 === 0 ? 0 : 64;
        const seam = Math.max(joint((x + stagger) % SIZE, 128), joint(y, 64));
        const tile = grain(Math.floor((x + stagger) / 128), Math.floor(y / 64), 62) - 0.5;
        tone = 0.94 + tile * 0.045 + fine * 0.018 - seam * 0.10;
        height = fine * 0.008 - seam * 0.06;
        roughness = 0.96 + fine * 0.025 + tile * 0.035;
      } else {
        const seam = Math.max(joint(x, 128), joint(y, 256));
        const pores = grain(x, y, 87) > 0.992 ? 0.035 : 0;
        tone = 0.955 + fine * 0.025 + broad * 0.012 - seam * 0.055 - pores;
        height = fine * 0.01 - seam * 0.035 - pores * 0.3;
        roughness = 0.96 + fine * 0.035;
      }
      const luminance = Math.round(clamp(tone) * 255);
      albedo.data[offset] = luminance;
      albedo.data[offset + 1] = luminance;
      albedo.data[offset + 2] = luminance;
      albedo.data[offset + 3] = 255;
      // glTF-style packed map: only G modulates the existing scalar roughness.
      // White R/B do not invent occlusion or replace each material's metalness.
      packed.data[offset] = 255;
      packed.data[offset + 1] = Math.round(clamp(roughness) * 255);
      packed.data[offset + 2] = 255;
      packed.data[offset + 3] = 255;
      heights[y * SIZE + x] = height;
    }
  }
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const offset = (y * SIZE + x) * 4;
      const dx = (heights[y * SIZE + wrap(x - 1)] - heights[y * SIZE + wrap(x + 1)]) * 1.5;
      const dy = (heights[wrap(y - 1) * SIZE + x] - heights[wrap(y + 1) * SIZE + x]) * 1.5;
      const length = Math.hypot(dx, dy, 1);
      normal.data[offset] = Math.round((dx / length * 0.5 + 0.5) * 255);
      normal.data[offset + 1] = Math.round((dy / length * 0.5 + 0.5) * 255);
      normal.data[offset + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
      normal.data[offset + 3] = 255;
    }
  }

  const created: DynamicTexture[] = [];
  const texture = (label: string, pixels: ImageData, color: boolean) => {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) throw new Error('Surface detail canvas unavailable');
    canvasContext.putImageData(pixels, 0, 0);
    const result = new DynamicTexture(`surface-detail-${kind}-${label}`, canvas, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    created.push(result);
    result.gammaSpace = color;
    result.hasAlpha = false;
    result.wrapU = Texture.WRAP_ADDRESSMODE;
    result.wrapV = Texture.WRAP_ADDRESSMODE;
    result.anisotropicFilteringLevel = 4;
    result.update(false);
    return result;
  };
  try {
    return { albedo: texture('albedo', albedo, true), normal: texture('normal', normal, false), roughness: texture('roughness', packed, false) };
  } catch {
    // Detail is optional. Release any partial allocation and preserve the city.
    created.forEach(item => item.dispose());
    return null;
  }
}

/**
 * Adds subtle, shared surface detail to the existing architecture materials.
 * Four 256px map sets maximum (12 textures, about 4 MiB including mipmaps).
 * Existing colors, transparency, geometry, emissive landmarks and vegetation
 * remain authored by the architecture generator. No textures leave the device.
 * Babylon owns the textures through this scene and disposes them with it.
 */
export function applySurfaceDetail(scene: Scene): void {
  const engine = scene.getEngine();
  if (scene.isDisposed || typeof document === 'undefined' || engine instanceof NullEngine || !engine.getRenderingCanvas()) return;
  let detail = details.get(scene);
  if (!detail) {
    detail = { maps: new Map(), applied: new WeakSet() };
    details.set(scene, detail);
    scene.onDisposeObservable.addOnce(() => { details.delete(scene); });
  }
  for (const candidate of scene.materials) {
    if (!(candidate instanceof PBRMaterial) || detail.applied.has(candidate)) continue;
    const match = /^architecture-[a-z]+-(0|1|2|4|6|glazing)$/.exec(candidate.name);
    if (!match) continue;
    const slot = match[1];
    const kind: Surface = slot === '6' || slot === 'glazing' ? 'glass' : slot === '4' ? 'paving' : slot === '0' ? 'concrete' : 'metal';
    let maps = detail.maps.get(kind);
    if (!maps) {
      const generated = makeSurface(scene, kind);
      if (!generated) continue;
      maps = generated;
      detail.maps.set(kind, maps);
    }
    if (!candidate.albedoTexture) candidate.albedoTexture = maps.albedo;
    if (!candidate.bumpTexture) candidate.bumpTexture = maps.normal;
    if (!candidate.metallicTexture) {
      candidate.metallicTexture = maps.roughness;
      candidate.useRoughnessFromMetallicTextureAlpha = false;
      candidate.useRoughnessFromMetallicTextureGreen = true;
      candidate.useMetallnessFromMetallicTextureBlue = false;
      candidate.useAmbientOcclusionFromMetallicTextureRed = false;
    }
    detail.applied.add(candidate);
  }
}
