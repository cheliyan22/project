// Two delivery forms of the SAME screenshots of the running app:
//   nexus-before-after.html         -> fragment + sibling cropped JPGs
//   nexus-before-after-inline.html  -> fully self-contained, images embedded
// Both are written to the visualizations dir; a self-contained copy also lands
// in reboot-audit/screenshots so it can simply be double-clicked.
// Nothing is generated: the only operation is cropping both sides of a pair to
// the same window of the PNGs that nexus-rebuild.check.mjs captured.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const shots = join(dirname(fileURLToPath(import.meta.url)), '../screenshots')
const outDir = process.argv[2]
if (!outDir) throw new Error('usage: node nexus-inline.mjs <visualizations dir>')

const CROP = { x: 380, y: 250, w: 720, h: 660 }
const views = [
  ['silhouette', 'Eye level, flat on the approach face', 'The silhouette test. Before: two slender towers, a spire, sky bridges and a colonnade. After: a mass that widens as it rises, standing on two piers over a void, with one leaning buttress.'],
  ['hero', 'Elevated three-quarter view', 'Composition and depth. The canopies overhang the tiers beneath them, the gate reads as a hole you can see into, and the crown aperture is visible from outside.'],
  ['gate', 'Closest legal camera distance', 'The negative space is the subject: a walk-through gate lit only by rungs in its floor and a seam in each cheek, instead of a glowing portal between two towers.'],
  ['crown', 'High angle over the roof', 'The roof plane is actually pierced — a ring frame with a glazed opening, a keystone caught on the cantilever, and the west buttress landing on the pad.'],
]

const CSS = `
  .nbx{color-scheme:dark;background:#0b0f14;color:#dfe7ef;font:15px/1.55 ui-sans-serif,system-ui,sans-serif;padding:22px 20px 34px}
  .nbx h1{font-size:22px;margin:0 0 6px}
  .nbx .lede{margin:0 0 24px;color:#93a7ba;font-size:14px;max-width:70ch}
  .nbx section{margin:0 0 30px}
  .nbx h2{font:600 12px/1 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:#7fd8ef;margin:0 0 10px}
  .nbx .wipe{position:relative;aspect-ratio:720/660;overflow:hidden;background:#05080c;border:1px solid #223040;line-height:0}
  .nbx .wipe img{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
  .nbx .before-wrap{position:absolute;inset:0;clip-path:inset(0 calc(100% - var(--x,50%)) 0 0)}
  .nbx .handle{position:absolute;top:0;bottom:0;left:var(--x,50%);width:2px;background:#36e4ff;transform:translateX(-1px)}
  .nbx .tag{position:absolute;top:8px;line-height:1;font:600 10px/1 ui-monospace,monospace;letter-spacing:.14em;padding:5px 7px;background:rgba(8,12,17,.82);color:#cfe3f2}
  .nbx .tag.left{left:8px}.nbx .tag.right{right:8px;color:#7fd8ef}
  .nbx .slider{width:100%;margin:10px 0 8px;accent-color:#36e4ff}
  .nbx p{margin:0 0 12px;color:#9fb2c4;font-size:13.5px;max-width:70ch}
  .nbx .pair{display:flex;gap:10px;flex-wrap:wrap}
  .nbx figure{margin:0;flex:1 1 300px}
  .nbx figure img{display:block;width:100%;border:1px solid #1c2836}
  .nbx figcaption{font:600 10px/1 ui-monospace,monospace;letter-spacing:.14em;color:#8fa1b3;padding-top:6px}
  .nbx .shop img{display:block;width:100%;border:1px solid #223040}
  .nbx .caveat{margin-top:26px;padding:12px 14px;border:1px solid #2a2f1d;background:#171a10;color:#cdd6b8;font-size:13px}`

const SCRIPT = `
  document.querySelectorAll('.nbx .wipe').forEach(wipe => {
    const slider = wipe.parentElement.querySelector('.slider')
    slider.addEventListener('input', event => wipe.style.setProperty('--x', event.target.value + '%'))
  })`

function build(srcOf, shopSrc, pairs) {
  const sections = views.map(([id, title, note]) => `
  <section>
    <h2>${title}</h2>
    <div class="wipe">
      <img src="${srcOf(id, 'after')}" alt="Reboot Nexus after the rebuild — ${title}">
      <div class="before-wrap"><img src="${srcOf(id, 'before')}" alt="Reboot Nexus before the rebuild — ${title}"></div>
      <div class="handle" aria-hidden="true"></div>
      <span class="tag left">BEFORE</span><span class="tag right">AFTER</span>
    </div>
    <input type="range" class="slider" min="0" max="100" value="50" aria-label="Wipe between the two designs — ${title}">
    <p>${note}</p>
    ${pairs ? `<div class="pair">
      <figure><img src="${srcOf(id, 'before')}" alt="before, ${title}"><figcaption>BEFORE — the design that was replaced</figcaption></figure>
      <figure><img src="${srcOf(id, 'after')}" alt="after, ${title}"><figcaption>AFTER — The Canopied Gate</figcaption></figure>
    </div>` : ''}
  </section>`).join('')
  return `<style>${CSS}</style>
<div class="nbx">
<h1>Reboot Nexus — rendered before and after</h1>
<p class="lede">Every image below is a screenshot of the running app. Both sides of a pair use the same camera
position, the same local fixture and the same crop; the only thing that changed is the building geometry.
Drag the slider to wipe between the two designs.</p>
${sections}
<section class="shop">
  <h2>The same building inside the real Building shop</h2>
  <img src="${shopSrc}" alt="Reboot Nexus preview in the Building shop with the corrected description">
</section>
<p class="caveat">These captures run on headless SwiftShader, which forces the LDR composer fallback, so bloom is
weaker here than on your GPU. The glow seams will read stronger when you run it.</p>
</div>
<script>${SCRIPT}</script>`
}

await mkdir(outDir, { recursive: true })

const cdp = 9235
const profile = await mkdtemp(join(tmpdir(), 'reboot-inline-profile-'))
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless=new', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, '--window-size=1200,1900',
    '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let ws
try {
  const list = await (async () => { const start = Date.now(); while (Date.now() - start < 30000) { try { const r = await fetch(`http://127.0.0.1:${cdp}/json/list`); if (r.ok) return r.json() } catch {} await delay(150) } throw new Error('Chrome unavailable') })()
  ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl)
  const pending = new Map(); let seq = 0
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id) { const t = pending.get(m.id); pending.delete(m.id); m.error ? t.reject(new Error(JSON.stringify(m.error))) : t.resolve(m.result) } })
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
    return response.result.value
  }
  await send('Page.enable'); await send('Runtime.enable')
  await send('Page.navigate', { url: `file:///${join(shots, 'nexus-shop-after.png').replace(/\\/g, '/')}` })
  const base = `file:///${shots.replace(/\\/g, '/')}/`
  await evaluate(`window.__crop=async(src,crop,width,quality)=>{const img=new Image();img.src=src;await img.decode();const w=crop?crop.w:img.naturalWidth,h=crop?crop.h:img.naturalHeight;const scale=width/w;const c=document.createElement('canvas');c.width=width;c.height=Math.round(h*scale);c.getContext('2d').drawImage(img,crop?crop.x:0,crop?crop.y:0,w,h,0,0,c.width,c.height);return c.toDataURL('image/jpeg',quality)}`)

  const data = {}
  for (const [id] of views) for (const side of ['before', 'after']) {
    const key = `${id}-${side}`
    const dataUrl = await evaluate(`__crop(${JSON.stringify(`${base}nexus-${key}.png`)},${JSON.stringify(CROP)},720,0.86)`)
    data[key] = dataUrl
    await writeFile(join(outDir, `nexus-${key}-crop.jpg`), Buffer.from(dataUrl.split(',')[1], 'base64'))
  }
  const shopInline = await evaluate(`__crop(${JSON.stringify(base + 'nexus-shop-after.png')},null,1000,0.78)`)
  await copyFile(join(shots, 'nexus-shop-after.png'), join(outDir, 'nexus-shop-after.png'))

  const fileSrc = (id, side) => `nexus-${id}-${side}-crop.jpg`
  const inlineSrc = (id, side) => data[`${id}-${side}`]
  const inline = build(inlineSrc, shopInline, false)
  const outputs = [
    [join(outDir, 'nexus-before-after.html'), build(fileSrc, 'nexus-shop-after.png', true)],
    [join(outDir, 'nexus-before-after-inline.html'), inline],
    [join(shots, 'nexus-before-after.html'), inline],
  ]
  for (const [path, html] of outputs) {
    await writeFile(path, html, 'utf8')
    console.error(`${path}: ${Math.round(html.length / 1024)} KB`)
  }
  if (inline.length > 900000) throw new Error('Inline fragment too large for the 1 MB limit')

  // Render the self-contained file I am about to hand over.
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 1900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `file:///${outputs[1][0].replace(/\\/g, '/')}` })
  const started = Date.now()
  while (!(await evaluate(`document.readyState==='complete'&&[...document.images].every(i=>i.complete&&i.naturalWidth>0)`))) {
    if (Date.now() - started > 30000) throw new Error('Inline images never loaded')
    await delay(150)
  }
  await evaluate(`document.querySelectorAll('.slider').forEach(s=>{s.value=38;s.dispatchEvent(new Event('input'))}), true`)
  await delay(400)
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(join(shots, 'nexus-inline-preview.png'), Buffer.from(shot.data, 'base64'))
  console.log(JSON.stringify({ outputs: outputs.map(([path]) => path), kb: Math.round(inline.length / 1024) }))
} catch (error) {
  console.error(error.stack); process.exitCode = 1
} finally {
  ws?.close()
  if (chrome?.pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {})
}
