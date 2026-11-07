// Records a real demo video of the running app: headless Chrome renders the
// production build, CDP screencast captures every presented frame, and ffmpeg
// muxes the frames using their actual capture timestamps (so slow WebGL frames
// do not turn into a sped-up video). No mock screens, no slideshow of stills.
//
//   node record-demo.mjs
//
// Requires the ffmpeg-static binary installed in ../.video-tools.
import { spawn } from 'node:child_process'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(root, '../../.video-tools/'))
const ffmpeg = require('ffmpeg-static')
const outDir = resolve(root, '../demo')
const outFile = join(outDir, 'reboot-demo.mp4')
const port = 4187, cdp = 4188, cityPort = 4189
const W = 1280, H = 720

const profile = await mkdtemp(join(tmpdir(), 'reboot-video-profile-'))
const framesDir = await mkdtemp(join(tmpdir(), 'reboot-video-frames-'))
await mkdir(outDir, { recursive: true })
const vite = join(root, 'node_modules/vite/bin/vite.js')
const server = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe' })
const cityServer = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(cityPort), '--strictPort'], { cwd: root, stdio: 'pipe' })
const delay = ms => new Promise(r => setTimeout(r, ms))
const logs = [], pageErrors = []
for (const spawned of [server, cityServer]) {
  spawned.stdout.on('data', d => logs.push(String(d)))
  spawned.stderr.on('data', d => logs.push(String(d)))
}
let chrome, ws
async function untilHttp(url) { const s = Date.now(); while (Date.now() - s < 30000) { try { const r = await fetch(url); if (r.ok) return await r.text() } catch {} await delay(150) } throw new Error(`Unavailable: ${url}\n${logs.join('')}`) }

const frames = []
const frameWrites = []
let frameIndex = 0
let firstFrameTimestamp = null
const steps = []
const mark = label => { steps.push({ label, atMs: Date.now() - startedAt }); console.log(`  ${String(Date.now() - startedAt).padStart(6)}ms  ${label}`) }
let startedAt = Date.now()

try {
  await Promise.all([
    untilHttp(`http://127.0.0.1:${port}`),
    untilHttp(`http://127.0.0.1:${cityPort}/record-cities.html`),
  ])
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`, '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank',
  ], { stdio: 'ignore' })
  await untilHttp(`http://127.0.0.1:${cdp}/json/version`)
  const targets = JSON.parse(await untilHttp(`http://127.0.0.1:${cdp}/json/list`))
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  const pending = new Map(); let seq = 0
  ws.addEventListener('message', async e => {
    const m = JSON.parse(e.data)
    if (m.id) { const t = pending.get(m.id); pending.delete(m.id); m.error ? t?.reject(new Error(JSON.stringify(m.error))) : t?.resolve(m.result) }
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
    if (m.method === 'Page.screencastFrame') {
      const { data, sessionId, metadata } = m.params
      const name = join(framesDir, `f${String(frameIndex++).padStart(5, '0')}.jpg`)
      if (firstFrameTimestamp === null && typeof metadata?.timestamp === 'number') firstFrameTimestamp = metadata.timestamp
      const at = typeof metadata?.timestamp === 'number' && firstFrameTimestamp !== null
        ? Math.max(0, (metadata.timestamp - firstFrameTimestamp) * 1000)
        : Date.now() - startedAt
      frames.push({ name, at })
      frameWrites.push(writeFile(name, Buffer.from(data, 'base64')))
      send('Page.screencastFrameAck', { sessionId }).catch(() => {})
    }
  })
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
  const wait = async (expression, ms = 45000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await evaluate(expression)) return; await delay(150) } throw new Error(`Timed out: ${expression}\n${(await evaluate('document.body.innerText')).slice(0, 700)}`) }
  const clickAt = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x, y })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x, y })
  }
  const textClick = async text => {
    const p = await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.getBoundingClientRect().width>0&&b.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));if(!b)return null;const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    if (!p) throw new Error(`button not found: ${text}`)
    await clickAt(p.x, p.y)
  }

  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('reboot-reduced-effects','false');localStorage.setItem('reboot-second-dawn-tutorial-v1','complete');localStorage.setItem('reboot-intro-v1','seen');` })

  await send('Page.navigate', { url: `http://127.0.0.1:${port}` })
  await send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: W, maxHeight: H, everyNthFrame: 1 })
  startedAt = Date.now()
  mark('recording: landing boot sequence')

  await wait(`document.body.innerText.includes('SOME DESERVE A SECOND CHANCE')`)
  await delay(2500)
  mark('hero')

  await textClick('continue as ghost')
  await delay(4500)
  mark('home: idea archive')

  await textClick('Examine')
  await delay(3500)
  mark('project story modal')

  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='REVIVE')?.click()`)
  await delay(2500)
  mark('revive tab')

  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.querySelector('svg.lucide-x'))?.click()`)
  await delay(1200)
  mark('modal closed')

  await textClick('Explore')
  await delay(3000)
  mark('explore')

  await textClick('AI Lab')
  await delay(3500)
  mark('AI lab')

  await textClick('Leaderboard')
  await delay(3000)
  mark('leaderboard and badges')

  await textClick('Reboot Planet')
  await delay(14000)
  mark('3D planet')

  await delay(4000)
  await send('Page.navigate', { url: `http://127.0.0.1:${cityPort}/record-cities.html` })
  await wait(`!!document.querySelector('[data-city="hub"][data-travel-phase="idle"]') && !!document.querySelector('canvas')`)
  await wait(`[...document.querySelectorAll('.city-destinations button')].some(b => b.textContent.trim() === 'AI City')`)
  await delay(4500)
  mark('interactive city hub')

  for (const [city, label] of [['AI', 'AI City'], ['Gaming', 'Gaming City'], ['Creator', 'Creative City'], ['Space', 'Space City']]) {
    await textClick(label)
    mark(`travelling to ${label}`)
    await wait(`!!document.querySelector('[data-city="${city}"][data-travel-phase="idle"]')`, 60000)
    await delay(4500)
    mark(label)
  }

  await send('Page.stopScreencast')
  mark('recording stopped')
  await Promise.all(frameWrites)

  // Assemble with CDP's actual presentation timestamps. A 1000fps image timebase
  // gives each concat entry millisecond precision; the 25fps default otherwise
  // rounds every duration to 40ms and stretches high-frame-rate footage.
  const last = frames.at(-1)
  const lines = []
  frames.forEach((f, i) => {
    const next = frames[i + 1]
    const dur = next ? Math.max(0.001, (next.at - f.at) / 1000) : 1
    lines.push(`file '${f.name.replace(/\\/g, '/')}'`)
    lines.push('option framerate 1000')
    lines.push(`duration ${dur.toFixed(3)}`)
  })
  if (last) {
    lines.push(`file '${last.name.replace(/\\/g, '/')}'`)
    lines.push('option framerate 1000')
  }
  const concatPath = join(framesDir, 'frames.txt')
  await writeFile(concatPath, lines.join('\n'))

  console.log(`\n${frames.length} frames captured, encoding to ${outFile}`)
  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', concatPath, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-movflags', '+faststart', outFile]
  const code = await new Promise(res => { const p = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] }); let err = ''; p.stderr.on('data', d => { err += String(d) }); p.on('close', c => { if (c !== 0) console.error(err.slice(-3000)); res(c) }) })
  if (code !== 0) throw new Error(`ffmpeg exited ${code}`)
  await writeFile(join(outDir, 'reboot-demo.timeline.json'), JSON.stringify({ frames: frames.length, steps, pageErrors }, null, 2))
  console.log(JSON.stringify({ outFile, frames: frames.length, steps, pageErrors }, null, 2))
} finally {
  chrome?.kill(); ws?.close(); server.kill(); cityServer.kill()
  await delay(500)
  for (const dir of [profile, framesDir]) {
    try { await rm(dir, { recursive: true, force: true }) } catch { console.log(`temp left at ${dir}`) }
  }
}
