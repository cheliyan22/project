// Feedback & Roadmap interface check.
//
// The database half of this feature is proven by supabase/feedback-roadmap-execution.test.ts,
// which runs the real migration in PGlite. This file proves the other half: that the built
// page renders the board, that each click sends the request the contract expects, and that
// the browser never sends a total, an author or a voter id of its own.
//
// It runs against a local PostgREST-shaped stub — no live project, no credentials, no remote
// writes. The stub mirrors the migration deliberately (server-side tally, one-vote primary
// key, author stamping, admin-only status columns) so a client that only works against a
// permissive fake would fail here.
//
// The built page is served from the same origin as the stub API, so the browser talks to
// exactly the URL shape the app uses in production, without a cross-origin hop.
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, rm, writeFile, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, extname, resolve, relative, isAbsolute } from 'node:path'
import { parseArgs } from 'node:util'
import { installFixtureNetwork, protocolError, waitForReady } from './harness-local-utils.mjs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const root = dirname(fileURLToPath(import.meta.url))
const apiPort = 5198, cdp = 9231
const origin = `http://127.0.0.1:${apiPort}`
// Owner builds once, then checks run read-only against that bundle. No .env edits,
// implicit rebuilds, or deletion of shared output. Paths resolve from this project.
//   npm run build
//   node feedback-board.check.mjs --dist dist
const { values: options } = parseArgs({ options: { dist: { type: 'string', default: 'dist' }, screenshots: { type: 'string', default: 'demo/checks/feedback-board' } } })
const dist = resolve(root, options.dist)
const shotsDir = resolve(root, options.screenshots)
await access(join(dist, 'index.html')).catch(() => { throw new Error(`Missing build: ${dist}. Owner must run npm run build before this check.`) })
await mkdir(shotsDir, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'reboot-board-'))
const delay = ms => new Promise(r => setTimeout(r, ms))
const errors = []
const clientRequests = []

const ME = '77777777-0000-4000-8000-000000000001'
const OTHER = '77777777-0000-4000-8000-000000000002'
const IS_ADMIN = true

const now = () => new Date().toISOString()
const sessionUser = {
  id: ME, aud: 'authenticated', role: 'authenticated', email: 'nova@reboot.test',
  user_metadata: { username: 'nova' }, app_metadata: { provider: 'email' },
  identities: [], created_at: now(),
}
const row = (title, body, status, handle, authorId, extra = {}) => ({
  id: randomUUID(), title, body, status,
  author_id: authorId, author_handle: handle,
  vote_count: 0, duplicate_of: null, admin_note: '',
  created_at: now(), updated_at: now(), status_at: now(), ...extra,
})

const requests = [
  row('Deeper interactive timelines', 'Let a project story hold commits and decisions.', 'building', 'nova', ME),
  row('Private API key management', 'Keep keys out of every public surface.', 'planned', 'second', OTHER),
  row('Export timeline reports', 'A printable summary per project.', 'reviewing', 'stranger', OTHER),
  row('Dark mode for the planet HUD', 'The HUD is already dark; the text could be dimmer.', 'shipped', 'nova', ME, {
    admin_note: 'Shipped in the Second Dawn pass.',
  }),
  row('A second planet', 'Another world to walk.', 'not_now', 'other builder', OTHER, {
    admin_note: 'One world, done well, before a second.',
  }),
  // One duplicate, so the "+1 SAME" badge has real input and duplicates stay nested.
  row('timelines please', 'Same as the interactive timelines idea.', 'reviewing', 'someone else', OTHER, {
    duplicate_of: null,
  }),
]
requests[5].duplicate_of = requests[0].id

/** The only truth behind vote_count, exactly like the feature_votes table. */
const ballots = []
const tally = requestId => ballots.filter(b => b.request_id === requestId).length
ballots.push({ request_id: requests[1].id, user_id: OTHER, created_at: now() })
ballots.push({ request_id: requests[2].id, user_id: OTHER, created_at: now() })
ballots.push({ request_id: requests[3].id, user_id: OTHER, created_at: now() })
requests.forEach(r => { r.vote_count = tally(r.id) })

const body = req => new Promise(resolve => { let b = ''; req.on('data', d => { b += d }); req.on('end', () => resolve(b)) })

// ---------------------------------------------------------------------------
// PostgREST-shaped stub
//
// Answers the REST and auth paths and serves the built page from the very same
// origin, so the browser talks to the URL shape the app uses for real.
// ---------------------------------------------------------------------------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version, accept-profile, prefer, range, range-unit',
  'Access-Control-Expose-Headers': 'content-range, content-location, range, x-supabase-api-version',
  'Access-Control-Max-Age': '600',
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

async function serveStatic(pathname, res) {
  const file = join(dist, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''))
  const within = relative(dist, file)
  if (within.startsWith('..') || isAbsolute(within)) { res.writeHead(403, CORS); return res.end() }
  try {
    const data = await readFile(file)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', ...CORS })
    res.end(data)
  } catch {
    res.writeHead(404, CORS)
    res.end('not found')
  }
}

const apiLog = []
const server = createServer((req, res) => {
  handle(req, res).catch(error => {
    apiLog.push(`!! ${req.method} ${req.url} threw ${error && error.stack}`)
    try { res.writeHead(500, { 'Content-Type': 'application/json', ...CORS }); res.end(JSON.stringify({ message: String(error && error.message) })) } catch {}
  })
})

async function handle(req, res) {
  const url = new URL(req.url, origin)
  const method = req.method.toUpperCase()
  const isApi = url.pathname.startsWith('/rest/v1') || url.pathname.startsWith('/auth/v1')
  if (!isApi) return serveStatic(url.pathname, res)
  const path = url.pathname.replace('/rest/v1', '')
  apiLog.push(`${method} ${path}${url.search}`)
  if (method === 'OPTIONS') {
    clientRequests.push({ method, path, payload: null })
    res.writeHead(204, CORS)
    return res.end()
  }
  const wantsObject = String(req.headers.accept ?? '').includes('pgrst.object')

  const raw = await body(req)
  let payload = null
  if (method === 'POST' || method === 'PATCH') {
    try { payload = raw ? JSON.parse(raw) : {} } catch { payload = null }
  }

  const send = (status, value, headers = {}) => {
    clientRequests.push({ method, path, payload })
    res.writeHead(status, { 'Content-Type': 'application/json', ...CORS, ...headers })
    res.end(value === undefined ? '' : JSON.stringify(value))
  }
  const fail = (status, message) => send(status, { message })

  if ((method === 'POST' || method === 'PATCH') && payload === null) {
    return fail(400, `the body is not JSON: ${raw.slice(0, 120)}`)
  }

  /** PostgREST encodes a filter as `?column=eq.value`. */
  const eq = column => {
    for (const [key, value] of url.searchParams.entries()) {
      if (key === column && value.startsWith('eq.')) return value.slice(3)
    }
    return null
  }

  if (method === 'POST' && path === '/rpc/planet_access_status') {
    return send(200, { hasAccess: true, isAdmin: IS_ADMIN, unlockAt: now(), daysRemaining: 0 })
  }

  // auth-js may re-read the user behind a stored session. Same identity, no auth endpoint.
  if (path === '/auth/v1/user') {
    clientRequests.push({ method, path, payload })
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS })
    return res.end(JSON.stringify(sessionUser))
  }

  if (path === '/feature_requests') {
    const id = eq('id')

    if (method === 'GET') {
      // Duplicates come back too, exactly as they do from the real table: the
      // page is what hides them and counts them as "+N SAME".
      let out = requests
      if (id) out = requests.filter(r => r.id === id)
      const or = url.searchParams.get('or')
      if (or) {
        const word = or.match(/title\.ilike\.%([^%]*)%/)?.[1] ?? ''
        out = requests.filter(r => `${r.title} ${r.body}`.toLowerCase().includes(word.toLowerCase()))
      }
      out = [...out].sort((a, b) => b.vote_count - a.vote_count || new Date(b.created_at) - new Date(a.created_at))
      const limit = Number(url.searchParams.get('limit') ?? 0)
      if (limit) out = out.slice(0, limit)
      if (wantsObject) return out[0] ? send(200, out[0]) : fail(406, 'JSON object requested, multiple (or no) rows returned')
      return send(200, out)
    }

    if (method === 'POST') {
      // What the migration refuses, this stub refuses too.
      for (const column of ['vote_count', 'author_id', 'author_handle']) {
        if (payload[column] !== undefined) return fail(403, `only the database writes ${column}`)
      }
      if (typeof payload.title !== 'string' || payload.title.trim().length < 4 || payload.title.length > 120) {
        return fail(400, 'new row for relation "feature_requests" violates check constraint "feature_requests_title_check"')
      }
      const created = row(payload.title, payload.body ?? '', 'reviewing', 'nova', ME)
      requests.push(created)
      return wantsObject
        ? send(201, created, { 'Content-Location': `/feature_requests?id=eq.${created.id}` })
        : send(201, [created], { 'Content-Location': `/feature_requests?id=eq.${created.id}` })
    }

    if (method === 'PATCH') {
      const target = requests.find(r => r.id === id)
      if (!target) return send(204, undefined)
      for (const column of ['vote_count', 'author_id', 'author_handle']) {
        if (payload[column] !== undefined) {
          return fail(403, "Only a Reboot admin can change a suggestion's status, grouping or reply")
        }
      }
      if (payload.status && !['reviewing', 'planned', 'building', 'shipped', 'not_now'].includes(payload.status)) {
        return fail(400, 'new row violates check constraint "feature_requests_status_check"')
      }
      if (payload.status) payload.status_at = now()
      Object.assign(target, payload, { updated_at: now() })
      return send(204, undefined)
    }

    if (method === 'DELETE') {
      const target = requests.find(r => r.id === id)
      if (!target) return send(204, undefined)
      if (target.author_id !== ME && !IS_ADMIN) return fail(403, 'Only a Reboot admin can remove this suggestion')
      if (target.author_id === ME && target.status !== 'reviewing') {
        return fail(403, 'An admin has already acted on this suggestion, so only an admin can remove it')
      }
      requests.splice(requests.indexOf(target), 1)
      ballots.filter(b => b.request_id === target.id).forEach(b => ballots.splice(ballots.indexOf(b), 1))
      requests.forEach(r => { r.vote_count = tally(r.id) })
      return send(204, undefined)
    }
  }

  if (path === '/feature_votes') {
    const requestId = eq('request_id')

    if (method === 'GET') return send(200, ballots.filter(b => b.user_id === ME))
    if (method === 'POST') {
      if (payload.user_id !== undefined && payload.user_id !== ME) return fail(403, 'votes are stamped by the database')
      if (ballots.some(b => b.request_id === payload.request_id && b.user_id === ME)) {
        return fail(409, 'duplicate key value violates unique constraint "feature_votes_pkey"')
      }
      ballots.push({ request_id: payload.request_id, user_id: ME, created_at: now() })
      requests.forEach(r => { r.vote_count = tally(r.id) })
      return send(201, undefined)
    }
    if (method === 'DELETE') {
      ballots
        .filter(b => (!requestId || b.request_id === requestId) && b.user_id === ME)
        .forEach(b => ballots.splice(ballots.indexOf(b), 1))
      requests.forEach(r => { r.vote_count = tally(r.id) })
      return send(204, undefined)
    }
  }

  // Everything else the app asks for (the archive, profiles, tags) comes back
  // empty, so this check cannot lean on data it did not seed.
  if (method === 'GET') return send(200, wantsObject ? {} : [])
  return send(204, undefined)
}

let chrome, ws
const output = []
async function untilHttp(target) {
  const start = Date.now()
  while (Date.now() - start < 60000) { try { const r = await fetch(target); if (r.ok) return await r.text() } catch {} await delay(150) }
  throw new Error(`Unavailable: ${target}\n${output.join('')}`)
}

try {
  await new Promise(r => server.listen(apiPort, '127.0.0.1', r))

  // Backend URLs embedded in the owner's bundle are intercepted below; only
  // loopback requests are forwarded to this stub, regardless of build config.
  await untilHttp(`${origin}/`)

  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', `--remote-debugging-port=${cdp}`, `--user-data-dir=${profile}`, '--window-size=1440,1000', '--no-first-run', '--no-default-browser-check', 'about:blank'],
    { stdio: 'ignore' })
  await untilHttp(`http://127.0.0.1:${cdp}/json/version`)
  const targets = JSON.parse(await untilHttp(`http://127.0.0.1:${cdp}/json/list`))
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  const pending = new Map(); let seq = 0
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data)
    if (m.id) {
      const t = pending.get(m.id); pending.delete(m.id)
      m.error ? t?.reject(protocolError(m.error)) : t?.resolve(m.result)
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '))
  })
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject, label: `${method} ${String(params.expression ?? '').slice(0, 120)}` })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
  const wait = async (expression, ms = 30000) => {
    if (await waitForReady(evaluate, expression, ms)) return
    throw new Error(`Timed out: ${expression}\n${await evaluate("document.body?.innerText.slice(0,1200) ?? '<document not ready>'")}`)
  }
  // Frames are captured from the same run that asserts the contract, so a
  // screenshot can never show a state the assertions did not check.
  const captured = []
  const shot = async name => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(shotsDir, name), Buffer.from(data, 'base64'))
    captured.push(name)
  }
  async function pointerClick(expression) {
    await wait(`(()=>{const el=${expression};if(!el||el.disabled)return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0})()`)
    // Nonzero dimensions do not imply a clickable point: the board scrolls in
    // an overflow container, especially after opening the composer/decision panel.
    await evaluate(`(${expression}).scrollIntoView({block:'center', inline:'nearest', behavior:'instant'})`)
    await wait(`(()=>{const el=${expression};if(!el||el.disabled)return false;const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!hit&&el.contains(hit)})()`)
    const p = await evaluate(`(()=>{const el=${expression};const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...p })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...p })
  }
  const textClick = text => pointerClick(`[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.getBoundingClientRect().width>0&&b.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))`)
  const typeInto = async (elementExpr, value) => {
    await wait(`(()=>{const el=${elementExpr};return !!el && el.getBoundingClientRect().width>0})()`)
    await pointerClick(`(${elementExpr})`)
    await send('Input.insertText', { text: value })
  }

  // Card-scoped selectors, keyed on the suggestion title.
  const card = t => `[...document.querySelectorAll('[data-request-id]')].find(d=>d.querySelector('h3')?.textContent===${JSON.stringify(t)})`
  const votePill = t => `(${card(t)})?.querySelector('button[aria-pressed]')`
  const inCard = (t, selector) => `(${card(t)})?.querySelector(${JSON.stringify(selector)})`
  const pillCount = async t => {
    const text = await evaluate(`(${votePill(t)})?.innerText.replace(/\\s+/g,' ').trim()`)
    return text === undefined || text === null ? null : Number(String(text).match(/\d+/)?.[0])
  }
  const pillState = t => evaluate(`(${votePill(t)})?.getAttribute('aria-pressed')`)

  const jwt = o => Buffer.from(JSON.stringify(o)).toString('base64url')
  const expiresAt = Math.floor(Date.now() / 1000) + 86400 * 30
  const accessToken = `${jwt({ alg: 'HS256', typ: 'JWT' })}.${jwt({ sub: ME, role: 'authenticated', exp: expiresAt })}.stub`
  const session = {
    access_token: accessToken, token: accessToken, refresh_token: 'stub-refresh',
    token_type: 'bearer', expires_in: 86400 * 30, expires_at: expiresAt, user: sessionUser,
  }

  // The session is served from web storage on read, so the app believes it is
  // signed in without an auth endpoint. supabase-js keeps the session and the
  // user under separate keys, so both are answered here. Flip the harness flag
  // to "1" and the same build runs as a visitor instead.
  const fixture = `
    const rawGet = Storage.prototype.getItem;
    const session = ${JSON.stringify(session)};
    const sessionUser = ${JSON.stringify(sessionUser)};
    const isGuest = () => rawGet.call(window.localStorage, '__harness_guest') === '1';
    Storage.prototype.getItem = function (k) {
      if (isGuest()) return rawGet.call(this, k);
      if (/-auth-token-user$/.test(k)) return JSON.stringify({ user: sessionUser });
      if (/-auth-token$/.test(k)) return JSON.stringify(session);
      return rawGet.call(this, k);
    };
    const rawSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (/-auth-token/.test(k) && !isGuest()) return;
      return rawSet.call(this, k, v);
    };
    localStorage.setItem('reboot-reduced-effects','false');
    localStorage.setItem('reboot-second-dawn-tutorial-v1','complete');localStorage.setItem('reboot-intro-v1','seen');;
  `
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fixture })

  const observed = []
  await installFixtureNetwork({ ws, send, origin, errors, respond: async (request, url) => {
    if (!/^\/(rest|auth)\/v1\//.test(url.pathname)) return null
    if (request.method === 'OPTIONS') return { status: 204 }
    const payload = request.postData ? JSON.parse(request.postData) : undefined
    observed.push({ method: request.method, path: url.pathname.replace('/rest/v1', ''), body: payload })
    // Never forward to request.url: the only destination is our loopback stub.
    const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) =>
      ['accept', 'content-type', 'prefer', 'range', 'range-unit'].includes(name.toLowerCase())))
    const response = await fetch(`${origin}${url.pathname}${url.search}`, {
      method: request.method, headers, body: request.postData, redirect: 'error',
    })
    return { status: response.status, body: await response.text(), headers: { 'Content-Range': response.headers.get('content-range') ?? '*/0' } }
  } })
  const sent = () => structuredClone(observed)
  const clear = () => { observed.length = 0 }
  const openBoard = async () => {
    await wait(`[...document.querySelectorAll('.rail-icon')].some(b=>b.querySelector('svg.lucide-megaphone'))`)
    await pointerClick(`[...document.querySelectorAll('.rail-icon')].find(b=>b.querySelector('svg.lucide-megaphone'))`)
    await wait(`document.body.innerText.includes('Feedback & Roadmap')`)
    await wait(`document.body.innerText.includes('Deeper interactive timelines')`)
  }

  // ── signed-in pass ────────────────────────────────────────────────────────
  await send('Page.navigate', { url: origin })
  await openBoard()
  await wait(`!!document.querySelector('button[data-decide]')`)

  const renders = {
    cards: await evaluate(`[...document.querySelectorAll('[data-request-id] h3')].map(h=>h.textContent)`),
    ordered: await evaluate(`[...document.querySelectorAll('[data-request-id] h3')].map(h=>h.textContent)`),
    duplicateBadge: await evaluate(`document.body.innerText.includes('+1 SAME')`),
    zeroBadgeShown: await evaluate(`document.body.innerText.includes('+0 SAME')`),
    adminReply: await evaluate(`document.body.innerText.includes('Shipped in the Second Dawn pass.')`),
    statusChips: await evaluate(`[...document.querySelectorAll('[data-request-id] h3 + span')].map(s=>s.textContent)`),
    signedInAs: await evaluate(`document.body.innerText.includes('nova')`),
  }

  // 1. Vote, then withdraw.
  await clear()
  await pointerClick(votePill('Export timeline reports'))
  await wait(`(${votePill('Export timeline reports')})?.getAttribute('aria-pressed')==='true' && (${votePill('Export timeline reports')})?.disabled === false`)
  const voted = await sent()
  const countAfterVote = await pillCount('Export timeline reports')
  const mineAfterVote = await pillState('Export timeline reports')

  await clear()
  await pointerClick(votePill('Export timeline reports'))
  await wait(`(${votePill('Export timeline reports')})?.getAttribute('aria-pressed')==='false' && (${votePill('Export timeline reports')})?.disabled === false`)
  const withdrew = await sent()
  const countAfterWithdraw = await pillCount('Export timeline reports')

  // 2. Search before posting is enforced by the form, not by a slogan.
  await clear()
  await textClick('Suggest something')
  await wait(`document.body.innerText.includes('NEW SUGGESTION')`)
  const postDisabledAtFirst = await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Post suggestion')?.disabled`)
  await typeInto(`document.querySelector('input[placeholder^="Search existing suggestions"]')`, 'timelines')
  const postAfterTypingOnly = await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Post suggestion')?.disabled`)
  await textClick('Search first')
  await wait(`document.body.innerText.includes('ALREADY ON THE BOARD')`)
  await shot('board-search-before-post.png')
  await typeInto(`document.querySelector('input[placeholder^="What should Reboot do?"]')`, 'Bulk export the archive')
  await typeInto(`document.querySelector('textarea[placeholder^="Why it matters"]')`, 'One click to take every story with me.')
  await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Post suggestion'&&!b.disabled)`)
  await textClick('Post suggestion')
  await wait(`document.body.innerText.includes('Bulk export the archive')`)
  await delay(300)
  const posted = await sent()
  const postedCard = await evaluate(`!!(${card('Bulk export the archive')})`)
  const postedHandle = await evaluate(`(${card('Bulk export the archive')})?.innerText.includes('nova')`)

  // 3. The owner decision writes status and reply, nothing else. The card is
  //    picked while it is still REVIEWING so the status change is observable.
  await clear()
  const target = 'Export timeline reports'
  await pointerClick(inCard(target, 'button[data-decide]'))
  await wait(`!!(${inCard(target, 'div[data-decide-panel]')})`)
  await typeInto(inCard(target, 'textarea'), 'Local harness decision.')
  await shot('board-owner-decision.png')
  await pointerClick(`(${inCard(target, 'div[data-decide-panel]')})?.querySelector('button[data-status="planned"]')`)
  await wait(`(${card(target)})?.querySelector('h3 + span')?.textContent === 'PLANNED' && !(${inCard(target, 'div[data-decide-panel]')})`)
  const decided = await sent()
  const statusNow = await evaluate(`(${card(target)})?.querySelector('h3 + span')?.textContent`)
  await shot('board-requests-after-decision.png')

  // 3b. Withdrawing a suggestion is two steps, and only the second one writes.
  await clear()
  await pointerClick(inCard('Bulk export the archive', 'button[aria-label="Withdraw your suggestion"]'))
  await wait(`(${card('Bulk export the archive')})?.innerText.includes('This cannot be undone')`)
  await pointerClick(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='KEEP')`)
  await delay(300)
  const kept = await sent()
  const keptStillThere = await evaluate(`!!(${card('Bulk export the archive')})`)

  await clear()
  await pointerClick(inCard('Bulk export the archive', 'button[aria-label="Withdraw your suggestion"]'))
  await pointerClick(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='DELETE')`)
  await wait(`!(${card('Bulk export the archive')})`)
  await delay(300)
  const deleted = await sent()

  // 4. Roadmap tab groups every status.
  await textClick('Public roadmap')
  await wait(`document.body.innerText.includes('WHAT EACH STATUS MEANS')`)
  const roadmap = await evaluate(`document.body.innerText`)
  await shot('board-roadmap.png')

  // ── visitor pass: the same build, no session, no writes ───────────────────
  await evaluate(`localStorage.setItem('__harness_guest','1')`)
  await send('Page.navigate', { url: origin })
  await textClick('CONTINUE AS GHOST')
  await openBoard()
  const guestCanRead = await evaluate(`document.body.innerText.includes('Export timeline reports')`)
  const guestCounts = await evaluate(`[...document.querySelectorAll('[data-request-id] button[aria-pressed]')].map(b=>b.getAttribute('aria-pressed'))`)
  await clear()
  await textClick('Suggest something')
  await wait(`document.body.innerText.includes('RESTRICTED::ARCHIVE WRITE')`)
  const guestSuggest = await sent()
  const suggestGateCopy = await evaluate(`document.body.innerText.includes('THE ROADMAP IS BUILT WITH MEMBERS')`)
  await shot('board-guest-gate.png')
  // Close through the panel's own accessible label. A text match on "not now"
  // would hit the NOT NOW status filter chip first.
  await pointerClick(`document.querySelector('button[aria-label="Close account panel"]')`)
  await wait(`!document.body.innerText.includes('RESTRICTED::ARCHIVE WRITE')`)
  await clear()
  await pointerClick(votePill('Deeper interactive timelines'))
  await delay(500)
  const guestVote = await sent()
  const voteGateCopy = await evaluate(`document.body.innerText.includes('VOTES NEED AN ACCOUNT')`)

  const all = [...voted, ...withdrew, ...posted, ...decided, ...kept, ...deleted]
  const writes = all.filter(r => r.method !== 'GET')
  const bodies = all.filter(r => r.body).map(r => r.body)

  const summary = {
    apiPort, origin, renders,
    vote: {
      requests: voted.map(r => `${r.method} ${r.path}`),
      countAfterVote, mineAfterVote,
      withdrew: withdrew.map(r => `${r.method} ${r.path}`),
      countAfterWithdraw,
    },
    composer: {
      postDisabledAtFirst, postAfterTypingOnly,
      requests: posted.map(r => `${r.method} ${r.path}`),
      insertBody: posted.find(r => r.method === 'POST')?.body,
      postedCard, postedHandle,
    },
    admin: {
      requests: decided.map(r => `${r.method} ${r.path}`),
      patchBody: decided.find(r => r.method === 'PATCH')?.body,
      statusNow,
    },
    withdraw: {
      keepRequests: kept.map(r => `${r.method} ${r.path}`),
      keptStillThere,
      deleteRequests: deleted.filter(r => r.method !== 'GET').map(r => `${r.method} ${r.path}`),
    },
    roadmap: {
      hasLegend: roadmap.includes('WHAT EACH STATUS MEANS'),
      noPromiseRule: roadmap.includes('the most-voted idea is not automatically the next build'),
      everyColumn: ['BUILDING', 'PLANNED', 'SHIPPED', 'REVIEWING', 'NOT NOW'].every(s => roadmap.includes(s)),
    },
    guest: {
      canRead: guestCanRead,
      everyPillUnpressed: guestCounts.length === 5 && guestCounts.every(v => v === 'false'),
      suggestSentNoWrites: guestSuggest.every(r => r.method === 'GET'),
      suggestGateCopy,
      voteSentNoWrites: guestVote.every(r => r.method === 'GET'),
      voteGateCopy,
    },
    screenshots: captured,
    neverSendsWhatTheDatabaseOwns: !bodies.some(b => b.vote_count !== undefined || b.author_id !== undefined || b.author_handle !== undefined || b.user_id !== undefined),
    writesStayOnTheBoard: writes.every(r => ['/feature_requests', '/feature_votes'].includes(r.path)),
    apiLog,
    errors,
  }
  console.log(JSON.stringify(summary, null, 2))

  assert.equal(renders.cards.length, 5, 'top-level suggestions only; duplicates nest under their target')
  assert.equal(renders.duplicateBadge, true, 'a merged duplicate is visible as +1 SAME')
  assert.equal(renders.zeroBadgeShown, false, 'a zero duplicate badge is noise, not information')
  assert.equal(renders.adminReply, true, 'the owner reply renders on the card it answers')

  assert.equal(countAfterVote, 2, 'a fresh vote lands on the counted total')
  assert.equal(mineAfterVote, 'true', 'the pill knows it is mine')
  assert.deepEqual(voted.filter(r => r.method !== 'GET').map(r => `${r.method} ${r.path}`), ['POST /feature_votes'], 'voting touches the vote table only')
  assert.ok(voted.some(r => r.method === 'GET' && r.path === '/feature_requests'), 'the total is re-read from the database')
  assert.equal(countAfterWithdraw, 1, 'withdrawing lands back')
  assert.deepEqual(withdrew.filter(r => r.method !== 'GET').map(r => `${r.method} ${r.path}`), ['DELETE /feature_votes'], 'withdraw deletes the vote row')

  assert.equal(postDisabledAtFirst, true, 'the composer cannot post before the board was searched')
  assert.equal(postAfterTypingOnly, true, 'typing a suggestion does not unlock posting either')
  assert.deepEqual(Object.keys(summary.composer.insertBody).sort(), ['body', 'title'], 'only the text travels on insert')
  assert.equal(postedCard, true, 'the new suggestion appears without a reload')
  assert.equal(postedHandle, true, 'the stamped handle comes back from the database')

  assert.deepEqual(Object.keys(summary.admin.patchBody).sort(), ['admin_note', 'status'], 'a decision writes status and reply')
  assert.equal(statusNow, 'PLANNED', 'the new status is on screen')

  assert.deepEqual(summary.withdraw.keepRequests.filter(r => !r.startsWith('GET')), [], 'backing out of a withdrawal writes nothing')
  assert.equal(keptStillThere, true, 'KEEP leaves the suggestion on the board')
  assert.deepEqual(summary.withdraw.deleteRequests, ['DELETE /feature_requests'], 'confirming deletes the row and nothing else')

  assert.equal(summary.roadmap.hasLegend, true, 'the status legend is on the roadmap tab')
  assert.equal(summary.roadmap.noPromiseRule, true, 'the no-promise rule stays visible')
  assert.equal(summary.roadmap.everyColumn, true, 'every status column renders, empty ones included')

  assert.equal(guestCanRead, true, 'a visitor reads the whole board')
  assert.equal(summary.guest.everyPillUnpressed, true, 'a visitor sees nobody else ballots')
  assert.equal(summary.guest.suggestSentNoWrites, true, 'a visitor suggestion attempt sends nothing')
  assert.equal(summary.guest.suggestGateCopy, true, 'the gate explains why posting needs an account')
  assert.equal(summary.guest.voteSentNoWrites, true, 'a visitor vote attempt sends nothing')
  assert.equal(summary.guest.voteGateCopy, true, 'the vote gate explains itself')

  assert.equal(summary.neverSendsWhatTheDatabaseOwns, true, 'the browser never sends a total, an author or a voter id')
  assert.equal(summary.writesStayOnTheBoard, true, 'nothing else on the page writes')
  assert.deepEqual(errors, [], 'no browser errors')
} catch (error) {
  console.error(error.stack)
  console.error('Browser errors:', JSON.stringify(errors))
  console.error('API log:', JSON.stringify(apiLog, null, 1))
  console.error('Vite/build output:', output.join('').slice(-2000))
  process.exitCode = 1
} finally {
  ws?.close()
  for (const h of [chrome]) if (h?.pid) { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(h.pid), '/T', '/F'], { stdio: 'ignore' }); else h.kill('SIGTERM') }
  server.close()
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {})
}
