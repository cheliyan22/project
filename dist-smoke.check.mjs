// Cold-start smoke check for the published artifact: real entry point, document metadata, no console errors.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const root = dirname(fileURLToPath(import.meta.url)), port = 4179, cdp = 9227
const profile = await mkdtemp(join(tmpdir(), 'reboot-dist-smoke-'))
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe' })
const delay = ms => new Promise(r => setTimeout(r, ms)), errors = [], logs = []
server.stdout.on('data', d => logs.push(String(d))); server.stderr.on('data', d => logs.push(String(d)))
let chrome, ws
async function untilHttp(url) { const s = Date.now(); while (Date.now() - s < 30000) { try { const r = await fetch(url); if (r.ok) return await r.text() } catch {} await delay(150) } throw new Error(`Unavailable: ${url}\n${logs.join('')}`) }
try {
  const html = await untilHttp(`http://127.0.0.1:${port}`)
  assert.match(html, /Reboot — Abandoned projects finally get a home/, 'index.html title')
  assert.doesNotMatch(html, /bolt\.new/, 'no bolt.new references in shell')
  const favicon = await fetch(`http://127.0.0.1:${port}/favicon.svg`)
  assert.equal(favicon.status, 200, 'favicon served')
  const oldIcon = await fetch(`http://127.0.0.1:${port}/vite.svg`)
  const glb = await fetch(`http://127.0.0.1:${port}/models/traveler.glb`)
  assert.equal(glb.status, 200, 'traveler model served')

  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, '--window-size=1440,960', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
  await untilHttp(`http://127.0.0.1:${cdp}/json/version`)
  const targets = JSON.parse(await untilHttp(`http://127.0.0.1:${cdp}/json/list`))
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  const pending = new Map(); let seq = 0
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id) { const t = pending.get(m.id); pending.delete(m.id); m.error ? t?.reject(new Error(JSON.stringify(m.error))) : t?.resolve(m.result) } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ')) })
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
  const wait = async (expression, ms = 60000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await evaluate(expression)) return; await delay(150) } throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText.slice(0,1200)')}`) }
  const textClick = text => pointerClick(`[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.getBoundingClientRect().width>0&&b.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))`)
  async function pointerClick(expression) {
    await wait(`(()=>{const el=${expression};if(!el||el.disabled)return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0})()`)
    const p = await evaluate(`(()=>{const el=${expression};const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...p })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...p })
  }
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('reboot-intro-v1','seen')}catch(e){}" })
  await send('Page.navigate', { url: `http://127.0.0.1:${port}` })
  await wait(`document.title.length>0`)
  const title = await evaluate('document.title')
  await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.toLowerCase().includes('continue as ghost'))`)
  await textClick('CONTINUE AS GHOST')
  await wait(`document.body.innerText.toLowerCase().includes('reboot planet')`, 60000)
  const landing = await evaluate('document.body.innerText.slice(0,400)')
  assert.equal(typeof title, 'string'); assert.match(title, /Reboot/)
  assert.match(landing, /Reboot Planet/i, 'planet entry reachable')
  console.log(JSON.stringify({ title, port, viteSvgStatus: oldIcon.status, glbStatus: glb.status, faviconStatus: favicon.status, errors, landing }, null, 2))
  assert.deepEqual(errors, [], 'no browser errors')
} catch (error) { console.error(error.stack); console.error('Browser errors:', JSON.stringify(errors)); process.exitCode = 1 }
finally {
  ws?.close()
  for (const h of [chrome, server]) if (h?.pid) { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(h.pid), '/T', '/F'], { stdio: 'ignore' }); else h.kill('SIGTERM') }
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {})
}
