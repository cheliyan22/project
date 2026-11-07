/** Share cards: grab the live WebGL frame and composite a branded 1200x630 PNG.
 *  The canvas keeps its drawing buffer (see CityWorldManager) so toDataURL is
 *  reliable; if the browser still refuses, callers get a clean 'unavailable'. */

export type ShareOutcome = 'shared' | 'downloaded' | 'unavailable';

const W = 1200;
const H = 630;
const BAR = 84;

function findFrame(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>('.dawn-world canvas');
}

async function composeCard(frame: HTMLCanvasElement, district: string): Promise<Blob | null> {
  let url: string;
  try { url = frame.toDataURL('image/png'); } catch { return null; }
  const image = new Image();
  const loaded = await new Promise<boolean>(resolve => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
  if (!loaded) return null;

  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#060b12';
  ctx.fillRect(0, 0, W, H);
  // Cover-fit the live frame into the area above the brand bar.
  const targetH = H - BAR;
  const scale = Math.max(W / image.width, targetH / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, (W - dw) / 2, (targetH - dh) / 2, dw, dh);

  ctx.fillStyle = '#0b1420';
  ctx.fillRect(0, targetH, W, BAR);
  ctx.fillStyle = '#e7bb7b';
  ctx.fillRect(0, targetH, W, 3);
  ctx.textBaseline = 'middle';
  ctx.font = '700 26px "Share Tech Mono", monospace';
  ctx.fillStyle = '#e8f2ee';
  ctx.fillText(`REBOOT / ${district.toUpperCase()}`, 34, targetH + BAR / 2 - 10);
  ctx.font = '13px "Share Tech Mono", monospace';
  ctx.fillStyle = '#8fa8a4';
  ctx.fillText('A city of abandoned projects — some deserve a second chance.', 34, targetH + BAR / 2 + 18);

  return new Promise(resolve => out.toBlob(blob => resolve(blob), 'image/png'));
}

export async function shareView(district: string): Promise<ShareOutcome> {
  const frame = findFrame();
  if (!frame) return 'unavailable';
  const blob = await composeCard(frame, district);
  if (!blob) return 'unavailable';

  const file = new File([blob], `reboot-${district.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`, { type: 'image/png' });
  // A shared image with no link is a dead end; carry the address so a recipient
  // can actually open Reboot.
  const url = typeof window === 'undefined' ? '' : window.location.origin;
  const shared = {
    title: 'Reboot',
    text: `My view of ${district} on Reboot — a city of abandoned projects.${url ? ` ${url}` : ''}`,
    url,
    files: [file],
  };
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share(shared);
      return 'shared';
    } catch { /* user dismissed or share failed; fall back to download */ }
  }
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
  return 'downloaded';
}
