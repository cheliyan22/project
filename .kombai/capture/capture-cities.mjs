// Photographs every district once — and refuses to photograph an empty canvas.
//
// The product now publishes `data-render-ready` only after its framebuffer probe
// sees two consecutive frames with structure. This script waits for that signal,
// then runs its own independent readback on the live canvas as a second opinion,
// and only then presses the shutter. If a district never draws, it is reported
// as such instead of being saved as a black rectangle.
//
//   node .kombai/capture/capture-cities.mjs
//   CITY=Health node .kombai/capture/capture-cities.mjs   (a single district)
//
// Output: .kombai/captures/<City>.png and .kombai/captures/timings.json
// Exit code 1 if any requested district failed to paint.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = resolve(root, '.kombai/captures')
const ALL = ['Graveyard', 'IdeaHub', 'Legend', 'AI', 'Gaming', 'Education', 'Health', 'Creator', 'Space', 'Robotics', 'Community']
const cities = process.env.CITY ? process.env.CITY.split(',').map(s => s.trim()).filter(Boolean) : ALL
const W = 1600, H = 1000
const port = 5211, cdpPort = 5212
// A cold district in dev pays for its chunk transform plus shader compilation,
// which measured ~56s for the first one. The product gives up at 90s, so the
// harness waits a little longer than that and reports whatever it saw.
const perCityMs = Number(process.env.PER_CITY_MS || 150000)
const delay = ms => new Promise(r => setTimeout(r, ms))

// Mirrors src/planet/modules/cityworld/hooks/useRenderProbe.ts. Duplicated on
// purpose: an independent reader must not share the app's stored conclusion.
const PASS_STD_DEV = 2.5
const PASS_BUCKETS = 3

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean).find(p => existsSync(p))

if (!CHROME) {
  console.error('No Chrome binary found. Set CHROME_PATH to one.')
  process.exit(1)
}

const profile = await mkdtemp(join(tmpdir(), 'reboot-capture-profile-'))
await mkdir(outDir, { recursive: true })

const vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe' })
const serverLog = []
vite.stdout.on('data', d => serverLog.push(String(d)))
vite.stderr.on('data', d => serverLog.push(String(d)))

let chrome, ws
const pageErrors = []

const untilHttp = async url => {
  const started = Date.now()
  while (Date.now() - started < 40000) {
    try { const r = await fetch(url); if (r.ok) return await r.text() } catch { /* not up yet */ }
    await delay(150)
  }
  throw new Error(`Unavailable: ${url}\n${serverLog.join('')}`)
}

try {
  await untilHttp(`http://127.0.0.1:${port}/record-cities.html`)

  chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`, '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--use-gl=angle',
    '--enable-unsafe-swiftshader', 'about:blank',
  ], { stdio: 'ignore' })
  await untilHttp(`http://127.0.0.1:${cdpPort}/json/version`)
  const targets = JSON.parse(await untilHttp(`http://127.0.0.1:${cdpPort}/json/list`))
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)

  const pending = new Map()
  let seq = 0
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const entry = pending.get(message.id)
      pending.delete(message.id)
      message.error ? entry?.reject(new Error(JSON.stringify(message.error))) : entry?.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') {
      pageErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
    }
  })
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })

  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq
    pending.set(id, { resolve: res, reject: rej })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('reboot-reduced-effects','false');localStorage.setItem('reboot-second-dawn-tutorial-v1','complete');`,
  })

  // Independent readback of the live canvas — same question, separate reader.
  const confirmProbe = `(() => {
    const canvas = document.querySelector('.dawn-world canvas');
    if (!canvas || !canvas.width) return null;
    const scratch = document.createElement('canvas');
    scratch.width = 80; scratch.height = 45;
    const ctx = scratch.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, 80, 45);
    const { data } = ctx.getImageData(0, 0, 80, 45);
    const total = 80 * 45;
    const seen = new Uint8Array(16);
    let buckets = 0, sum = 0, sumSquares = 0;
    for (let i = 0; i < total; i++) {
      const o = i * 4;
      const luma = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
      sum += luma; sumSquares += luma * luma;
      const b = Math.min(15, Math.floor(luma / 16));
      if (!seen[b]) { seen[b] = 1; buckets++; }
    }
    const mean = sum / total;
    const stdDev = Math.sqrt(Math.max(0, sumSquares / total - mean * mean));
    return { mean: +mean.toFixed(2), stdDev: +stdDev.toFixed(2), buckets };
  })()`

  const renderState = city => evaluate(`(() => {
    const el = document.querySelector('[data-city="${city}"]');
    return el ? el.getAttribute('data-render-state') : null;
  })()`)

  const results = []
  for (const city of cities) {
    const started = Date.now()
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/record-cities.html?city=${city}&t=${started}` })

    let state = null
    while (Date.now() - started < perCityMs) {
      state = await renderState(city)
      if (state === 'painted' || state === 'failed') break
      await delay(200)
    }
    const readyMs = Date.now() - started

    const appReport = await evaluate('window.__rebootRender || null')
    const confirm = state === 'painted' ? await evaluate(confirmProbe) : null
    const confirmed = !!confirm && confirm.stdDev >= PASS_STD_DEV && confirm.buckets >= PASS_BUCKETS
    const ok = state === 'painted' && confirmed

    if (ok) {
      // Readiness fires once the first frame holds a picture; the establishing
      // camera then settles onto its authored angle. Give it a beat before the shutter.
      await delay(900)
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      await writeFile(join(outDir, `${city}.png`), Buffer.from(shot.data, 'base64'))
    }

    const entry = { city, ok, state, readyMs, appReport, confirm }
    results.push(entry)
    const sample = confirm ? `mean ${confirm.mean} sd ${confirm.stdDev} buckets ${confirm.buckets}` : 'no readback'
    console.log(`${ok ? 'PAINTED ' : 'FAILED  '} ${city.padEnd(10)} ${String(readyMs).padStart(6)}ms  ${state}  ${sample}`)
    if (!ok) {
      const text = String(await evaluate('document.body.innerText')).replace(/\s+/g, ' ').slice(0, 400)
      console.log(`          copy: ${text}`)
    }
  }

  await writeFile(join(outDir, 'timings.json'), JSON.stringify({
    capturedAt: new Date().toISOString(),
    viewport: `${W}x${H}`,
    thresholds: { passStdDev: PASS_STD_DEV, passBuckets: PASS_BUCKETS },
    pageErrors,
    results,
  }, null, 2))

  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} districts painted. Timings: .kombai/captures/timings.json`)
  if (failed.length) {
    console.log(`Not painted: ${failed.map(r => `${r.city} (${r.state})`).join(', ')}`)
    process.exitCode = 1
  }
} finally {
  try { chrome?.kill() } catch { /* already gone */ }
  try { ws?.close() } catch { /* already closed */ }
  try { vite.kill() } catch { /* already gone */ }
  await delay(400)
  try { await rm(profile, { recursive: true, force: true }) } catch { /* temp left behind */ }
}
