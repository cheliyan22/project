// Guest gating check: signed-out visitors must be routed to the account panel for
// publish/comment/revive, and must still be able to bump counters. Local fixture only,
// no live account and no remote writes.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = dirname(fileURLToPath(import.meta.url)), port = 4180, cdp = 9228
const profile = await mkdtemp(join(tmpdir(), 'reboot-guest-gate-'))
const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe' })
const delay = ms => new Promise(r => setTimeout(r, ms)), errors = [], logs = []
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
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id) { const t = pending.get(m.id); pending.delete(m.id); m.error ? t?.reject(new Error(JSON.stringify(m.error))) : t?.resolve(m.result) } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ')) })
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }) })
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value }
  const wait = async (expression, ms = 60000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await evaluate(expression)) return; await delay(120) } throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText.slice(0,1500)')}`) }
  async function pointerClick(expression) {
    await wait(`(()=>{const el=${expression};if(!el||el.disabled)return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&!el.closest('[inert]')})()`)
    const p = await evaluate(`(()=>{const el=${expression};const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...p })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...p })
  }
  const textClick = text => pointerClick(`[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.getBoundingClientRect().width>0&&b.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))`)
  // `elementExpr` is a JavaScript expression that evaluates to the target element.
  const typeInto = async (elementExpr, value) => {
    await wait(`(()=>{const el=${elementExpr};return !!el && el.getBoundingClientRect().width>0})()`)
    await pointerClick(`(${elementExpr})`)
    await send('Input.insertText', { text: value })
  }

  // One clearly-labelled local idea row so the story modal has something to open.
  const fixture = `
    const TEST_TITLE='LOCAL FIXTURE PROJECT';
    const idea={id:'22222222-2222-4222-8222-222222222222',title:TEST_TITLE,slug:'local-fixture',short_desc:'local test row',description:'',failure_story:'',last_words:'',why_died:'',almost_worked:'',category:'apps',status:'abandoned',potential_score:3,revival_score:3,difficulty:'Medium',tech_stack:[],creator_name:'LOCAL TEST',is_anonymous:false,views:0,upvotes:7,revival_count:0,contributor_count:0,ai_analyzed:false,ai_summary:'',ai_strengths:[],ai_weaknesses:[],ai_market:'',ai_roadmap:[],ai_tech_stack:[],ai_monetization:'',commits_count:0,users_count:0,revenue_made:0,months_built:0,failure_emotion:'',surviving_assets:[],almost_made_it:false,almost_milestones:[],founder_update:'',letter_to_founder:'',skills_required:[],created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'};
    const nativeFetch=window.fetch.bind(window);
    window.__writes=[];
    window.fetch=async(input,init)=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.hostname.endsWith('.supabase.co')){
        const method=((typeof init==='object'&&init?.method)||'GET').toUpperCase();
        window.__writes.push({method,path:url.pathname});
        if(method==='GET'&&url.pathname.endsWith('/ideas'))return new Response(JSON.stringify([idea]),{status:200,headers:{'Content-Type':'application/json','Content-Range':'0-0/1'}});
        if(method==='GET')return new Response(JSON.stringify([]),{status:200,headers:{'Content-Type':'application/json','Content-Range':'0-0/0'}});
        return new Response(JSON.stringify({message:'LOCAL FIXTURE: remote writes are blocked here'}),{status:403,headers:{'Content-Type':'application/json'}});
      }
      return nativeFetch(input,init);
    };
    localStorage.setItem('reboot-reduced-effects','false');
    localStorage.setItem('reboot-second-dawn-tutorial-v1','complete');
    localStorage.setItem('reboot-intro-v1','seen');
  `
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fixture })
  await send('Page.navigate', { url: `http://127.0.0.1:${port}` })

  const writes = () => evaluate('window.__writes.slice()')
  const clearWrites = () => evaluate('window.__writes.length=0')
  const panelOpen = () => evaluate(`document.body.innerText.includes('RESTRICTED::ARCHIVE WRITE')`)
  const closePanel = () => pointerClick(`[...document.querySelectorAll('button')].find(b=>/not now/i.test(b.textContent))`)

  await textClick('CONTINUE AS GHOST')
  await wait(`document.body.innerText.includes('LOCAL FIXTURE PROJECT')`)
  assert.equal(await panelOpen(), false, 'panel is closed on arrival')

  const gated = {}

  // 1. Publish
  await clearWrites()
  await textClick('Publish Idea')
  await wait(`document.body.innerText.includes('RESTRICTED::ARCHIVE WRITE')`)
  assert.match(await evaluate(`[...document.querySelectorAll('h2')].map(h=>h.textContent).join('|')`), /JOIN THE GRAVEYARD|WELCOME BACK/)
  gated.publish = { panelOpened: await panelOpen(), attemptedWrites: await writes() }
  await closePanel()
  await wait(`!document.body.innerText.includes('RESTRICTED::ARCHIVE WRITE')`)

  // 2. Comment — the featured card's real CTA is "Examine".
  await textClick('Examine')
  await wait(`document.body.innerText.includes('COMMENTS')`)
  await clearWrites()
  await typeInto(`document.querySelector('input[placeholder="Leave a comment..."]')`, 'local fixture comment')
  await pointerClick(`document.querySelector('form button[type="submit"]')`)
  await wait(`document.body.innerText.includes('RESTRICTED::ARCHIVE WRITE')`)
  gated.comment = { panelOpened: await panelOpen(), attemptedWrites: await writes() }
  await closePanel()

  // 3. Revive — click the modal tab by its exact label.
  await pointerClick(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='REVIVE'&&b.getBoundingClientRect().width>0)`)
  await wait(`!!document.querySelector('input[type="email"]')`)
  await clearWrites()
  const reviveFields = await evaluate(`[...document.querySelectorAll('input.input,textarea.input')].map(el=>el.placeholder)`)
  for (const [index, value] of [[0, 'Local Tester'], [1, 'local@example.invalid'], [2, 'local fixture pitch'], [3, 'local fixture plan']]) {
    if (reviveFields[index] !== undefined) await typeInto(`[...document.querySelectorAll('input.input,textarea.input')][${index}]`, value)
  }
  await pointerClick(`[...document.querySelectorAll('button')].find(b=>/signal revival/i.test(b.textContent)&&!b.disabled)`)
  await wait(`document.body.innerText.includes('RESTRICTED::ARCHIVE WRITE')`)
  gated.revive = { panelOpened: await panelOpen(), attemptedWrites: await writes() }
  await closePanel()

  // 4. Ghost counters must still reach the database. Opening a project fires the
  // views PATCH; the modal's ThumbsUp fires the upvotes PATCH.
  await send('Page.navigate', { url: `http://127.0.0.1:${port}` })
  await textClick('CONTINUE AS GHOST')
  await wait(`document.body.innerText.includes('LOCAL FIXTURE PROJECT')`)
  await clearWrites()
  await textClick('Examine')
  await wait(`document.body.innerText.includes('COMMENTS')`)
  await delay(700)
  const afterOpen = await writes()
  await pointerClick(`[...document.querySelectorAll('button')].find(b=>b.querySelector('svg.lucide-thumbs-up'))`)
  await delay(900)
  const counters = await writes()
  gated.counterBump = { afterOpen, afterUpvote: counters }

  const patchToIdeas = rows => rows.some(w => w.path.endsWith('/ideas') && w.method === 'PATCH')

  const summary = {
    port,
    gated,
    noAnonymousWritesAnywhere: [...gated.publish.attemptedWrites, ...gated.comment.attemptedWrites, ...gated.revive.attemptedWrites].length === 0,
    counterPathStillLive: patchToIdeas(counters),
    viewsCounterLive: patchToIdeas(afterOpen),
    errors,
  }
  console.log(JSON.stringify(summary, null, 2))

  assert.equal(summary.noAnonymousWritesAnywhere, true, 'gated actions must not fire a request')
  assert.equal(summary.counterPathStillLive, true, 'ghost counter bump must still be attempted')
  assert.equal(summary.viewsCounterLive, true, 'opening a project must still record a view')
  assert.deepEqual(errors, [], 'no browser errors')
} catch (error) {
  console.error(error.stack); console.error('Browser errors:', JSON.stringify(errors)); process.exitCode = 1
} finally {
  ws?.close()
  for (const h of [chrome, server]) if (h?.pid) { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(h.pid), '/T', '/F'], { stdio: 'ignore' }); else h.kill('SIGTERM') }
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(() => {})
}
