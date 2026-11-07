// Building architecture census. Fixed deterministic camera: identical input
// sequence every run, so BEFORE and AFTER shots share position/angle/zoom.
// Local vite preview + seeded fixture only. NO live writes.
// Usage: node building-census.check.mjs before|after
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const tag=process.argv[2]==='after'?'after':'before'
const root=dirname(fileURLToPath(import.meta.url)),out=join(root,'../screenshots'),port=4181,cdp=9229
const profile=await mkdtemp(join(tmpdir(),'reboot-building-census-'))

const uid='11111111-1111-4111-8111-111111111111'
const defs=['starter-shack','brickbox','abandoned-shed','modern-cube','mini-warehouse','research-pod','neon-corner','stackhouse-mini','hackers-den-mini','concrete-tower']
const ownership=[
  ...defs.map((definition_id,n)=>({id:`0b0b0b0b-1000-4000-8000-${String(n).padStart(4,'0')}bbbb`,user_id:uid,definition_id,purchase_transaction_id:null,customization:null,acquired_at:'2026-10-20T09:00:00Z'})),
  {id:'0b0b0b0b-1000-4000-8000-9999bbbb',user_id:uid,definition_id:'reboot-nexus',purchase_transaction_id:null,customization:{exteriorColor:'#20242d',finish:'obsidian',lightingColor:'#36e4ff',accessories:['antenna','holo-sign']},acquired_at:'2026-10-20T09:00:00Z'},
]
const placements=[
  ...defs.map((free_definition_id,n)=>({id:`0c0c0c0c-1000-4000-8000-${String(n).padStart(4,'0')}cccc`,user_id:uid,ownership_id:ownership[n].id,free_definition_id:null,grid_x:-5+n,grid_z:0,rotation:0,created_at:`2026-10-21T08:0${n%6}:00Z`,updated_at:'2026-10-21T08:00:00Z'})),
  {id:'0c0c0c0c-1000-4000-8000-9999cccc',user_id:uid,ownership_id:ownership[10].id,free_definition_id:null,grid_x:7,grid_z:0,rotation:0,created_at:'2026-10-21T08:10:00Z',updated_at:'2026-10-21T08:10:00Z'},
]
const night='2024-11-03T12:00:00Z'
const idea=(n,category,status,score,views,upvotes,title)=>({
  id:`0a1b2c3d-2000-4000-8000-${String(n).padStart(4,'0')}aaaa`,title,short_desc:'Seeded district project.',description:'Fixture row.',failure_story:null,
  category,status,revival_score:score,is_anonymous:false,creator_name:`Builder ${n}`,founded_year:2019,abandoned_year:status==='abandoned'?2023:null,
  why_died:null,last_words:null,skills_required:['React'],tech_stack:['TypeScript'],views,upvotes,building_customization:null,created_at:night,updated_at:night,user_id:uid,
  revival_count:Math.round(score/15),potential_score:Math.max(1,Math.round(score/20)),almost_made_it:false,cover_url:null,difficulty:'medium',
})
const ideas=[
  idea(1,'ai','alive',86,940,120,'Signal Garden'),idea(2,'ai','reviving',54,512,64,'Prompt Relay'),
  idea(3,'ai','alive',70,620,80,'Vector Attic'),idea(4,'ai','decaying',32,305,22,'Model Meter'),
  idea(5,'ai','alive',92,880,101,'Lantern Inference'),idea(6,'ai','abandoned',18,260,12,'Batch Dreamer'),
]

const server=spawn(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'pipe'})
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),errors=[],logs=[]
server.stdout.on('data',d=>logs.push(String(d)));server.stderr.on('data',d=>logs.push(String(d)))
let chrome,ws
async function untilHttp(url){const start=Date.now();while(Date.now()-start<30000){try{const r=await fetch(url);if(r.ok)return await r.text()}catch{}await delay(150)}throw new Error(`Unavailable: ${url}\n${logs.join('')}`)}
try{
  await untilHttp(`http://127.0.0.1:${port}`)
  chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new',`--remote-debugging-port=${cdp}`,`--user-data-dir=${profile}`,'--window-size=1440,960','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion','--no-first-run','--no-default-browser-check','--disable-background-networking','about:blank'],{stdio:'ignore'})
  await untilHttp(`http://127.0.0.1:${cdp}/json/version`)
  const targets=JSON.parse(await untilHttp(`http://127.0.0.1:${cdp}/json/list`))
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl)
  const pending=new Map();let sequence=0
  ws.addEventListener('message',e=>{const msg=JSON.parse(e.data);if(msg.id){const task=pending.get(msg.id);pending.delete(msg.id);if(msg.error)task?.reject(new Error(JSON.stringify(msg.error)));else task?.resolve(msg.result)}if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error')errors.push(msg.params.args.map(a=>a.value??a.description??'').join(' '))})
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})
  const evaluate=async expression=>{const response=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);return response.result.value}
  const wait=async(expression,ms=90000)=>{const start=Date.now();while(Date.now()-start<ms){if(await evaluate(expression))return;await delay(150)}throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText.slice(-1800)')}`)}
  const pointerClick=async expression=>{await wait(`(()=>{const el=${expression};if(!el||el.disabled)return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&!el.closest('[inert]')})()`);const point=await evaluate(`(()=>{const el=${expression};const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);assert.ok(await evaluate(`(()=>{const el=${expression};const hit=document.elementFromPoint(${point.x},${point.y});return el===hit||el.contains(hit)})()`),`Control is obscured: ${expression}`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})}
  const textClick=text=>pointerClick(`[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.getBoundingClientRect().width>0&&b.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))`)
  const screenshot=async name=>{const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});await writeFile(join(out,`census-${name}-${tag}.png`),Buffer.from(shot.data,'base64'))}
  // Deterministic camera inputs — identical sequence every run.
  const wheel=async(count,x=720,y=500)=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});for(let i=0;i<count;i++)await send('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY:-120})}
  const drag=async(x1,y1,x2,y2,steps=10)=>{await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:x1,y:y1});for(let i=1;i<=steps;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',x:x1+(x2-x1)*i/steps,y:y1+(y2-y1)*i/steps});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',x:x2,y:y2})}
  const settle=async(frames=150,ms=1600)=>{await evaluate(`new Promise(resolve=>{let n=0;function frame(){if(++n===${frames})resolve(true);else requestAnimationFrame(frame)}requestAnimationFrame(frame)})`);await delay(ms)}
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  const fixture=`
    const nativeFetch=window.fetch.bind(window);const testUser={id:${JSON.stringify(uid)},email:'ui-test@example.invalid',aud:'authenticated',role:'authenticated',created_at:'2020-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{username:'LOCAL FIXTURE'}};
    const seedIdeas=${JSON.stringify(ideas)};const seedOwnership=${JSON.stringify(ownership)};const seedPlacements=${JSON.stringify(placements)};
    window.fetch=async(input,init)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(!url.hostname.endsWith('.supabase.co'))return nativeFetch(input,init);let data=[],status=200;
      if(url.pathname.includes('/auth/v1/user'))data=testUser;
      else if(url.pathname.endsWith('/planet_access_status'))data={hasAccess:true,isAdmin:true,daysRemaining:0};
      else if(url.pathname.endsWith('/wallet_state'))data={balance:18400,recentTransactions:[]};
      else if(url.pathname.includes('/rest/v1/ideas'))data=seedIdeas;
      else if(url.pathname.includes('/rest/v1/building_ownership'))data=seedOwnership;
      else if(url.pathname.includes('/rest/v1/building_placements'))data=seedPlacements;
      else if(url.pathname.includes('/rpc/')){data={message:'Local UI test: writes blocked'};status=403}
      else if(url.pathname.includes('/rest/v1/'))data=[];
      return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Content-Range':'0-0/0'}})};
    window.__seedTestSession=()=>{const payload=btoa(JSON.stringify({sub:testUser.id,exp:Math.floor(Date.now()/1000)+36000}));['local-placeholder','vsddqasvaesndomdfnrf','qctppiuemwuamhnlmcgm'].forEach(ref=>localStorage.setItem('sb-'+ref+'-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.LOCAL_TEST_ONLY',refresh_token:'LOCAL_TEST_ONLY',token_type:'bearer',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,user:testUser})))};
    localStorage.setItem('reboot-reduced-effects','false');localStorage.setItem('reboot-second-dawn-tutorial-v1','complete');localStorage.setItem('reboot-intro-v1','seen');
    window.addEventListener('DOMContentLoaded',()=>{const label=document.createElement('div');label.textContent='LOCAL UI TEST · BUILDING CENSUS · ${tag.toUpperCase()} · NO LIVE DATA';label.style.cssText='position:fixed;top:0;left:50%;transform:translateX(-50%);font:8px monospace;letter-spacing:1px;background:#513b17;color:#ffe4ae;padding:5px 10px;z-index:999999;pointer-events:none';document.body.append(label)});
  `
  await send('Page.addScriptToEvaluateOnNewDocument',{source:fixture})
  await send('Page.navigate',{url:`http://127.0.0.1:${port}`})
  await textClick('CONTINUE AS GHOST');await textClick('Reboot Planet');await evaluate('window.__seedTestSession()');await send('Page.reload',{ignoreCache:true});await textClick('Reboot Planet')
  await wait(`!!document.querySelector('.descent-launch:not(:disabled)')`);await pointerClick(`document.querySelector('.descent-launch')`)
  // --- AI district shot (project towers) ---
  await wait(`document.querySelector('.dawn-world')?.dataset.city==='AI'&&document.querySelector('.dawn-world')?.dataset.travelPhase==='idle'`)
  await settle();await wheel(4);await settle(120,1200)
  await screenshot('district-ai')
  // --- My City lineup (all eleven named buildings) ---
  await pointerClick(`[...document.querySelectorAll('.world-return button,button.world-return')].find(b=>b.textContent.includes('Return to World Hub'))`)
  await wait(`document.querySelector('.dawn-world')?.dataset.city==='hub'&&document.querySelector('.dawn-world')?.dataset.travelPhase==='idle'`)
  await pointerClick(`[...document.querySelectorAll('.planet-toolbar button')].find(b=>b.textContent==='My City')`)
  await wait(`!!document.querySelector('.world-plate h1')&&document.querySelector('.world-plate h1').textContent==='My City'&&document.querySelector('.dawn-world')?.dataset.travelPhase==='idle'`)
  await settle()
  await wheel(15);await settle(180,1800)   // radius ~59: full lineup, LOD detail on
  await screenshot('lineup')
  await wheel(6);await drag(1150,520,1005,520);await settle(150,1400) // closer, swing west end
  await screenshot('west')
  await drag(430,520,790,520,14);await settle(150,1400)               // swing east toward nexus
  await screenshot('east')
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({tag,shots:['district-ai','lineup','west','east'],errors,screenshots:out},null,2))
}catch(error){console.error(error.stack);console.error('Browser errors:',JSON.stringify(errors));process.exitCode=1}finally{
  ws?.close();for(const handle of [chrome,server])if(handle?.pid){if(process.platform==='win32')spawnSync('taskkill',['/PID',String(handle.pid),'/T','/F'],{stdio:'ignore'});else handle.kill('SIGTERM')}
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{})
}
