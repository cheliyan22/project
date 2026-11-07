// Visual check of the redesigned beta page: production bundle on a local
// preview server, waitlist RPC mocked in-browser (zero live writes).
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = dirname(fileURLToPath(import.meta.url))
const out = join(root, '../screenshots')
const PORT = 4189
const CDP = 9232
const profile = await mkdtemp(join(tmpdir(), 'reboot-ui-redesign-'))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const errors = []
let chrome, ws, server

async function untilHttp(url) {
  const start = Date.now()
  while (Date.now() - start < 40000) {
    try { const r = await fetch(url); if (r.ok) return await r.text() } catch {}
    await delay(150)
  }
  throw new Error(`Unavailable: ${url}`)
}

try {
  server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview',
    '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' })
  await untilHttp(`http://127.0.0.1:${PORT}`)

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
  const goto = async u => { await send('Page.navigate', { url: u, ignoreCache: true }); await delay(1700) }
  const typeEmail = email => evaluate(`(() => {
    const input = document.querySelector('#beta-email')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(email)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return !input.disabled
  })()`)
  const submit = () => evaluate(`(document.querySelector('.beta-form-row button[type=submit]').click(), true)`)
  const screenshot = async name => {
    await delay(1400) // let a few animation cycles pass so shots show mid-motion, not mid-reveal
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(join(out, `ui-redesign-${name}.png`), Buffer.from(shot.data, 'base64'))
  }
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const nativeFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const u = new URL(typeof input === 'string' ? input : input.url, location.href)
      if (u.hostname.endsWith('.supabase.co') && u.pathname.endsWith('/rpc/join_beta_waitlist_referral')) {
        const body = JSON.parse(init?.body || '{}')
        const referred = /^[0-9A-F]{8}$/.test(body.referrer_code || '')
        return new Response(JSON.stringify({
          status: 'registered', inviteCode: '7F3A91C4',
          position: referred ? 2 : 1, referrals: referred ? 0 : 2, referred
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (u.hostname.endsWith('.supabase.co') && /\\/rest\\/v1\\//.test(u.pathname)) {
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/0' } })
      }
      return nativeFetch(input, init)
    }
  ` })

  const LOCAL = `http://127.0.0.1:${PORT}`

  // desktop hero
  await goto(`${LOCAL}/beta/`)
  await wait(`!!document.querySelector('#beta-email')`)
  await wait(`(() => { const c = document.querySelector('.beta-stars'); const x = c?.getContext('2d'); if (!c || !x) return false; const d = x.getImageData(0, 0, c.width, Math.min(c.height, 400)).data; return d.some(v => v > 8) })()`, 8000)
  await screenshot('01-desktop-hero')

  // saved founder card (2 referrals → hours plural + rank glow)
  await typeEmail('you@yourdeadproject.dev'); await submit()
  await wait(`!!document.querySelector('.beta-invite-note')`)
  const saved = await evaluate(`document.querySelector('.beta-saved')?.innerText || ''`)
  await screenshot('02-desktop-saved')
  assert.match(saved, /2 builders joined with your link — you moved up 24 hours in line\./)
  assert.match(saved, /#1 in line/)

  // referred joiner, scrolled to the ticker
  await goto(`${LOCAL}/beta/?ref=7F3A91C4`)
  await wait(`!!document.querySelector('#beta-email')`)
  await evaluate(`document.querySelector('.beta-ticker')?.scrollIntoView({ block: 'center' })`)
  await screenshot('03-ticker')

  // mobile
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await goto(`${LOCAL}/beta/`)
  await wait(`!!document.querySelector('#beta-email')`)
  await screenshot('04-mobile')

  console.log(JSON.stringify({ saved, errors }, null, 2))
  assert.deepEqual(errors, [])
} catch (error) {
  console.error(error.stack); console.error('Browser errors:', JSON.stringify(errors)); process.exitCode = 1
} finally {
  ws?.close()
  for (const handle of [chrome, server]) if (handle?.pid) spawnSync('taskkill', ['/PID', String(handle.pid), '/T', '/F'], { stdio: 'ignore' })
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {})
}
