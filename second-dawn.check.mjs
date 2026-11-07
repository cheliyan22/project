// Real-entry browser smoke check. No production bypass or remote database writes.
// Usage: node second-dawn.check.mjs dev|production
// Uses a separate temporary Chrome profile and LOCAL, explicitly labeled auth/RPC fixtures.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root=dirname(fileURLToPath(import.meta.url))
const production=process.argv[2]==='production'
const port=production?4177:5177
const base=`http://127.0.0.1:${port}`
const profile=await mkdtemp(join(tmpdir(),'reboot-dawn-ui-'))
const out=join(root,'../screenshots',process.env.DAWN_OUT_DIR||'')
await mkdir(out,{recursive:true})
const chromePath=process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const logs=[], errors=[], checks=[]
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const server=spawn(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),...(production?['preview']:[]),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'pipe'})
server.stdout.on('data',d=>logs.push(String(d)))
server.stderr.on('data',d=>logs.push(String(d)))
let chrome,ws
async function untilHttp(url) {
  const start=Date.now()
  while(Date.now()-start<30000) {try { const r=await fetch(url);if(r.ok)return await r.text() }catch{} await delay(150)}
  throw new Error(`Server unavailable: ${url}\n${logs.join('')}`)
}
try {
  await untilHttp(base)
  chrome=spawn(chromePath,['--headless=new','--remote-debugging-port=9225',`--user-data-dir=${profile}`,'--window-size=1440,960',...(process.env.DAWN_SOFTWARE_RENDERING==='1'?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]),'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion','about:blank'],{stdio:'ignore'})
  await untilHttp('http://127.0.0.1:9225/json/version')
  const targets=JSON.parse(await untilHttp('http://127.0.0.1:9225/json/list'))
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl)
  const pending=new Map();let sequence=0
  ws.addEventListener('message',e=>{
    const msg=JSON.parse(e.data)
    if(msg.id){const task=pending.get(msg.id);pending.delete(msg.id);if(msg.error)task?.reject(new Error(JSON.stringify(msg.error)));else task?.resolve(msg.result)}
    if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text)
    if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error')errors.push(msg.params.args.map(a=>a.value??a.description??'').join(' '))
  })
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})
  const evaluate=async expression=>{
    const response=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
    if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
    return response.result.value
  }
  const wait=async(expression,ms=90000)=>{
    const start=Date.now()
    while(Date.now()-start<ms){
      if(await evaluate(expression))return
      await delay(150)
    }
    await screenshot('failure')
    throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText.slice(-2400)')}\n${JSON.stringify(await evaluate(`(async()=>({ready:document.readyState,root:document.getElementById('root')?.innerHTML.slice(0,900),buttons:[...document.querySelectorAll('button')].map(b=>({text:b.textContent,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height,disabled:b.disabled,inert:!!b.closest('[inert]')})),requests:window.__DAWN_TEST__?.requests,locks:await navigator.locks.query()}))()`))}`)
  }
  const pointerClick=async(expression)=>{
    await wait(`(() => { const el=${expression}; if(!el || el.disabled) return false; const r=el.getBoundingClientRect(); return r.width>0 && r.height>0 && !el.closest('[inert]') })()`)
    const point=await evaluate(`(() => { const el=${expression}; el.scrollIntoView({block:'nearest',inline:'nearest'}); const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`)
    assert.ok(await evaluate(`(() => { const el=${expression}; const hit=document.elementFromPoint(${point.x},${point.y}); return el===hit || el.contains(hit) })()`),`Control is obscured: ${expression}`)
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point})
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point})
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})
  }
  const click=selector=>pointerClick(`document.querySelector(${JSON.stringify(selector)})`)
  const textClick=text=>pointerClick(`[...document.querySelectorAll('button')].find(b=>!b.disabled && b.getBoundingClientRect().width>0 && b.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))`)
  const screenshot=async(name)=>{const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});await writeFile(join(out,`second-dawn-${production?'prod':'dev'}-${name}.png`),Buffer.from(shot.data,'base64'))}
  await send('Page.enable');await send('Runtime.enable')
  await send('Page.bringToFront')
  await send('Emulation.setFocusEmulationEnabled',{enabled:true})
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  // Block remote data even for guest checks. All fixtures are empty, not invented community content.
  const fixture=`
    window.__DAWN_TEST__={requests:[],mode:'guest'};
    const nativeFetch=window.fetch.bind(window);
    const testUser={id:'11111111-1111-4111-8111-111111111111',email:'ui-test@example.invalid',aud:'authenticated',role:'authenticated',created_at:'2020-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{username:'LOCAL UI TEST'}};
    window.fetch=async(input,init)=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(!url.hostname.endsWith('.supabase.co'))return nativeFetch(input,init);
      window.__DAWN_TEST__.requests.push(url.pathname);
      let data=[];let status=200;
      if(url.pathname.includes('/auth/v1/user'))data=testUser;
      else if(url.pathname.endsWith('/planet_access_status'))data=window.__DAWN_TEST__.mode==='locked'?{hasAccess:false,isAdmin:false,daysRemaining:12,unlockAt:'2026-11-09T00:00:00Z'}:{hasAccess:true,isAdmin:true,daysRemaining:0};
      else if(url.pathname.endsWith('/wallet_state'))data={balance:0,recentTransactions:[]};
      else if(url.pathname.includes('/rpc/')){data={message:'Local UI test: server writes are blocked'};status=403;}
      return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Content-Range':'0-0/0'}});
    };
    window.__seedTestSession=()=>{
      const payload=btoa(JSON.stringify({sub:testUser.id,exp:Math.floor(Date.now()/1000)+36000}));
      const session={access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.LOCAL_TEST_ONLY',refresh_token:'LOCAL_TEST_ONLY',token_type:'bearer',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,user:testUser};
      ['local-placeholder','vsddqasvaesndomdfnrf','qctppiuemwuamhnlmcgm'].forEach(ref=>localStorage.setItem('sb-'+ref+'-auth-token',JSON.stringify(session)));
    };
    localStorage.setItem('reboot-reduced-effects','true');localStorage.setItem('reboot-intro-v1','seen');;
    window.addEventListener('DOMContentLoaded',()=>{const label=document.createElement('div');label.textContent='LOCAL UI TEST · EMPTY DATA FIXTURE · NO LIVE ACCOUNT';label.style.cssText='position:fixed;top:0;left:50%;transform:translateX(-50%);font:8px monospace;letter-spacing:1px;background:#513b17;color:#ffe4ae;padding:5px 10px;z-index:999999;pointer-events:none';document.body.append(label)});
  `
  const injection=await send('Page.addScriptToEvaluateOnNewDocument',{source:fixture})
  await send('Page.navigate',{url:base})
  await textClick('CONTINUE AS GHOST')
  await textClick('Reboot Planet')
  await wait(`document.querySelector('.dawn-access canvas')?.dataset.previewReady==='true'`)
  assert.match(await evaluate('document.body.innerText'),/Sign in through Reboot/)
  checks.push('Cold guest entry renders orbital preview and preserves account gate')
  await screenshot('guest')
  await evaluate('window.__seedTestSession()')
  await send('Page.reload',{ignoreCache:true})
  await textClick('Reboot Planet')
  await wait(`!!document.querySelector('.dawn-intro')`)
  await screenshot('introduction')
  await wait(`!!document.querySelector('.descent-launch:not(:disabled)')`)
  assert.ok(await evaluate(`document.body.innerText.includes('Take the planet for a spin.')`))
  checks.push('Authorized fixture cold-starts real App and completes introduction')
  await screenshot('orbit')
  await textClick('Got it')
  await click('.orbital-districts button:nth-child(2)')
  assert.match(await evaluate(`document.querySelector('.descent-card').innerText`),/Gaming City/)
  await click('.descent-launch')
  await wait(`document.querySelector('.dawn-world')?.dataset.travelPhase==='arriving' && Number(document.querySelector('.portal-veil').style.opacity)<.15`)
  await screenshot('descent')
  await wait(`document.querySelector('.dawn-world')?.dataset.travelPhase==='idle'`)
  await screenshot('city-overview')
  assert.equal(await evaluate(`document.querySelector('.dawn-world').dataset.city`),'Gaming')
  assert.ok(await evaluate(`document.body.innerText.includes('Every city has a heart.')`))
  checks.push('District selection and readiness-gated descent arrive without resetting the world')
  await textClick('Frame the landmark')
  await wait(`document.body.innerText.includes('Now get off the map.')`)
  await screenshot('city')
  await textClick('Enter walking mode')
  await wait(`document.querySelector('.dawn-world')?.dataset.exploring==='true'`)
  await wait(`!!document.querySelector('.exploration-hud') && !!document.querySelector('canvas')?.dataset.playerPosition`)
  const beforeWalk=await evaluate(`document.querySelector('canvas').dataset.playerPosition.split(',').map(Number)`)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87})
  await wait(`Math.abs(Number(document.querySelector('canvas').dataset.playerPosition.split(',')[2])-${beforeWalk[2]})>1`,15000)
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87})
  await screenshot('walking')
  await textClick('Return to Overview')
  await wait(`document.querySelector('.dawn-world')?.dataset.exploring==='false'`)
  checks.push('Tutorial drives real landmark and walking controls; overview can be restored')
  await textClick('Start exploring')
  await textClick('Return to World Hub')
  await wait(`document.querySelector('.dawn-world')?.dataset.city==='hub' && document.querySelector('.dawn-world')?.dataset.travelPhase==='idle'`)
  const planetPoint=await evaluate(`(() => { const r=document.querySelector('.dawn-world canvas').getBoundingClientRect(); return {x:r.x+r.width*.6,y:r.y+r.height*.53} })()`)
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...planetPoint})
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...planetPoint})
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...planetPoint})
  await wait(`document.querySelector('.dawn-world')?.dataset.travelPhase==='departing'`)
  await textClick('Cancel journey')
  await wait(`document.querySelector('.dawn-world')?.dataset.travelPhase==='idle'`)
  await wait(`getComputedStyle(document.querySelector('.portal-veil')).opacity==='0'`,10000)
  checks.push('Clicking the 3D planet starts descent; cancel clears the veil and restores controls')
  await textClick('Flight school')
  await wait(`document.body.innerText.includes('Take the planet for a spin.')`)
  await evaluate(`document.querySelector('.dawn-world canvas').focus()`)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39})
  await wait(`document.body.innerText.includes('Find your kind of unfinished.')`)
  checks.push('Keyboard orbit advances the tutorial through a real control event')
  await click('[aria-label="Skip tutorial"]')
  await textClick('My City')
  await wait(`document.querySelector('[data-city="hub"].is-surface') && document.body.innerText.includes('My City')`)
  await textClick('Building shop')
  await wait(`!!document.querySelector('.building-shop')`)
  await screenshot('shop')
  await click('.building-shop-close')
  await textClick('Return to World Hub')
  await wait(`!!document.querySelector('.descent-launch')`)
  checks.push('Replay, skip, personal city and existing building shop remain reachable')
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await click('.descent-launch')
  await wait(`document.querySelector('.dawn-world')?.dataset.city==='Gaming' && document.querySelector('.dawn-world')?.dataset.travelPhase==='idle'`)
  checks.push('Reduced-motion travel completes via dissolve')
  await click('.world-quality input')
  await evaluate(`new Promise(resolve => { let frames=0; function step(){if(++frames===12)resolve(true);else requestAnimationFrame(step)} requestAnimationFrame(step) })`)
  await screenshot('city-standard-effects')
  assert.equal(await evaluate(`document.querySelector('.world-quality input').checked`),false)
  checks.push('Standard-effects district renders after toggling quality')
  await click('.world-quality input')
  await textClick('Return to World Hub')
  await wait(`document.querySelector('.dawn-world')?.dataset.city==='hub' && document.querySelector('.dawn-world')?.dataset.travelPhase==='idle'`)
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
  await screenshot('mobile')
  const size=await evaluate(`({scroll:document.documentElement.scrollWidth,width:innerWidth,button:document.querySelector('.descent-launch').getBoundingClientRect().toJSON()})`)
  assert.ok(size.scroll<=size.width+1)
  assert.ok(size.button.x>=0 && size.button.right<=size.width)
  await textClick('Flight school')
  await screenshot('mobile-tutorial')
  checks.push('390px mobile layout has no page overflow and descent stays visible')
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier})
  // Reload with an explicitly locked account, proving the cinematic has not bypassed authorization.
  await send('Page.addScriptToEvaluateOnNewDocument',{source:fixture+`window.__DAWN_TEST__.mode='locked';`})
  await send('Page.reload',{ignoreCache:true})
  await textClick('Reboot Planet')
  await wait(`document.body.innerText.includes('12 DAYS TO ARRIVAL')`)
  assert.equal(await evaluate(`!!document.querySelector('.descent-launch')`),false)
  checks.push('Locked-account fixture cannot enter districts or economy')
  await evaluate('window.__DAWN_TEST__.requests=[]')
  await textClick('Explore 3D World (Preview)')
  await wait(`document.querySelector('.dawn-world')?.dataset.travelPhase==='idle' && document.querySelector('.dawn-world')?.dataset.renderReady==='true'`)
  assert.equal(await evaluate(`new URLSearchParams(location.search).get('preview')`), '1')
  assert.equal(await evaluate(`[...document.querySelectorAll('.planet-toolbar button')].find(b=>b.textContent.includes('shop locked'))?.disabled`), true)
  assert.deepEqual(await evaluate(`window.__DAWN_TEST__.requests.filter(path=>/wallet_state|building_ownership|building_placements|reward_activity/.test(path))`), [])
  checks.push('Locked accounts can preview the world without wallet requests or a purchasing entry')
  assert.deepEqual(errors,[])
  checks.push('No browser exceptions or console errors')
  const report={mode:production?'production':'development',checks,errors,backend:'Local fixtures only; no remote writes or real entitlement verification',screenshots:out}
  await writeFile(join(out,`second-dawn-${production?'prod':'dev'}-checks.json`),JSON.stringify(report,null,2))
  console.log(JSON.stringify(report,null,2))
} catch(error) {
  console.error(error.stack);console.error('Browser errors:',JSON.stringify(errors));process.exitCode=1
} finally {
  ws?.close()
  for(const processHandle of [chrome,server]) if(processHandle?.pid) {
    if(process.platform==='win32')spawnSync('taskkill',['/PID',String(processHandle.pid),'/T','/F'],{stdio:'ignore'})
    else processHandle.kill('SIGTERM')
  }
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{})
}
