/** Isolated local beta client. All mutations are authorized by the local API. */
export type Status = 'abandoned' | 'discovered' | 'under_revival' | 'revived' | 'completed';
export const CATEGORIES = ['AI', 'Gaming', 'Education', 'Health', 'Creative', 'Space', 'Robotics', 'Community'] as const;
export type Project = {founderId?:string;id:string; title:string; description:string; category:string; anonymous:boolean; founder:string; status:Status; createdAt:string; updatedAt:string; requirements:string; url:string};
export type Revival = {status:'active'|'succeeded'|'failed'|'withdrawn';result:string;evidenceUrl:string;canManage?:boolean;canSucceed?:boolean;id:string; projectId:string; reason:string; proposedChanges:string; newDirection:string; requirements:string; createdAt:string; founder:string};
export type Progress = {id:string; projectId:string; body:string; evidenceUrl:string; mediaUrl?:string; mediaType?:string; createdAt:string};
export type Comment = {id:string; projectId:string; body:string; parentId?:string; founder:string; createdAt:string};
export type RevivalHistory={id:string;revivalId:string;projectId:string;fromStatus:string;toStatus:string;result:string;evidenceUrl:string;createdAt:string};
export type PublicFounder={id:string;name:string;projects:Project[];revivals:Revival[];contributions:Progress[];counts:{submitted:number;abandoned:number;revivalAttempts:number;successfulRevivals:number;evidenceContributions:number};achievements:string[];reputation:number};
export type Snapshot = {supportCounts?:Record<string,number>;founders?:{id:string;name:string}[];revivalHistory?:RevivalHistory[];notifications?:{id:string;projectId:string;body:string;createdAt:string}[];projects:Project[]; revivals:Revival[]; progress:Progress[]; comments:Comment[]; supports:{projectId:string;founder:string}[]; history:{id:string;projectId:string;from:Status;to:Status;reason:string;createdAt:string}[]; nominations:{projectId:string;reason:string;createdAt:string}[]; reports:{id:string;projectId:string;reason:string;resolved:boolean;createdAt:string}[]};
const EMPTY:Snapshot={projects:[],revivals:[],progress:[],comments:[],supports:[],history:[],nominations:[],reports:[]};
type Session={id:string;name:string;moderator:boolean};
let session:Session|null=null;
let state:Snapshot=EMPTY;
let owned:string[]=[];
let supported:string[]=[];
let profile={name:'Visitor',projects:0,revivals:0,successfulRevivals:0,contributions:0,reputation:0,achievements:[] as string[]};
const listeners=new Set<()=>void>();
export const getSnapshot=()=>state;
export const getSession=()=>session;
export const getOwnedProjectIds=()=>owned;
export const getSupportedProjectIds=()=>supported;
export const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}};
async function request(path:string,body?:unknown){const response=await fetch('/api/beta/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},credentials:'same-origin',body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json().catch(()=>{throw new Error('The project archive is temporarily unavailable. Please retry shortly.');});if(!response.ok)throw new Error(typeof data?.error==='string'?data.error:'Request failed');return data;}
export async function refresh(){const data=await request('snapshot');session=data.session;state=data.snapshot;profile=data.snapshot.profile;owned=data.snapshot.ownedProjectIds||[];supported=data.snapshot.supportedProjectIds||[];listeners.forEach(fn=>fn());}
export async function login(email:string,password:string){await request('login',{email,password});await refresh();}
export async function register(email:string,password:string,name:string){await request('register',{email,password,name});await refresh();}
export async function logout(){await request('logout',{});await refresh();}
async function command(action:string,payload:unknown){const result=await request('command',{action,payload});await refresh();return result;}
export async function submitProject(input:{title:string;description:string;category:string;anonymous?:boolean;requirements?:string;url?:string}){const result=await command('submit',input);return state.projects.find(p=>p.id===result.id)!;}
export async function startRevival(projectId:string,input:{reason:string;proposedChanges:string;newDirection:string;requirements:string}){return command('revival',{projectId,...input});}
export async function addProgress(projectId:string,input:{body:string;evidenceUrl?:string;mediaUrl?:string;mediaType?:string}){let evidenceUrl=input.evidenceUrl;if(input.mediaUrl)evidenceUrl=(await request('upload',{data:input.mediaUrl})).url;return command('progress',{projectId,body:input.body,evidenceUrl});}
export async function addComment(projectId:string,body:string,parentId?:string){return command('comment',{projectId,body,parentId});}
export async function supportProject(projectId:string){return command(supported.includes(projectId)?'unsupport':'support',{projectId});}
export const TRANSITIONS:Record<Status,Status[]>={abandoned:['discovered'],discovered:['under_revival','abandoned'],under_revival:['revived','abandoned'],revived:['completed','abandoned'],completed:['abandoned']};
export async function transitionProject(projectId:string,status:Status,reason:string){return command('transition',{projectId,status,reason});}
export async function nominateProject(projectId:string,reason:string){return command('nominate',{projectId,reason});}
export async function reportProject(projectId:string,reason:string){return command('report',{projectId,reason});}
export async function resolveReport(reportId:string){const report=state.reports.find(r=>r.id===reportId);if(!report)throw new Error('Report not found');return command('moderate',{projectId:report.projectId,hidden:true});}
export async function unblockUser(projectId:string,userId:string){return command('unblock',{projectId,userId});}
export async function blockUser(projectId:string,userId:string){return command('block',{projectId,userId});}
export async function restrictAccount(projectId:string,userId:string,reason:string){return command('restrict',{projectId,userId,reason});}
export async function inviteContributor(projectId:string,revivalId:string,userId:string){return command('invite',{projectId,revivalId,userId});}
export function getProfile(){return profile;}
if(typeof window!=='undefined')void refresh().catch(()=>{ /* UI remains empty until local API is ready. */ });

export async function fetchFounder(id:string):Promise<PublicFounder>{return request('founders/'+encodeURIComponent(id));}
export async function finishRevival(revivalId:string,status:'succeeded'|'failed'|'withdrawn',result:string,evidenceUrl=''){await request('outcome',{revivalId,status,result,evidenceUrl});await refresh();}

export function getSupportCount(snapshot:Snapshot,projectId:string):number{if(snapshot.supportCounts&&Object.prototype.hasOwnProperty.call(snapshot.supportCounts,projectId)){const count=snapshot.supportCounts[projectId];return Number.isSafeInteger(count)&&count>=0?count:0;}return new Set(snapshot.supports.filter(s=>s.projectId===projectId&&typeof s.founder==='string'&&s.founder.trim()).map(s=>s.founder)).size;}
