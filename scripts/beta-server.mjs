import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {randomBytes,scryptSync,timingSafeEqual,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import path from 'node:path';
const dataRoot=process.env.REBOOT_BETA_DATA||path.resolve('.beta-data');
await mkdir(dataRoot,{recursive:true});
const db=new PGlite(path.join(dataRoot,'postgres'));
await db.exec(`CREATE TABLE IF NOT EXISTS public.beta_bootstrap(version int PRIMARY KEY);`);
if(!(await db.query('SELECT * FROM beta_bootstrap')).rows.length){
 await db.transaction(async tx=>{
 await tx.exec(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;GRANT USAGE ON SCHEMA auth,public TO anon,authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;`);
 await tx.exec(await readFile(new URL('../supabase/migrations/20261107000000_experimental_beta.sql',import.meta.url),'utf8'));
 await tx.exec(`CREATE TABLE reboot_private.local_accounts(id uuid PRIMARY KEY REFERENCES auth.users,email text UNIQUE NOT NULL,name text NOT NULL,salt text NOT NULL,digest text NOT NULL); CREATE TABLE reboot_private.local_media(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users,mime text NOT NULL,body bytea NOT NULL);INSERT INTO beta_bootstrap VALUES(1);`);
 });
}
// Versioned transaction applies to existing local databases without clearing records.
if(!(await db.query('SELECT version FROM beta_bootstrap WHERE version=2')).rows.length){
 await db.transaction(async tx=>{
  await tx.exec(await readFile(new URL('../supabase/migrations/20261107160000_beta_founders_and_outcomes.sql',import.meta.url),'utf8'));
  await tx.exec('INSERT INTO public.beta_founders(id,name) SELECT id,name FROM reboot_private.local_accounts ON CONFLICT(id) DO NOTHING;INSERT INTO beta_bootstrap VALUES(2)');
 });
}
const camel=row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),v]));
function publicProfile(raw){if(!raw)return null;const projects=raw.projects.map(p=>({...camel(p),founderId:raw.id})),revivals=raw.revivals.map(r=>({...camel(r),founder:raw.name})),contributions=raw.contributions.map(camel);const counts={submitted:projects.length,abandoned:projects.filter(p=>p.status==='abandoned').length,revivalAttempts:revivals.length,successfulRevivals:revivals.filter(r=>r.status==='succeeded').length,evidenceContributions:contributions.length};const achievements=[...(counts.submitted?['First public project']:[]),...(counts.revivalAttempts?['First public revival attempt']:[]),...(counts.successfulRevivals?['Successful revival']:[]),...(counts.evidenceContributions?['Evidence contributor']:[])];return {...raw,projects,revivals,contributions,counts,achievements,reputation:achievements.length*25};}
const sessions=new Map();const attempts=new Map();let queue=Promise.resolve();
setInterval(()=>{const now=Date.now();for(const [key,value] of sessions)if(value.expires<now)sessions.delete(key);for(const [key,value] of attempts)if(value.every(t=>t<now-60000))attempts.delete(key);},60000).unref();
function serial(fn){const task=queue.then(fn,fn);queue=task.catch(()=>{});return task}
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body))};
async function asUser(user,sql,params=[]){await db.query("SELECT set_config('test.uid',$1,false)",[user?.id||'']);await db.exec(`SET ROLE ${user?'authenticated':'anon'}`);try{return await db.query(sql,params)}finally{await db.exec('RESET ROLE')}}
async function snapshot(user){
 const tables={projects:'beta_projects',revivals:'beta_revivals',progress:'beta_progress',comments:'beta_comments',history:'beta_history',nominations:'beta_nominations',revivalHistory:'beta_revival_history'};const result={};
 for(const [key,table] of Object.entries(tables)){result[key]=(await asUser(user,`SELECT * FROM ${table} ORDER BY created_at DESC`)).rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),v])))}
 const counts=(await asUser(user,'SELECT * FROM beta_support_counts()')).rows;
 result.supportCounts=Object.fromEntries(counts.map(r=>[r.project_id,Number(r.supports)]));
 result.supports=[];
 result.history=result.history.map(r=>({...r,from:r.fromStatus,to:r.toStatus}));
 const mediaTypes=(await db.query('SELECT id,mime FROM reboot_private.local_media')).rows;
 result.progress=result.progress.map(r=>({...r,mediaUrl:r.evidenceUrl.startsWith('/api/')?r.evidenceUrl:undefined,mediaType:mediaTypes.find(m=>r.evidenceUrl.endsWith(m.id))?.mime}));
 result.founders=(await asUser(user,'SELECT id,name FROM beta_founders ORDER BY name,id')).rows;
 const publicOwners=(await db.query('SELECT o.project_id,o.user_id FROM reboot_private.beta_owners o JOIN public.beta_projects p ON p.id=o.project_id WHERE NOT p.anonymous AND NOT p.hidden')).rows;
 result.projects=result.projects.map(p=>({...p,founderId:publicOwners.find(o=>o.project_id===p.id)?.user_id}));
 const manageable=user?(await db.query('SELECT revival_id FROM reboot_private.beta_contributors WHERE user_id=$1',[user.id])).rows.map(r=>r.revival_id):[];
 const own=user?(await db.query('SELECT project_id FROM reboot_private.beta_owners WHERE user_id=$1',[user.id])).rows.map(r=>r.project_id):[];
 result.revivals=result.revivals.map(r=>({...r,canManage:r.status==='active'&&(own.includes(r.projectId)||manageable.includes(r.id)),canSucceed:r.status==='active'&&own.includes(r.projectId)}));
 result.comments=result.comments.map(r=>({...r,founder:'Community member'}));result.revivals=result.revivals.map(r=>({...r,founder:'Contributor'}));
 result.reports=[];result.ownedProjectIds=[];result.supportedProjectIds=[];result.notifications=[];
 if(user){result.ownedProjectIds=(await db.query('SELECT project_id FROM reboot_private.beta_owners WHERE user_id=$1',[user.id])).rows.map(r=>r.project_id);result.supportedProjectIds=(await db.query('SELECT project_id FROM reboot_private.beta_supports WHERE user_id=$1',[user.id])).rows.map(r=>r.project_id);result.notifications=(await asUser(user,'SELECT beta_inbox() AS inbox')).rows[0].inbox;if(user.moderator)result.reports=(await asUser(user,'SELECT beta_moderation_queue() AS reports')).rows[0].reports.map(r=>({id:r.id,projectId:r.project_id,reason:r.reason,resolved:r.resolved,createdAt:r.created_at}));}
 result.profile={name:user?.name||'Visitor',projects:0,revivals:0,successfulRevivals:0,contributions:0,reputation:0,achievements:[]};
 if(user){const projects=result.ownedProjectIds.length;const revivals=Number((await db.query('SELECT count(*)::int AS n FROM reboot_private.beta_revival_authors WHERE user_id=$1',[user.id])).rows[0].n);const completed=Number((await db.query("SELECT count(DISTINCT r.id)::int AS n FROM public.beta_revivals r JOIN public.beta_projects p ON p.id=r.project_id JOIN reboot_private.beta_contributors c ON c.revival_id=r.id WHERE r.status='succeeded' AND NOT p.hidden AND c.user_id=$1",[user.id])).rows[0].n);const contributions=Number((await db.query('SELECT count(DISTINCT p.project_id)::int AS n FROM reboot_private.beta_progress_authors a JOIN public.beta_progress p ON p.id=a.progress_id WHERE a.user_id=$1',[user.id])).rows[0].n);const achievements=[...(contributions?['First evidence contribution']:[]),...(projects?['First project submitted']:[]),...(revivals?['First revival attempt']:[]),...(completed?['First successful revival']:[])];result.profile={name:user.name,projects,revivals,successfulRevivals:completed,contributions,reputation:achievements.length*25,achievements};}
 return result;
}

const server=http.createServer(async(req,res)=>{
 try{
  if(!req.url?.startsWith('/api/beta/'))return send(res,404,{error:'Not found'});
  const token=req.headers.cookie?.match(/(?:^|;\s*)reboot_session=([a-f0-9]+)/)?.[1];let user=token?sessions.get(token):null;if(user&&user.expires<Date.now()){sessions.delete(token);user=null;}
  if(req.method==='GET'&&req.url.startsWith('/api/beta/founders/'))return await serial(async()=>{const id=req.url.split('/').pop();if(!/^[a-f0-9-]{36}$/.test(id))return send(res,404,{error:'Founder not found'});const raw=(await asUser(user,'SELECT beta_public_founder($1) AS profile',[id])).rows[0].profile;return raw?send(res,200,publicProfile(raw)):send(res,404,{error:'Founder not found'});});
  if(req.method==='GET'&&req.url==='/api/beta/health')return send(res,200,{ready:true});
  if(req.method==='GET'&&req.url==='/api/beta/snapshot')return send(res,200,await serial(async()=>({session:user?{id:user.id,name:user.name,moderator:user.moderator}:null,snapshot:await snapshot(user)})));
  if(req.method==='GET'&&req.url.startsWith('/api/beta/media/'))return await serial(async()=>{const id=req.url.split('/').pop();if(!/^[a-f0-9-]{36}$/.test(id))return send(res,404,{error:'Not found'});const row=(await db.query('SELECT * FROM reboot_private.local_media WHERE id=$1',[id])).rows[0];const visible=(await asUser(user,'SELECT id FROM beta_progress WHERE evidence_url=$1',[`/api/beta/media/${id}`])).rows.length;if(!row||(!visible&&row.user_id!==user?.id))return send(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':row.mime,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(Buffer.from(row.body));});
  if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{error:'JSON request required'});
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'Origin mismatch'});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>3_000_000)return send(res,413,{error:'Upload is too large'});}const input=JSON.parse(body||'{}');
  if(['/api/beta/login','/api/beta/register'].includes(req.url))return await serial(async()=>{
   const key=req.socket.remoteAddress;const recent=(attempts.get(key)||[]).filter(t=>t>Date.now()-60000);if(recent.length>=12)return send(res,429,{error:'Too many attempts. Try again in a minute.'});attempts.set(key,[...recent,Date.now()]);
   const email=String(input.email||'').trim().toLowerCase(),password=String(input.password||'');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<12||password.length>128)return send(res,400,{error:'Use a valid email and a password of 12–128 characters.'});
   let account=(await db.query('SELECT * FROM reboot_private.local_accounts WHERE email=$1',[email])).rows[0];
   if(req.url.endsWith('/register')){if(account)return send(res,400,{error:'Unable to register with these details.'});const name=String(input.name||'').trim();if(name.length<2||name.length>80)return send(res,400,{error:'Name must be 2–80 characters.'});const salt=randomBytes(16).toString('hex'),id=randomUUID(),digest=scryptSync(password,salt,64).toString('hex');await db.transaction(async tx=>{await tx.query('INSERT INTO auth.users VALUES($1)',[id]);await tx.query('INSERT INTO reboot_private.local_accounts VALUES($1,$2,$3,$4,$5)',[id,email,name,salt,digest]);await tx.query('INSERT INTO public.beta_founders VALUES($1,$2)',[id,name])});account={id,email,name,salt,digest};}
   const actual=scryptSync(password,account?.salt||'not-a-real-user',64),expected=Buffer.from(account?.digest||'00'.repeat(64),'hex');if(!account||!timingSafeEqual(actual,expected))return send(res,401,{error:'Invalid email or password.'});
   if(token)sessions.delete(token);const value=randomBytes(32).toString('hex');const moderator=!!(await db.query('SELECT 1 FROM reboot_private.beta_moderators WHERE user_id=$1',[account.id])).rows.length;sessions.set(value,{id:account.id,name:account.name,moderator,expires:Date.now()+8*3600000});res.setHeader('Set-Cookie',`reboot_session=${value}; HttpOnly; SameSite=Strict; Path=/api/beta; Max-Age=28800${req.headers.origin?.startsWith('https:')?'; Secure':''}`);return send(res,200,{ok:true});
  });
  if(req.url==='/api/beta/logout'){if(token)sessions.delete(token);res.setHeader('Set-Cookie','reboot_session=; HttpOnly; SameSite=Strict; Path=/api/beta; Max-Age=0');return send(res,200,{ok:true});}
  if(!user)return send(res,401,{error:'Sign in to participate.'});
  if(req.url==='/api/beta/outcome')return await serial(async()=>{const result=await asUser(user,'SELECT beta_finish_revival($1,$2,$3,$4) AS result',[input.revivalId,input.status,input.result,input.evidenceUrl||'']);return send(res,200,result.rows[0].result)});
  if(req.url==='/api/beta/command')return await serial(async()=>{const p={...input.payload};if(input.action==='progress'&&p.evidenceUrl?.startsWith('/api/')){const mediaId=p.evidenceUrl.split('/').pop();if(!/^[a-f0-9-]{36}$/.test(mediaId)||!(await db.query('SELECT 1 FROM reboot_private.local_media WHERE id=$1 AND user_id=$2',[mediaId,user.id])).rows.length)return send(res,403,{error:'Upload your own evidence file first.'});}if(input.action==='submit')p.founder=user.name;const result=(await asUser(user,'SELECT beta_command($1,$2::jsonb) AS result',[input.action,JSON.stringify(p)])).rows[0].result;return send(res,200,result)});
  if(req.url==='/api/beta/upload')return await serial(async()=>{
   if((await db.query('SELECT 1 FROM reboot_private.beta_restrictions WHERE user_id=$1',[user.id])).rows.length)return send(res,403,{error:'Account restricted'});
   const match=String(input.data||'').match(/^data:(image\/(?:png|jpeg|webp)|video\/(?:mp4|webm));base64,([A-Za-z0-9+/=]+)$/);if(!match)return send(res,400,{error:'Use PNG, JPEG, WebP, MP4 or WebM.'});const content=Buffer.from(match[2],'base64');if(content.length>2_000_000||content.length<16)return send(res,400,{error:'File must be under 2 MB.'});
   const sig=content.subarray(0,16);const valid=match[1]==='image/png'?sig.subarray(0,8).toString('hex')==='89504e470d0a1a0a':match[1]==='image/jpeg'?sig[0]===255&&sig[1]===216&&sig[2]===255:match[1]==='image/webp'?sig.toString('ascii',0,4)==='RIFF'&&sig.toString('ascii',8,12)==='WEBP':match[1]==='video/mp4'?sig.toString('ascii',4,8)==='ftyp':sig.subarray(0,4).toString('hex')==='1a45dfa3';if(!valid)return send(res,400,{error:'File content does not match its type.'});
   if((await db.query('SELECT count(*)::int AS n FROM reboot_private.local_media WHERE user_id=$1',[user.id])).rows[0].n>=30)return send(res,429,{error:'Account media limit reached.'});const id=randomUUID();await db.query('INSERT INTO reboot_private.local_media VALUES($1,$2,$3,$4)',[id,user.id,match[1],content]);return send(res,200,{url:`/api/beta/media/${id}`});
  });
  return send(res,404,{error:'Not found'});
 }catch(error){send(res,400,{error:error.message?.includes('constraint')?'The submitted content does not meet the field requirements.':error.message||'Request failed'});}
});
server.listen(Number(process.env.REBOOT_BETA_PORT||4318),'127.0.0.1',()=>console.log('Isolated beta API ready on 127.0.0.1:4318'));
