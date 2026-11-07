// Landing stats check: the hero must print no social proof until the archive has
// account-authored rows, and must print exactly the measured counts once it does.
// Two live scenarios are driven through one local fetch stub — no remote writes,
// no fixture rows in the database.
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = dirname(fileURLToPath(import.meta.url)), port = 4183, cdp = 4184
const profile = await mkdtemp(join(tmpdir(), 'reboot-landing-stats-'))
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe' })
const delay = ms => new Promise(r => setTimeout(r, ms)), errors = [], logs = []
server.stdout.on('data', d => logs.push(String(d))); server.stderr.on('data', d => logs.push(String(d)))
let chrome, ws
async function untilHttp(url) { const s = Date.now(); while (Date.now() - s < 30000) { try { const r = await fetch(url); if (r.ok) return await r.text() } catch {} await delay(150) } throw new Error(`Unavailable: ${url}\n${logs.join('')}`) }

// The four numbers the landing used to invent, plus the labels they wore.
const FABRICATED = ['12,847', '2,103', 'DEAD IDEAS', 'BUILDERS', 'FOUNDER SLOTS', 'scanning 12,847', 'only 97 founder slots']

try {
  const html = await untilHttp(`http://127.0.0.1:${port}`)
  const bundlePath = html.match(/\/assets\/index-[\w-]+\.js/)?.[0]
  assert.ok(bundlePath, `entry bundle not found in ${html.slice(0, 300)}`)
  const bundle = await (await fetch(`http://127.0.0.1:${port}${bundlePath}`)).text()
  const bundleLeaks = FABRICATED.filter(needle => bundle.includes(needle))

  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, '--window-size=1440,960', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' })
  await untilHttp(`http://127.0.0.1:${cdp}/json/version`)
  const targets = JSON.parse(await untilHttp(`http://127.0.0.1:${cdp}/json/list`))
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  const pending = new Map(); let seq = 0
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id) { const t = pending.get(m.id); pending.delete(m.id); m.error ? t?.reject(new Error(JSON.stringify(m.error))) : t?.resolve(m.result) } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ')) })
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
  const wait = async (expression, ms = 60000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await evaluate(expression)) return; await delay(120) } throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText.slice(0,1500)')}`) }

  // ?stats=empty answers "no account has posted anything" (today's live shape:
  // 8 seed rows all with user_id = null). ?stats=real answers 3 authored ideas
  // and 2 revival signals. Both come back from one count-only RPC — the hero is
  // not allowed to read rows out of revivals, so any direct table call here is a
  // failure this check looks for.
  const stub = `
    const realFetch = window.fetch.bind(window);
    const mode = new URLSearchParams(location.search).get('stats') || 'empty';
    const counts = mode === 'real' ? { ideas: 3, revivals: 2 } : { ideas: 0, revivals: 0 };
    window.__counts = [];
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!url.hostname.endsWith('.supabase.co')) return realFetch(input, init);
      const method = ((typeof init === 'object' && init?.method) || 'GET').toUpperCase();
      const table = url.pathname.split('/').pop();
      if (method === 'POST' && table === 'landing_signal_counts') {
        window.__counts.push({ rpc: table, method });
        return new Response(JSON.stringify([{
          authored_ideas: counts.ideas,
          revival_signals: counts.revivals,
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      window.__counts.push({ table, method });
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' } });
    };
    localStorage.setItem('reboot-reduced-effects', 'true');localStorage.setItem('reboot-intro-v1','seen');;
  `
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: stub })

  const heroText = async (query) => {
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/${query}` })
    await wait(`document.body.innerText.includes('SOME DESERVE A SECOND CHANCE')`)
    await delay(1800)
    const text = await evaluate('document.body.innerText')
    return { text, asked: await evaluate('window.__counts.slice()') }
  }

  // 1. Nothing real to count -> no strip at all, but the page still works.
  const empty = await heroText('?stats=empty')
  const emptyLeaks = FABRICATED.filter(needle => empty.text.includes(needle))
  const heroStillUsable = [...empty.text.matchAll(/ENTER THE GRAVEYARD|continue as ghost/gi)].length

  // 2. Account-authored rows exist -> the measured numbers appear, nothing more.
  const real = await heroText('?stats=real')
  const realStats = {
    ideasLabel: real.text.includes('IDEAS IN THE GRAVEYARD'),
    revivalLabel: real.text.includes('REVIVAL SIGNALS'),
    ideasNumber: await evaluate(`[...document.querySelectorAll('div')].some(d=>d.childElementCount===0&&/^3$/.test(d.textContent.trim()))`),
    rpcCalls: real.asked.filter(a => a.rpc === 'landing_signal_counts').length,
    directTableReads: real.asked.filter(a => a.table === 'ideas' || a.table === 'revivals').length,
  }

  const summary = { port, bundlePath, bundleLeaks, emptyLeaks, heroStillUsable, realStats, errors: errors.slice(0, 5) }
  console.log(JSON.stringify(summary, null, 2))

  assert.deepEqual(bundleLeaks, [], 'the built bundle must not still carry the invented figures')
  assert.deepEqual(emptyLeaks, [], 'no fabricated social proof may render while counts are empty')
  assert.ok(heroStillUsable >= 2, 'both landing CTAs must survive without the stat row')
  assert.equal(realStats.rpcCalls, 1, 'both numbers must come from the count-only RPC, called once')
  assert.equal(realStats.directTableReads, 0, 'the hero must not read idea or revival rows to build its stats')
  assert.equal(realStats.ideasLabel, true, 'a real idea count must render once it exists')
  assert.equal(realStats.ideasNumber, true, 'the real count (3) must render verbatim, not padded')
  assert.equal(realStats.revivalLabel, true, 'revival signals must render once someone has sent one')
  assert.deepEqual(emptyLeaks.concat(real.text.includes('FOUNDER SLOTS') ? ['founder slots returned'] : []), [], 'dropped metrics must stay dropped')
  assert.equal(errors.length, 0, `page errors: ${errors.join(' | ')}`)
  console.log('landing-stats check passed')
} finally {
  chrome?.kill(); ws?.close(); server.kill()
  // Chrome keeps CrashpadMetrics-active.pma locked for a moment after the
  // process dies on Windows; a failed temp cleanup must not turn a green run red.
  await delay(400)
  try {
    await rm(profile, { recursive: true, force: true })
  } catch {
    console.log(`temp profile left behind at ${profile}`)
  }
}
