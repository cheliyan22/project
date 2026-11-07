// Captures the orbital REBOOT arch at both entries: the public gate preview and the hub.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const root=dirname(fileURLToPath(import.meta.url)),out=join(root,'../screenshots'),port=4179
const profile=await mkdtemp(join(tmpdir(),'reboot-orbital-visuals-'))
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
  const wait=async(expression,ms=90000)=>{const start=Date.now();while(Date.now()-start<ms){if(await evaluate(expression))return;await delay(150)}throw new Error(`Timed out: ${expression}\nscene: ${await evaluate(`document.querySelector('.dawn-access-scene')?.innerHTML.slice(0,400)??'no scene'`)}\n${await evaluate('document.body.innerText.slice(-1800)')}`)}
  const pointerClick=async expression=>{await wait(`(()=>{const el=${expression};if(!el||el.disabled)return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&!el.closest('[inert]')})()`);const point=await evaluate(`(()=>{const el=${expression};const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})}
  const textClick=text=>pointerClick(`[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.getBoundingClientRect().width>0&&b.textContent.toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))`)
  const settle=async frames=>evaluate(`new Promise(resolve=>{let n=0;function frame(){if(++n===${frames})resolve(true);else requestAnimationFrame(frame)}requestAnimationFrame(frame)})`)
  const screenshot=async name=>{const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});await writeFile(join(out,`orbital-prod-${name}.png`),Buffer.from(shot.data,'base64'))}
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
  const fixture=`
    const nativeFetch=window.fetch.bind(window);const testUser={id:'11111111-1111-4111-8111-111111111111',email:'ui-test@example.invalid',aud:'authenticated',role:'authenticated',created_at:'2020-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{username:'LOCAL UI TEST'}};
    window.fetch=async(input,init)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(!url.hostname.endsWith('.supabase.co'))return nativeFetch(input,init);let data=[],status=200;if(url.pathname.includes('/auth/v1/user'))data=testUser;else if(url.pathname.endsWith('/planet_access_status'))data={hasAccess:true,isAdmin:true,daysRemaining:0};else if(url.pathname.endsWith('/wallet_state'))data={balance:0,recentTransactions:[]};else if(url.pathname.includes('/rpc/')){data={message:'Local UI test: writes blocked'};status=403}return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Content-Range':'0-0/0'}})};
    window.__seedTestSession=()=>{const payload=btoa(JSON.stringify({sub:testUser.id,exp:Math.floor(Date.now()/1000)+36000}));['local-placeholder','vsddqasvaesndomdfnrf','qctppiuemwuamhnlmcgm'].forEach(ref=>localStorage.setItem('sb-'+ref+'-auth-token',JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+payload+'.LOCAL_TEST_ONLY',refresh_token:'LOCAL_TEST_ONLY',token_type:'bearer',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,user:testUser})))};
    localStorage.setItem('reboot-reduced-effects','false');localStorage.setItem('reboot-second-dawn-tutorial-v1','complete');localStorage.setItem('reboot-intro-v1','seen');
  `
  await send('Page.addScriptToEvaluateOnNewDocument',{source:fixture})
  await send('Page.navigate',{url:`http://127.0.0.1:${port}`})
  await wait(`!!document.querySelector('canvas')`,90000);await settle(60);await delay(1200)
  await screenshot('gate')
  await textClick('CONTINUE AS GHOST');await textClick('Reboot Planet');await evaluate('window.__seedTestSession()');await send('Page.reload',{ignoreCache:true});await textClick('Reboot Planet')
  await wait(`!!document.querySelector('.descent-launch')`);await settle(60);await delay(1200)
  await screenshot('hub')
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({views:['gate','hub'],errors,screenshots:out},null,2))
}catch(error){console.error(error.stack);console.error('Browser errors:',JSON.stringify(errors));process.exitCode=1}finally{
  ws?.close();for(const handle of [chrome,server])if(handle?.pid){if(process.platform==='win32')spawnSync('taskkill',['/PID',String(handle.pid),'/T','/F'],{stdio:'ignore'});else handle.kill('SIGTERM')}
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200}).catch(()=>{})
}
