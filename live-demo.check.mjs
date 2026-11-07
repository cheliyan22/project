// Visual demo of the live site with the waitlist RPC mocked IN THE BROWSER:
// no row is ever written to the production database. The mocked payload is
// byte-for-byte the shape the real SECURITY DEFINER function returns (the
// live loop was already probe-verified end-to-end).
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = dirname(fileURLToPath(import.meta.url))
const out = join(root, '../screenshots')
const BASE = 'https://reboot-planet-j2rhsjel2hj.qoder.website'
const CDP = 9231
const profile = await mkdtemp(join(tmpdir(), 'reboot-live-demo-'))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const errors = []
let chrome, ws

async function untilHttp(url) {
  const start = Date.now()
  while (Date.now() - start < 40000) {
    try { const r = await fetch(url); if (r.ok) return await r.text() } catch {}
    await delay(150)
  }
  throw new Error(`Unavailable: ${url}`)
}

try {
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`,
     '--window-size=1440,1000', '--no-first-run', '--no-default-browser-check',
     '--disable-background-networking', 'about:blank'], { stdio: 'ignore' })
  await untilHttp(`http://127.0.0.1:${CDP}/json/version`)
  const targets = JSON.parse(await untilHttp(`http://127.0.0.1:${CDP}/json/list`))
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  const pending = new Map(); let sequence = 0
  ws.addEventListener('message', e => {
    const msg = JSON.parse(e.data)
    if (msg.id) { const task = pending.get(msg.id); pending.delete(msg.id); if (msg.error) task?.reject(new Error(JSON.stringify(msg.error))); else task?.resolve(msg.result) }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text)
  })
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
    return response.result.value
  }
  const wait = async (expression, ms = 45000) => {
    const start = Date.now()
    while (Date.now() - start < ms) { if (await evaluate(expression)) return; await delay(200) }
    throw new Error(`Timed out: ${expression}\nbody: ${await evaluate('document.body.innerText.slice(0,900)')}`)
  }
  const goto = async u => { await send('Page.navigate', { url: u, referrer: '', ignoreCache: true }); await delay(1700) }
  const typeEmail = email => evaluate(`(() => {
    const input = document.querySelector('#beta-email')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(email)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return !input.disabled
  })()`)
  const submit = () => evaluate(`(document.querySelector('.beta-form-row button[type=submit]').click(), true)`)
  const savedText = () => evaluate(`document.querySelector('.beta-saved')?.innerText || ''`)
  const screenshot = async name => {
    await delay(900)
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(join(out, `live-demo-${name}.png`), Buffer.from(shot.data, 'base64'))
  }
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

  // In-browser mock: intercepts ONLY the waitlist RPC, everything else hits
  // the real production site. Guarantees zero writes to the live database.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const nativeFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const u = new URL(typeof input === 'string' ? input : input.url, location.href)
      if (u.hostname.endsWith('.supabase.co') && u.pathname.endsWith('/rpc/join_beta_waitlist_referral')) {
        const body = JSON.parse(init?.body || '{}')
        const referred = /^[0-9A-F]{8}$/.test(body.referrer_code || '')
        return new Response(JSON.stringify({
          status: 'registered', inviteCode: '7F3A91C4',
          position: referred ? 2 : 1, referrals: referred ? 0 : 1, referred
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (u.hostname.endsWith('.supabase.co') && /\\/rest\\/v1\\//.test(u.pathname)) {
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/0' } })
      }
      return nativeFetch(input, init)
    }
  ` })

  await goto(`${BASE}/beta/`)
  await wait(`!!document.querySelector('#beta-email')`)
  await screenshot('01-live-beta-form')
  await typeEmail('you@yourdeadproject.dev'); await submit()
  await wait(`!!document.querySelector('.beta-invite code')`)
  const founder = await savedText()
  await screenshot('02-founder-invite')

  await goto(`${BASE}/beta/?ref=7F3A91C4`)
  await wait(`!!document.querySelector('#beta-email')`)
  await typeEmail('their-friend@somewhere.dev'); await submit()
  await wait(`!!document.querySelector('.beta-saved')`)
  const neighbour = await savedText()
  await screenshot('03-referred-join')

  assert.match(founder, /#1 in line/)
  assert.match(founder, /\/beta\/\?ref=7F3A91C4/)
  assert.match(neighbour, /#2 in line/)
  // Copy regression guard: "1 builder … 12 hours" (plural on both nouns).
  assert.match(founder, /1 builder joined with your link — you moved up 12 hours in line\./)
  await goto(`${BASE}/beta/`)
  await wait(`!!document.querySelector('#beta-email')`)
  await typeEmail('you@yourdeadproject.dev'); await submit()
  await wait(`!!document.querySelector('.beta-invite-note')`)
  await screenshot('04-fixed-copy')
  console.log(JSON.stringify({ founder, neighbour, mode: 'browser-mocked RPC — zero live writes', errors }, null, 2))
  assert.deepEqual(errors, [])
} catch (error) {
  console.error(error.stack); console.error('Browser errors:', JSON.stringify(errors)); process.exitCode = 1
} finally {
  ws?.close()
  if (chrome?.pid) spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {})
}
