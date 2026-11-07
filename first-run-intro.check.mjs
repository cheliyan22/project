// First-run introduction + shared-profile route, driven in a real browser.
//
//   node first-run-intro.check.mjs
//
// Asserts the introduction appears once, advances, validates the inline beta
// form, hands over to the landing screen, and never returns for a returning
// visitor. Also checks that a shared /u/<name> link opens a profile rather than
// the landing gate. Requires a current `npm run build` (it uses vite preview).
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installFixtureNetwork, jsonFixture, protocolError, waitForReady } from './harness-local-utils.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const port = 4196
const cdp = 4197
const delay = ms => new Promise(r => setTimeout(r, ms))
const profile = await mkdtemp(join(tmpdir(), 'reboot-intro-'))
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe' })
const logs = [], errors = [], results = []
server.stdout.on('data', d => logs.push(String(d)))
server.stderr.on('data', d => logs.push(String(d)))

let chrome, ws
const untilHttp = async url => {
  const started = Date.now()
  while (Date.now() - started < 40000) {
    try { const r = await fetch(url); if (r.ok) return await r.text() } catch { /* not up */ }
    await delay(150)
  }
  throw new Error(`Unavailable: ${url}\n${logs.join('')}`)
}
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? ` — ${detail}` : ''}`)
}

try {
  await untilHttp(`http://127.0.0.1:${port}`)
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`,
    '--window-size=1440,960', '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' })
  await untilHttp(`http://127.0.0.1:${cdp}/json/version`)
  const targets = JSON.parse(await untilHttp(`http://127.0.0.1:${cdp}/json/list`))
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)

  const pending = new Map()
  let seq = 0
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const entry = pending.get(message.id)
      pending.delete(message.id)
      message.error ? entry?.reject(protocolError(message.error)) : entry?.resolve(message.result)
    }
    if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
    }
  })
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq
    pending.set(id, { resolve: res, reject: rej })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description || out.exceptionDetails.text)
    return out.result.value
  }
  const wait = (expression, ms = 20000) => waitForReady(evaluate, expression, ms)
  const clickText = async text => {
    const clicked = await evaluate(`(() => {
      const el = [...document.querySelectorAll('button, a')].find(node =>
        !node.disabled && node.getBoundingClientRect().width > 0 &&
        node.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));
      if (!el) return false;
      el.click();
      return true;
    })()`)
    if (!clicked) throw new Error(`Nothing to click for "${text}"`)
    await delay(350)
  }

  await send('Page.enable'); await send('Runtime.enable')
  await installFixtureNetwork({ ws, send, origin: `http://127.0.0.1:${port}`, errors, respond: (request, url) => {
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/rest/v1/')) return { status: 204 }
    if (request.method === 'POST' && url.pathname === '/rest/v1/rpc/landing_signal_counts') return jsonFixture([{ authored_ideas: 0, revival_signals: 0 }])
    if (request.method === 'GET' && url.pathname === '/rest/v1/profiles') return jsonFixture([])
    // A malformed beta address must never reach even a fixture write endpoint.
    return null
  } })
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
  // No localStorage clearing on navigation: the point of the second visit is that
  // the flag written by the first one survives. A fresh Chrome profile starts empty.

  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
  check('introduction appears for a new visitor', await wait(`!!document.querySelector('.project-intro')`))

  const firstChapter = await evaluate(`document.querySelector('.pi-copy h1')?.innerText ?? ''`)
  check('first chapter states what Reboot is', /nothing ends/i.test(firstChapter), firstChapter.slice(0, 80))

  await clickText('continue')
  await clickText('continue')
  await clickText('continue')
  const fourth = await evaluate(`document.querySelector('.pi-copy h1')?.innerText ?? ''`)
  check('advances to the building chapter', /corner/i.test(fourth), fourth.slice(0, 80))
  check('beta form is offered on the last chapter', await evaluate(`!!document.querySelector('.bsf input')`))

  // Invalid address: the client must name the problem without a round trip.
  await evaluate(`(() => {
    const input = document.querySelector('.bsf input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'a@b');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value;
  })()`)
  await clickText('save my spot')
  const validation = await evaluate(`document.querySelector('.bsf-status')?.textContent ?? ''`)
  check('rejects a malformed email with a specific message', /missing something/i.test(validation), validation.slice(0, 90))

  await clickText('enter reboot')
  check('hands over to the landing screen', await wait(`document.body.innerText.includes('SOME DESERVE A SECOND CHANCE')`, 25000))
  check('introduction is gone after finishing', await evaluate(`!document.querySelector('.project-intro')`))
  check('returning visitor flag is stored', await evaluate(`localStorage.getItem('reboot-intro-v1') === 'seen'`))

  await send('Page.navigate', { url: `http://127.0.0.1:${port}/?again=1` })
  check('does not reappear on a second visit', await wait(`location.search === '?again=1' && !document.querySelector('.project-intro') && document.body.innerText.includes('SOME DESERVE A SECOND CHANCE')`, 25000))

  // A shared link must open the record, not the landing gate.
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/u/nobody-test` })
  check('shared profile route bypasses the intro', await wait(`location.pathname === '/u/nobody-test' && !!document.querySelector('.pp') && !document.querySelector('.project-intro')`, 20000))
  // The fixture contains no matching builder; a load error is not a passing result.
  check('shared profile states why there is no record', await wait(`/no builder named/i.test(document.body.innerText)`, 20000),
    (await evaluate("document.body?.innerText.slice(0, 120) ?? '<document not ready>'")))

  check('no runtime exceptions', errors.length === 0, errors.join(' | ').slice(0, 200))
} finally {
  const failed = results.filter(r => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  try { chrome?.kill() } catch { /* gone */ }
  try { ws?.close() } catch { /* gone */ }
  try { server.kill() } catch { /* gone */ }
  await delay(400)
  try { await rm(profile, { recursive: true, force: true }) } catch { /* temp left */ }
  if (failed.length) process.exitCode = 1
}
