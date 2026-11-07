// City visual census WITH user buildings. Local vite preview + seeded fetch fixture only.
// Districts render project buildings from mocked `ideas` rows; "My City" renders placed
// buildings from mocked `building_ownership` + `building_placements` rows. NO live writes.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const root=dirname(fileURLToPath(import.meta.url)),out=join(root,'../screenshots',process.env.BUILDINGS_OUT_DIR||''),port=4179
await mkdir(out,{recursive:true})
const profile=await mkdtemp(join(tmpdir(),'reboot-buildings-census-'))

// ---- seed data ------------------------------------------------------------
const uid='11111111-1111-4111-8111-111111111111'
const night='2024-11-0'+Math.floor(Math.random()*7+1)+'T12:00:00Z'
const idea=(n,category,status,score,views,upvotes,extra={})=>({
  id:`0a1b2c3d-0000-4000-8000-${String(n).padStart(4,'0')}aaaa`,
  title:extra.title??`Fixture Project ${n}`, short_desc:extra.short_desc??'Built from a real attempt that stopped.',
  description:extra.description??'A seeded local-fixture project so the district renders its building line-up.',
  failure_story:extra.failure_story??null, category, status, revival_score:score,
  is_anonymous:!!extra.anon, creator_name:extra.creator_name??`Builder ${n}`, founded_year:2019+(n%5), abandoned_year:status==='abandoned'?2023:null,
  why_died:extra.why_died??null, last_words:extra.last_words??null, skills_required:['React','Node'], tech_stack:['TypeScript','Postgres'],
  views, upvotes, building_customization:extra.customization??null, created_at:extra.created_at??night, updated_at:extra.created_at??night,
  user_id:n%3===0?null:uid,
  // fields the marketing Home page renders directly from idea rows
  revival_count:extra.revival_count??Math.max(0,Math.round(score/12)), potential_score:extra.potential_score??Math.max(1,Math.min(5,Math.round(score/20))),
  almost_made_it:!!extra.almost, cover_url:null, difficulty:extra.difficulty??'medium',
})
const custom=(exterior,finish,light,acc)=>({exteriorColor:exterior,finish,lightingColor:light,accessories:acc})
const ideas=[
  // AI district
  idea(1,'ai','alive',86,940,120,{title:'Signal Garden',customization:custom('#20242d','obsidian','#36e4ff',['antenna','holo-sign'])}),
  idea(2,'ai','reviving',54,512,64,{title:'Prompt Relay',creator_name:'Meera K.'}),
  idea(3,'ai','abandoned',18,420,31,{title:'Vector Attic',why_died:'Inference costs outran the plan.',last_words:'Ship smaller or stop.'}),
  idea(4,'ai','decaying',32,305,22,{title:'Model Meter',anon:true}),
  // Gaming
  idea(5,'gaming','alive',74,810,140,{title:'Lantern Roguelike',customization:custom('#1c2b1f','glass','#7CFF8F',['garden'])}),
  idea(6,'gaming','reviving',48,640,95,{title:'Co-op Depot'}),
  idea(7,'gaming','abandoned',12,210,9,{title:'Patch 0.4',why_died:'Team scattered after funding fell through.'}),
  // Space
  idea(8,'space','alive',91,760,88,{title:'Orbit Ledger',customization:custom('#2a2030','metal','#B388FF',['solar-array','antenna'])}),
  idea(9,'space','decaying',40,330,27,{title:'Lagrange Notes'}),
  idea(10,'space','abandoned',15,180,6,{title:'Tether Demo',last_words:'Physics always wins.'}),
  // Health
  idea(11,'health','alive',66,450,52,{title:'Quiet Vitals'}),
  idea(12,'health','reviving',44,260,19,{title:'Rehab Replay'}),
  // Education
  idea(13,'education','alive',72,520,71,{title:'Chalkback',customization:custom('#241d14','wood','#FFD166',[])}),
  idea(14,'education','decaying',28,190,12,{title:'Semester Zero'}),
  // Creator
  idea(15,'creator','alive',61,380,44,{title:'Stem River'}),
  idea(16,'creator','reviving',50,240,18,{title:'Zine Machine'}),
  // Robotics
  idea(17,'robotics','alive',68,410,39,{title:'Gripper OS'}),
  idea(18,'robotics','abandoned',20,150,7,{title:'Sidewalk Six',why_died:'Battery sourcing collapsed the BOM.'}),
  // Community
  idea(19,'community','alive',80,690,110,{title:'Tool Library',customization:custom('#232330','concrete','#FF4FD8',['holo-sign','garden'])}),
  idea(20,'community','reviving',46,340,29,{title:'Repair Cafe Net'}),
  idea(21,'community','decaying',30,220,15,{title:'Porch Signals',anon:true}),
  // Finance / Marketplace live in their mapped districts but also enrich hub counts
  idea(22,'finance','alive',58,290,21,{title:'Invoice Tide'}),
  idea(23,'marketplace','reviving',42,180,11,{title:'Swap Bench'}),
  // IdeaHub fallback (unmapped category + in_progress)
  idea(24,'idea','in_progress',36,260,17,{title:'Bus Radar'}),
  idea(25,'idea','seeking',24,140,8,{title:'Cellar Maps',why_died:'Needed a third co-founder.'}),
  // Legend fallback (unmapped category + revived)
  idea(26,'story','revived',96,980,220,{title:'Second Dawn CMS',last_words:'We came back.'}),
  idea(27,'story','revived',88,720,150,{title:'Ferry Ledger',creator_name:'A. Okonkwo'}),
]
const owned=(n,definition_id,customization)=>({id:`0b0b0b0b-0000-4000-8000-${String(n).padStart(4,'0')}bbbb`,user_id:uid,definition_id,purchase_transaction_id:null,customization,acquired_at:'2026-10-20T09:00:00Z'})
const ownership=[
  owned(1,'reboot-nexus',custom('#20242d','obsidian','#36e4ff',['antenna','holo-sign'])),
  owned(2,'modern-cube',custom('#d8dee9','glass','#7CFF8F',['garden'])),
  owned(3,'research-pod',null),
  owned(4,'neon-corner',custom('#1b1b24','metal','#FF00CC',['holo-sign'])),
  owned(5,'concrete-tower',null),
  owned(6,'brickbox',custom('#8a5a3b','wood','#FFD166',[])),
]
const placed=(n,{ownership_id=null,free_definition_id=null,grid_x,grid_z,rotation=0})=>({id:`0c0c0c0c-0000-4000-8000-${String(n).padStart(4,'0')}cccc`,user_id:uid,ownership_id,free_definition_id,grid_x,grid_z,rotation,created_at:`2026-10-2${n%8}T08:0${n%6}:00Z`,updated_at:`2026-10-2${n%8}T08:0${n%6}:00Z`})
const placements=[
  placed(1,{ownership_id:ownership[0].id,grid_x:0,grid_z:0}),
  placed(2,{ownership_id:ownership[1].id,grid_x:2,grid_z:0}),
  placed(3,{ownership_id:ownership[2].id,grid_x:0,grid_z:2}),
  placed(4,{ownership_id:ownership[3].id,grid_x:-2,grid_z:0}),
  placed(5,{ownership_id:ownership[4].id,grid_x:0,grid_z:-2}),
  placed(6,{ownership_id:ownership[5].id,grid_x:2,grid_z:2}),
  placed(7,{free_definition_id:'mini-warehouse',grid_x:3,grid_z:-2}),
  placed(8,{free_definition_id:'hackers-den-mini',grid_x:-3,grid_z:2}),
  placed(9,{free_definition_id:'abandoned-shed',grid_x:4,grid_z:0}),
  placed(10,{free_definition_id:'stackhouse-mini',grid_x:0,grid_z:-4}),
  placed(11,{free_definition_id:'starter-shack',grid_x:-4,grid_z:-3}),
]
const tableFor=path=>{
  if(path.includes('/rest/v1/ideas'))return ideas
  if(path.includes('/rest/v1/building_ownership'))return ownership
  if(path.includes('/rest/v1/building_placements'))return placements
  return []
}

const server=spawn(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'pipe'})
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),errors=[],logs=[]
server.stdout.on('data',d=>logs.push(String(d)));server.stderr.on('data',d=>logs.push(String(d)))
let chrome,ws
async function untilHttp(url){const start=Date.now();while(Date.now()-start<30000){try{const r=await fetch(url);if(r.ok)return await r.text()}catch{}await delay(150)}throw new Error(`Unavailable: ${url}\n${logs.join('')}`)}
try{
  await untilHttp(`http://127.0.0.1:${port}`)
  chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--remote-debugging-port=9227',`--user-data-dir=${profile}`,'--window-size=1440,960','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion','--no-first-run','--no-default-browser-check','--disable-background-networking','about:blank'],{stdio:'ignore'})
  await untilHttp('http://127.0.0.1:9227/json/version')
  const targets=JSON.parse(await untilHttp('http://127.0.0.1:9227/json/list'))
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl)
  const pending=new Map();let sequence=0
  ws.addEventListener('message',e=>{const msg=JSON.parse(e.data);if(msg.id){const task=pending.get(msg.id);pending.delete(msg.id);if(msg.error)task?.reject(new Error(JSON.stringify(msg.error)));else task?.resolve(msg.result)}if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);if(msg.method==='Runtime.consoleAPICalled'&&msg.params.type==='error')errors.push(msg.params.args.map(a=>a.value??a.description??'').join(' '))})
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})
  const evaluate=async expression=>{const response=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);return response.result.value}
  const wait=async(expression,ms=90000)=>{const start=Date.now();while(Date.now()-start<ms){if(await evaluate(expression))return;await delay(150)}throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText.slice(-1800)')}`)}
  const pointerClick=async expression=>{await wait(`(()=>{const el=${expression};if(!el||el.disabled)return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&!el.closest('[inert]')})()`);const point=await evaluate(`(()=>{const el=${expression};const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})}
  const textClick=text=>pointerClick(`[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.getBoundingClientRect().width>0&&b.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))`)
  const screenshot=async name=>{const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});await writeFile(join(out,`buildings-${name}.png`),Buffer.from(shot.data,'base64'))}
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
    window.addEventListener('DOMContentLoaded',()=>{const label=document.createElement('div');label.textContent='LOCAL UI TEST · SEEDED BUILDING FIXTURE · NO LIVE DATA';label.style.cssText='position:fixed;top:0;left:50%;transform:translateX(-50%);font:8px monospace;letter-spacing:1px;background:#513b17;color:#ffe4ae;padding:5px 10px;z-index:999999;pointer-events:none';document.body.append(label)});
  `
  await send('Page.addScriptToEvaluateOnNewDocument',{source:fixture})
  await send('Page.navigate',{url:`http://127.0.0.1:${port}`})
  await textClick('CONTINUE AS GHOST');await textClick('Reboot Planet');await evaluate('window.__seedTestSession()');await send('Page.reload',{ignoreCache:true});await textClick('Reboot Planet')
  await wait(`!!document.querySelector('.descent-launch:not(:disabled)')`);await pointerClick(`document.querySelector('.descent-launch')`)
  const cities=process.env.CENSUS_CITIES?process.env.CENSUS_CITIES.split(',').map(city=>city.trim()).filter(Boolean):['AI','Gaming','Space','Community','Graveyard']
  const buttonLabel=city=>city==='Graveyard'?'Graveyard':`${city} City`
  for(const city of cities){
    if(city!=='AI')await pointerClick(`[...document.querySelectorAll('.city-destinations button')].find(b=>b.textContent===${JSON.stringify(buttonLabel(city))})`)
    await wait(`document.querySelector('.dawn-world')?.dataset.city===${JSON.stringify(city)}&&document.querySelector('.dawn-world')?.dataset.travelPhase==='idle'`)
    await evaluate(`new Promise(resolve=>{let n=0;function frame(){if(++n===60)resolve(true);else requestAnimationFrame(frame)}requestAnimationFrame(frame)})`)
    await delay(900)
    const projectCount=await evaluate(`(document.querySelector('.world-projects h2')?.textContent||'').trim()`)
    await screenshot(city.toLowerCase())
    console.log(JSON.stringify({city,projectCount}))
  }
  // My City: owned + free placed buildings from the seeded economy rows
  await pointerClick(`[...document.querySelectorAll('.planet-toolbar button')].find(b=>b.textContent==='My City')`)
  await wait(`!!document.querySelector('.world-plate h1')&&document.querySelector('.world-plate h1').textContent==='My City'&&document.querySelector('.dawn-world')?.dataset.travelPhase==='idle'`)
  await evaluate(`new Promise(resolve=>{let n=0;function frame(){if(++n===60)resolve(true);else requestAnimationFrame(frame)}requestAnimationFrame(frame)})`)
  await delay(900)
  const myCityTitle=await evaluate(`document.querySelector('.world-plate h1')?.textContent||''`)
  await screenshot('mycity')
  console.log(JSON.stringify({city:'MyCity',myCityTitle}))
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({errors,screenshots:out},null,2))
}catch(error){console.error(error.stack);console.error('Browser errors:',JSON.stringify(errors));process.exitCode=1}finally{
  ws?.close();for(const handle of [chrome,server])if(handle?.pid){if(process.platform==='win32')spawnSync('taskkill',['/PID',String(handle.pid),'/T','/F'],{stdio:'ignore'});else handle.kill('SIGTERM')}
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{})
}
