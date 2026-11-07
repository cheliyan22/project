// Local production-preview regression: real pointer clicks, no external writes.
// Requires the owner's preview on port 4188 and a current build.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installFixtureNetwork, isBackendPath, jsonFixture, protocolError, waitForReady } from './harness-local-utils.mjs'
const root = dirname(fileURLToPath(import.meta.url))
const origin = 'http://127.0.0.1:4188'
const profile = await mkdtemp(join(tmpdir(), 'reboot-echo-vault-'))
const output = join(root, 'demo/checks/echo-vault')
await mkdir(output, { recursive: true })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const errors = [], requests = []
let chrome, ws
try {
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9238', `--user-data-dir=${profile}`, '--window-size=1440,1000', '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' })
  let pages
  const start = Date.now()
  while (!pages && Date.now() - start < 20000) {
    try { pages = await (await fetch('http://127.0.0.1:9238/json/list')).json() } catch { await delay(120) }
  }
  assert.ok(pages, 'Chrome debugging endpoint starts')
  ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
  const pending = new Map(); let sequence = 0
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) { const task = pending.get(message.id); pending.delete(message.id); message.error ? task?.reject(protocolError(message.error)) : task?.resolve(message.result) }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
  })
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => { const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description || out.exceptionDetails.text); return out.result.value }
  const wait = async expression => assert.ok(await waitForReady(evaluate, expression, 90000), `Timed out: ${expression}`)
  const click = async expression => {
    await wait(`!!(${expression})`)
    const point = await evaluate(`(()=>{const el=${expression};el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);return {x,y,ready:!el.disabled&&(el===hit||el.contains(hit))}})()`)
    assert.ok(point.ready, `Control is clickable: ${expression}`)
    const { x, y } = point
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
  }
  const button = text => `[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(text)})`
  const shot = async name => { const data = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(output, `${name}.png`), Buffer.from(data.data, 'base64')) }
  await send('Page.enable'); await send('Runtime.enable')
  await installFixtureNetwork({ ws, send, origin, errors, respond: (request, url) => {
    requests.push(`${request.method} ${url.pathname}`)
    if (isBackendPath(url.pathname)) return jsonFixture([])
    return null
  } })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('reboot-intro-v1','seen');localStorage.setItem('reboot-second-dawn-tutorial-v1','complete');localStorage.setItem('reboot-reduced-effects','true');` })
  await send('Page.navigate', { url: `${origin}/?page=planet&preview=1` })
  await wait(`!!document.querySelector('.dawn-world')`)
  await wait(`!!document.querySelector('.dawn-skip') || document.querySelector('.dawn-world').dataset.introducing==='false'`)
  if (await evaluate(`!!document.querySelector('.dawn-skip')`)) await click(`document.querySelector('.dawn-skip')`)
  await wait(`document.querySelector('.dawn-world').dataset.introducing==='false' && document.querySelector('.dawn-world').dataset.renderReady==='true'`)
  await click(button('Echo'))
  await wait(`!!document.querySelector('.echo-overlay') || document.body.innerText.includes('MEMORY')`)
  await shot('echo-before')
  await click(button('Vault'))
  await click(button('Offer'))
  await wait(`document.body.innerText.includes('ONE FIXED WINDOW')`)
  await click(`[...document.querySelectorAll('.vault button')].find(el=>el.textContent.includes('Claim Echo aurora'))`)
  await wait(`!!document.querySelector('.vault-cosmetic-toggle input:checked')`)
  await shot('fixed-offer')
  await click(button('Support'))
  await wait(`document.body.innerText.includes('NOT AVAILABLE YET')`)
  assert.equal(await evaluate(`document.body.innerText.includes('$90 billed yearly') && document.body.innerText.includes('$240 billed yearly')`), true)
  assert.equal(await evaluate(`document.querySelectorAll('.vault a').length`), 1, 'Only separate support link, no fake checkout')
  await shot('proposed-plans')
  await click(`document.querySelector('[aria-label="Close the vault"]')`)
  await shot('echo-aurora')
  await send('Page.reload', { ignoreCache: true })
  await wait(`!!document.querySelector('.dawn-world')`)
  assert.equal(await evaluate(`localStorage.getItem('reboot-vault-beta-claim-v2')`), 'echo-beta-aurora-2026-11')
  assert.deepEqual(requests.filter(path=>/wallet_state|building_ownership|building_placements|activity_reward/.test(path)), [], 'Preview does not load economy or earn coins')
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, checks: ['public preview', 'Echo render', 'real-pointer cosmetic claim', 'claim persisted on reload', 'proposed pricing totals', 'no paid checkout', 'no economy requests'], screenshots: output }, null, 2))
} finally {
  ws?.close()
  if (chrome?.pid) { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); else chrome.kill() }
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {})
}
