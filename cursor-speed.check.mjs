// Cursor speed + runtime error sweep. Measures how long the custom cursor ring
// takes to catch up with a real mouse jump, and collects console errors while
// walking the app's actual pages. Run before and after a cursor change and
// compare `settleMs` — the number is the point, not a screenshot.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url)), port = 4185, cdp = 4186
// REBOOT_CHECK_MODE=dev cold-starts the dev server instead of the production
// preview, because a clean `vite preview` says nothing about whether dev boots.
const mode = process.env.REBOOT_CHECK_MODE === 'dev' ? 'dev' : 'preview'
const profile = await mkdtemp(join(tmpdir(), 'reboot-cursor-'))
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), ...(mode === 'dev' ? [] : ['preview']), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe' })
const delay = ms => new Promise(r => setTimeout(r, ms)), errors = [], logs = [], failed = []
server.stdout.on('data', d => logs.push(String(d))); server.stderr.on('data', d => logs.push(String(d)))
let chrome, ws
async function untilHttp(url) { const s = Date.now(); while (Date.now() - s < 30000) { try { const r = await fetch(url); if (r.ok) return await r.text() } catch {} await delay(150) } throw new Error(`Unavailable: ${url}\n${logs.join('')}`) }

try {
  await untilHttp(`http://127.0.0.1:${port}`)
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, '--window-size=1440,960', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
  await untilHttp(`http://127.0.0.1:${cdp}/json/version`)
  const targets = JSON.parse(await untilHttp(`http://127.0.0.1:${cdp}/json/list`))
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  const pending = new Map(); let seq = 0
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data)
    if (m.id) { const t = pending.get(m.id); pending.delete(m.id); m.error ? t?.reject(new Error(JSON.stringify(m.error))) : t?.resolve(m.result) }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '))
    if (m.method === 'Network.loadingFailed') failed.push(m.params.errorText)
  })
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
  const wait = async (expression, ms = 45000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await evaluate(expression)) return; await delay(120) } throw new Error(`Timed out: ${expression}\n${(await evaluate('document.body.innerText')).slice(0, 900)}`) }
  const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  const click = async (x, y) => { await move(x, y); await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x, y }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x, y }) }
  const textClick = async text => {
    const p = await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.getBoundingClientRect().width>0&&b.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));if(!b)return null;const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    if (!p) throw new Error(`button not found: ${text}\n${(await evaluate('document.body.innerText')).slice(0, 600)}`)
    await click(p.x, p.y)
  }

  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('reboot-reduced-effects','false');localStorage.setItem('reboot-second-dawn-tutorial-v1','complete');localStorage.setItem('reboot-intro-v1','seen');` })
  await send('Page.navigate', { url: `http://127.0.0.1:${port}` })
  await wait(`!!document.querySelector('.cursor-ring')`)

  // Samples the ring centre on every animation frame for 900ms.
  await evaluate(`window.__measure = (tx) => new Promise(resolve => {
    const ring = document.querySelector('.cursor-ring');
    const centre = () => { const r = ring.getBoundingClientRect(); return r.left + r.width / 2 };
    const startX = centre(), samples = [], t0 = performance.now();
    const tick = () => {
      samples.push({ t: performance.now() - t0, x: centre() });
      if (performance.now() - t0 < 900) requestAnimationFrame(tick);
      else {
        const gap = tx - startX;
        const settled = samples.find(s => Math.abs(s.x - tx) <= Math.abs(gap) * 0.05);
        resolve({ startX, targetX: tx, frames: samples.length, settleMs: settled ? Math.round(settled.t) : null, lastX: Math.round(samples.at(-1).x) });
      }
    };
    requestAnimationFrame(tick);
  })`)

  const measure = async (fromX, fromY, toX, toY) => {
    await move(fromX, fromY)
    await delay(1200)
    const run = evaluate(`window.__measure(${toX})`)
    await delay(30)
    await move(toX, toY)
    return run
  }

  const jumps = []
  jumps.push(await measure(200, 300, 1000, 300))
  jumps.push(await measure(1100, 500, 300, 500))
  jumps.push(await measure(300, 700, 1200, 700))

  const settle = jumps.map(j => j.settleMs).filter(v => v !== null)
  const report = {
    cursor: {
      jumps,
      medianSettleMs: settle.length ? settle.sort((a, b) => a - b)[Math.floor(settle.length / 2)] : null,
      note: 'settleMs = ms until the ring is within 5% of the pointer after a jump; null means it never got there inside 900ms',
    },
  }

  // Walk the real pages and record whatever the console complains about.
  await textClick('continue as ghost')
  await delay(2500)
  const pages = {}
  for (const label of ['AI Lab', 'Leaderboard', 'Feedback & Roadmap']) {
    const before = errors.length
    try {
      await textClick(label)
      await delay(2200)
      pages[label] = { opened: true, newErrors: errors.slice(before) }
    } catch (e) {
      pages[label] = { opened: false, reason: String(e).slice(0, 200), newErrors: errors.slice(before) }
    }
  }
  // The landing screen runs a 3D canvas and starves rAF (a handful of frames per
  // second), so a number taken there measures the page, not the cursor. Repeat
  // the same jumps on a quiet page to see the cursor's own behaviour.
  const light = []
  light.push(await measure(200, 300, 1000, 300))
  light.push(await measure(1100, 500, 300, 500))
  light.push(await measure(300, 700, 1200, 700))
  const lightSettle = light.map(j => j.settleMs).filter(v => v !== null)
  report.cursorLightPage = {
    page: 'Feedback & Roadmap',
    jumps: light,
    medianSettleMs: lightSettle.length ? lightSettle.sort((a, b) => a - b)[Math.floor(lightSettle.length / 2)] : null,
  }

  report.mode = mode
  report.errors = errors
  report.failedRequests = [...new Set(failed)]
  report.pages = pages
  console.log(JSON.stringify(report, null, 2))
} finally {
  chrome?.kill(); ws?.close(); server.kill()
  await delay(400)
  try { await rm(profile, { recursive: true, force: true }) } catch { console.log(`temp profile left at ${profile}`) }
}
