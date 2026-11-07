import { getSupportCount, type Project, type Snapshot } from '../beta/data';
import type { CityId } from './profiles';
/** Every monument corresponds to a saved project; empty data produces an empty district ledger. */
export function projectsForCity(snapshot:Snapshot,city:CityId):Project[]{
 return snapshot.projects.filter(project=>{
  if(city==='graveyard')return project.status==='abandoned';
  if(city==='revival')return project.status==='under_revival';
  if(city==='success')return project.status==='completed'||snapshot.history.some(h=>h.projectId===project.id&&h.to==='completed');
  return project.category.toLowerCase()===city;
 }).sort((a,b)=>a.id.localeCompare(b.id));
}
export function projectSignals(snapshot:Snapshot,project:Project){
 return {level:({abandoned:1,discovered:2,under_revival:3,revived:4,completed:5} as const)[project.status],support:getSupportCount(snapshot,project.id),evidence:snapshot.progress.filter(p=>p.projectId===project.id).length};
}
