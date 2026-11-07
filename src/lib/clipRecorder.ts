/* Short clip capture of the live world.
 *
 * The renderer already keeps its drawing buffer (see CityWorldManager), so
 * canvas.captureStream gives MediaRecorder a real, continuous video of whatever
 * the player is looking at. No server render, no ffmpeg, nothing uploaded: the
 * clip is produced locally and handed back as a download.
 *
 * Deliberate limits: WebM only (that is what browsers can encode without a
 * binary), max 15 seconds (these are shareable highlights, not a screen
 * recording), and the HUD is not in frame because a canvas capture only sees the
 * WebGL surface. */

export type ClipOutcome = 'recorded' | 'unsupported' | 'unavailable';

export interface ClipResult {
  outcome: ClipOutcome;
  filename?: string;
  seconds?: number;
}

export function clipSupported(): boolean {
  return typeof window.MediaRecorder === 'function'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

const MAX_SECONDS = 15;

function pickMimeType(): string {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function download(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 4000);
}

export async function recordClip(options: {
  seconds?: number;
  label?: string;
  onTick?: (elapsedSeconds: number) => void;
} = {}): Promise<ClipResult> {
  const seconds = Math.min(MAX_SECONDS, Math.max(2, options.seconds ?? 8));
  const canvas = document.querySelector<HTMLCanvasElement>('.dawn-world canvas');
  if (!canvas) return { outcome: 'unavailable' };
  if (!clipSupported()) return { outcome: 'unsupported' };

  let stream: MediaStream;
  try {
    stream = canvas.captureStream(30);
  } catch {
    return { outcome: 'unsupported' };
  }
  if (stream.getVideoTracks().length === 0) return { outcome: 'unsupported' };

  const mimeType = pickMimeType();
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : undefined);
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    return { outcome: 'unsupported' };
  }

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

  const startedAt = performance.now();
  const ticker = window.setInterval(() => {
    options.onTick?.(Math.min(seconds, (performance.now() - startedAt) / 1000));
  }, 200);

  recorder.start(250);
  await new Promise((resolve) => window.setTimeout(resolve, seconds * 1000));
  if (recorder.state !== 'inactive') recorder.stop();
  await stopped;
  window.clearInterval(ticker);
  options.onTick?.(seconds);
  stream.getTracks().forEach((track) => track.stop());

  const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
  if (blob.size === 0) return { outcome: 'unavailable' };

  const slug = (options.label ?? 'world').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filename = `reboot-${slug || 'world'}.webm`;
  download(blob, filename);
  return { outcome: 'recorded', filename, seconds };
}
