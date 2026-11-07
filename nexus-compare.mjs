// Side-by-side BEFORE / AFTER contact sheet for the Reboot Nexus rebuild.
// It only re-arranges the PNGs already captured by nexus-rebuild.check.mjs —
// nothing is generated. Headless Chrome lays out a plain HTML page and takes a
// pixel-exact screenshot of it.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const shots = join(root, '../screenshots')
const views = [
  ['hero', 'HERO — elevated three-quarter view'],
  ['silhouette', 'SILHOUETTE — eye level, flat on the approach face'],
  ['gate', 'GATE — closest legal distance, looking through the void'],
  ['crown', 'CROWN — high angle over the roof aperture'],
]
const cell = 700
const base = `file:///${shots.replace(/\\/g, '/')}/`
const rows = views.map(([id, label]) => `
  <div class="band">${label}</div>
  <div class="pair">
    <figure><img src="${base}nexus-${id}-before.png"><figcaption>BEFORE — twin towers, spire, sky bridges</figcaption></figure>
    <figure><img src="${base}nexus-${id}-after.png"><figcaption>AFTER — The Canopied Gate</figcaption></figure>
  </div>`).join('')

const html = `<!doctype html><meta charset="utf-8"><title>Reboot Nexus — rebuild comparison</title>
<style>
  body{margin:0;background:#0b0f14;color:#dfe7ef;font:13px/1.4 ui-sans-serif,system-ui,sans-serif}
  h1{font-size:18px;margin:18px 24px 2px}
  p.note{margin:0 24px 14px;color:#8fa1b3;font-size:12px}
  .band{margin:16px 24px 6px;font:600 11px ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#7fd8ef}
  .pair{display:flex;gap:12px;margin:0 24px}
  figure{margin:0;width:${cell}px}
  img{display:block;width:${cell}px;border:1px solid #223040}
  figcaption{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9ab0c4;padding:5px 0 0}
</style>
<h1>Reboot Nexus — complete visual rebuild</h1>
<p class="note">Identical camera and identical local fixture in every pair; only the building geometry changed. Captured from the real app through <code>vite preview</code> with no live data.</p>
${rows}
<div style="height:24px"></div>`

const work = await mkdtemp(join(tmpdir(), 'reboot-nexus-compare-'))
const page = join(work, 'compare.html')
await writeFile(page, html, 'utf8')
const cdp = 9233
const profile = await mkdtemp(join(tmpdir(), 'reboot-compare-profile-'))
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless=new', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, `--window-size=${cell * 2 + 72},900`,
    '--allow-file-access-from-files', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let ws
try {
  const targets = await (async () => { const start = Date.now(); while (Date.now() - start < 30000) { try { const r = await fetch(`http://127.0.0.1:${cdp}/json/list`); if (r.ok) return r.json() } catch {} await delay(150) } throw new Error('Chrome unavailable') })()
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  const pending = new Map(); let seq = 0
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id) { const t = pending.get(m.id); pending.delete(m.id); m.error ? t.reject(new Error(JSON.stringify(m.error))) : t.resolve(m.result) } })
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: cell * 2 + 72, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `file:///${page.replace(/\\/g, '/')}` })
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
    return response.result.value
  }
  const start = Date.now()
  while (!(await evaluate(`document.readyState==='complete'&&[...document.images].every(i=>i.complete&&i.naturalWidth>0)`))) {
    if (Date.now() - start > 30000) throw new Error(`Images never loaded: ${await evaluate('JSON.stringify([...document.images].map(i=>[i.src.slice(-28),i.naturalWidth]))')}`)
    await delay(150)
  }
  const size = await send('Runtime.evaluate', { expression: 'JSON.stringify({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight})', returnByValue: true })
  const { w, h } = JSON.parse(size.result.value)
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
  await delay(1200)
  const complete = await send('Runtime.evaluate', { expression: 'JSON.stringify([...document.images].map(i=>i.naturalWidth))', returnByValue: true })
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true })
  const out = join(shots, 'nexus-compare-before-after.png')
  await writeFile(out, Buffer.from(shot.data, 'base64'))
  console.log(JSON.stringify({ out, viewport: { w, h }, imageWidths: JSON.parse(complete.result.value) }))
} catch (error) {
  console.error(error.stack); process.exitCode = 1
} finally {
  ws?.close()
  if (chrome?.pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {})
  await rm(work, { recursive: true, force: true }).catch(() => {})
}
