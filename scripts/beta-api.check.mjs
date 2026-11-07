import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=await mkdtemp(path.join(tmpdir(),'reboot-beta-test-'));
const port=4329;
const child=spawn(process.execPath,['scripts/beta-server.mjs'],{env:{...process.env,REBOOT_BETA_DATA:dir,REBOOT_BETA_PORT:String(port)},stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',d=>stderr+=d);
const origin=`http://127.0.0.1:${port}`;
async function call(route,body,cookie){const response=await fetch(origin+'/api/beta/'+route,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('API startup timeout '+stderr)),20000);child.stdout.on('data',d=>{if(String(d).includes('ready')){clearTimeout(timeout);resolve()}});child.once('exit',code=>{clearTimeout(timeout);reject(new Error(`API exited ${code}: ${stderr}`))})});
 assert.equal((await call('command',{action:'submit',payload:{}})).status,401);
 const a=await call('register',{email:'synthetic-owner@example.invalid',password:'Synthetic-password-123',name:'Synthetic QA owner'});assert.equal(a.status,200);assert.ok(a.cookie);assert.equal((await call('login',{email:'synthetic-owner@example.invalid',password:'Incorrect-password-123'})).status,401);
 const b=await call('register',{email:'synthetic-helper@example.invalid',password:'Synthetic-password-456',name:'Synthetic QA helper'});assert.equal(b.status,200);
 const cmd=(cookie,action,payload)=>call('command',{action,payload},cookie);
 const submitted=await cmd(a.cookie,'submit',{title:'Synthetic QA atlas',description:'A synthetic fixture used only by an isolated API test.',category:'AI',anonymous:true});assert.equal(submitted.status,200);const projectId=submitted.data.id;
 const publicState=await call('snapshot');assert.equal(publicState.data.snapshot.projects[0].founder,'Anonymous founder');assert.equal(publicState.data.snapshot.projects[0].founderId,undefined);assert.deepEqual(publicState.data.snapshot.ownedProjectIds,[]);assert.equal(publicState.data.session,null);
 assert.equal((await cmd(b.cookie,'transition',{projectId,status:'discovered',reason:'Not the original owner of this project'})).status,400);
 assert.equal((await cmd(a.cookie,'transition',{projectId,status:'discovered',reason:'This is the first valid transition'})).status,200);
 assert.equal((await cmd(b.cookie,'revival',{projectId,reason:'A meaningful synthetic revival proposal',proposedChanges:'Build an accessible map for the fixture',newDirection:'Support collaborative local knowledge',requirements:'Accessibility and testing help'})).status,200);
 assert.equal((await cmd(a.cookie,'transition',{projectId,status:'under_revival',reason:'Accept the meaningful revival proposal'})).status,200);
 assert.equal((await call('upload',{data:'data:image/png;base64,'+Buffer.from('not actually a valid image file').toString('base64')},b.cookie)).status,400);
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6xkAAAAASUVORK5CYII=';
 const upload=await call('upload',{data:'data:image/png;base64,'+png},b.cookie);assert.equal(upload.status,200);
 const privateMedia=await fetch(origin+upload.data.url,{headers:{Cookie:b.cookie}});assert.equal(privateMedia.status,200);assert.equal(privateMedia.headers.get('cache-control'),'no-store');await privateMedia.arrayBuffer();
 for(const cookie of ['',a.cookie]){const denied=await fetch(origin+upload.data.url,{headers:cookie?{Cookie:cookie}:{}});assert.equal(denied.status,404);await denied.text();}
 assert.equal((await cmd(a.cookie,'progress',{projectId,body:'Attempt to steal another user upload',evidenceUrl:upload.data.url})).status,403);
 assert.equal((await cmd(b.cookie,'progress',{projectId,body:'Recorded synthetic implementation evidence',evidenceUrl:upload.data.url})).status,200);
 const publishedMedia=await fetch(origin+upload.data.url);assert.equal(publishedMedia.status,200);assert.equal(publishedMedia.headers.get('cache-control'),'no-store');await publishedMedia.arrayBuffer();
 assert.equal((await cmd(a.cookie,'transition',{projectId,status:'revived',reason:'The synthetic prototype has evidence'})).status,200);
 assert.equal((await cmd(a.cookie,'transition',{projectId,status:'completed',reason:'The synthetic acceptance criteria pass'})).status,200);
 await cmd(b.cookie,'support',{projectId});await cmd(b.cookie,'support',{projectId});const final=await call('snapshot',undefined,a.cookie);assert.equal(final.data.snapshot.supportCounts[projectId],1);assert.deepEqual(final.data.snapshot.supports,[]);assert.equal(final.data.snapshot.history.length,4);assert.equal(final.data.snapshot.projects[0].status,'completed');assert.equal(final.data.snapshot.notifications.length,2);
 assert.equal((await cmd(b.cookie,'moderate',{projectId,hidden:true})).status,400);
 const ownerId=final.data.session.id,helperId=(await call('snapshot',undefined,b.cookie)).data.session.id;
 const ownerPublic=await call('founders/'+ownerId);assert.equal(ownerPublic.status,200);assert.equal(ownerPublic.data.projects.length,0);assert.equal(JSON.stringify(ownerPublic.data).includes(projectId),false);assert.equal(JSON.stringify(ownerPublic.data).includes('synthetic-owner@example.invalid'),false);
 const publicProject=(await cmd(a.cookie,'submit',{title:'Public synthetic fixture',description:'This public fixture tests authenticated public founder discovery.',category:'AI'})).data.id;
 const plan={projectId:publicProject,reason:'An actual independent attempt',proposedChanges:'Build the useful feature carefully',newDirection:'A clear shared direction',requirements:'Implementation and tests'};
 const r1=(await cmd(b.cookie,'revival',plan)).data.id,r2=(await cmd(b.cookie,'revival',plan)).data.id;
 assert.equal((await call('outcome',{revivalId:r1,status:'succeeded',result:'Finished the working prototype.',evidenceUrl:'https://example.invalid/proof'},b.cookie)).status,400);
 assert.equal((await call('outcome',{revivalId:r1,status:'succeeded',result:'Owner verified this specific working prototype.',evidenceUrl:'https://example.invalid/proof'},a.cookie)).status,200);
 assert.equal((await call('outcome',{revivalId:r2,status:'failed',result:'This independent attempt did not meet its goal.'},b.cookie)).status,200);
 const helperPublic=(await call('founders/'+helperId)).data;assert.equal(helperPublic.counts.revivalAttempts,2);assert.equal(helperPublic.counts.successfulRevivals,1);assert.equal((await call('snapshot',undefined,b.cookie)).data.snapshot.profile.successfulRevivals,1);assert.equal(JSON.stringify(helperPublic).includes(projectId),false);
 assert.equal((await call('founders/'+ownerId)).data.projects.length,1);

 const unpublished=await call('upload',{data:'data:image/png;base64,'+png},b.cookie);assert.equal(unpublished.status,200);await call('logout',{},b.cookie);const loggedOutMedia=await fetch(origin+unpublished.data.url,{headers:{Cookie:b.cookie}});assert.equal(loggedOutMedia.status,404);await loggedOutMedia.text();
 await call('logout',{},a.cookie);assert.equal((await cmd(a.cookie,'comment',{projectId,body:'Session no longer valid'})).status,401);
 console.log('PASS: isolated API authentication, anonymous ownership, authorization, revival, file validation/ownership, lifecycle, unique support, notifications, moderation and logout.');
}finally{if(child.exitCode===null&&child.signalCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;}await rm(dir,{recursive:true,force:true});}
