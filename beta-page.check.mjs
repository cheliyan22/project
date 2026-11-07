// Production-browser check for /beta. Requires an owner-built `npm run build`.
// All backend reads/writes are fixtures; unknown external requests fail closed.
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { installFixtureNetwork, isBackendPath, jsonFixture, protocolError, waitForReady } from './harness-local-utils.mjs'

const root = dirname(fileURLToPath(import.meta.url)), port = 4191, cdp = 4192
const profile = await mkdtemp(join(tmpdir(), 'reboot-beta-page-'))
const checks = resolve(root, 'demo/checks')
const origin = `http://127.0.0.1:${port}`
const betaRequests = []
let fixtureCase = 'new'
await mkdir(checks, { recursive: true })
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe' })
const delay = ms => new Promise(r => setTimeout(r, ms)), errors = [], logs = []
server.stdout.on('data', d => logs.push(String(d))); server.stderr.on('data', d => logs.push(String(d)))
let chrome, ws
async function untilHttp(url) { const s = Date.now(); while (Date.now() - s < 30000) { try { const r = await fetch(url); if (r.ok) return await r.text() } catch {} await delay(150) } throw new Error(`Unavailable: ${url}\n${logs.join('')}`) }

try {
  await untilHttp(`http://127.0.0.1:${port}`)
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, '--window-size=1440,1000', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
  await untilHttp(`http://127.0.0.1:${cdp}/json/version`)
  const targets = JSON.parse(await untilHttp(`http://127.0.0.1:${cdp}/json/list`))
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  const pending = new Map(); let seq = 0
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data)
    if (m.id) { const t = pending.get(m.id); pending.delete(m.id); m.error ? t?.reject(protocolError(m.error)) : t?.resolve(m.result) }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
  })
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
  const wait = async (expression, ms = 30000) => {
    if (await waitForReady(evaluate, expression, ms)) return
    throw new Error(`Timed out: ${expression}\n${await evaluate("document.body?.innerText.slice(0,1200) ?? '<document not ready>'")}`)
  }
  const screenshot = async name => { const shot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(checks, name), Buffer.from(shot.data, 'base64')) }
  const navigate = async query => {
    fixtureCase = new URLSearchParams(query).get('case') || 'new'
    betaRequests.length = 0
    await send('Page.navigate', { url: `${origin}/beta${query}` })
    await wait(`location.pathname === '/beta' && location.search === ${JSON.stringify(query)} && document.body.innerText.includes('BETA PRE-REGISTRATION')`)
    await wait(`document.querySelector('video')?.readyState >= 1`)
  }
  const submit = async email => {
    await evaluate(`(()=>{const input=document.getElementById('beta-email');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,${JSON.stringify(email)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`)
    await wait(`document.querySelector('.beta-form button[type=submit]')?.disabled === false`)
    await evaluate(`document.querySelector('.beta-form button[type=submit]').click()`)
  }

  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('reboot-intro-v1', 'seen');` })
  await installFixtureNetwork({ ws, send, origin, errors, respond: (request, url) => {
    if (request.method === 'OPTIONS' && isBackendPath(url.pathname)) return { status: 204 }
    if (request.method === 'POST' && url.pathname === '/rest/v1/rpc/join_beta_waitlist_referral') {
      betaRequests.push(JSON.parse(request.postData))
      if (fixtureCase === 'error') return jsonFixture({ message: 'test outage' }, 500)
      return jsonFixture({ status: fixtureCase === 'existing' ? 'existing' : 'registered', inviteCode: 'ABCDEF12', position: 42, referrals: 0, referred: false })
    }
    if (request.method === 'POST' && url.pathname === '/rest/v1/rpc/landing_signal_counts') return jsonFixture([{ authored_ideas: 0, revival_signals: 0 }])
    if (['GET', 'HEAD'].includes(request.method) && url.pathname === '/rest/v1/ideas') {
      return { status: 200, body: request.method === 'HEAD' ? '' : '[]', headers: { 'Content-Range': '*/0' } }
    }
    return null
  } })

  await navigate('')
  assert.equal(await evaluate(`document.querySelectorAll('a[href="/"]').length >= 3`), true)
  assert.equal(await evaluate(`document.querySelector('video').duration > 50`), true, 'the finished walkthrough must load')
  await submit('  Builder@Example.COM ')
  await wait(`document.body.innerText.includes('Your beta spot is saved.')`)
  const expectedRequest = { prospect_email: 'builder@example.com', referrer_code: null, signup_source: null }
  assert.deepEqual(betaRequests, [expectedRequest])
  assert.equal(await evaluate(`document.body.innerText.includes('builder@example.com is registered')`), true)
  await screenshot('beta-desktop.png')

  await navigate('?case=existing')
  await submit('builder@example.com')
  await wait(`document.body.innerText.includes('You’re already on the list.')`)
  assert.deepEqual(betaRequests, [expectedRequest])

  await navigate('?case=error')
  await submit('builder@example.com')
  await wait(`document.body.innerText.includes('We couldn’t confirm your registration.')`)
  assert.deepEqual(betaRequests, [expectedRequest])
  assert.equal(await evaluate(`document.body.innerText.includes('Your beta spot is saved.')`), false)

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await navigate('')
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'mobile layout must not overflow horizontally')
  assert.equal(await evaluate(`document.getElementById('beta-email').getBoundingClientRect().width > 250`), true)
  await screenshot('beta-mobile.png')

  await evaluate(`document.querySelector('.beta-footer a').click()`)
  await wait(`location.pathname === '/' && document.body.innerText.includes('REBOOT_OS') && [...document.querySelectorAll('button')].some(b => b.textContent.toLowerCase().includes('continue as ghost'))`)
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.toLowerCase().includes('continue as ghost')).click()`)
  await wait(`location.pathname === '/' && !!document.querySelector('.page-area') && !!document.querySelector('.rail-icon')`)
  assert.deepEqual(betaRequests, [], 'footer navigation must not register another address')
  assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`)
  console.log('Beta page check passed: video, new/existing/error states, normalized request, mobile layout, and fixture-backed app navigation.')
} finally {
  chrome?.kill(); ws?.close(); server.kill()
  await delay(500)
  try { await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }) } catch { console.log(`temp profile left at ${profile}`) }
}
