import type { Snapshot } from './data'
/** UTC calendar weeks, derived from auditable records; no repeatable claim counter. */
export function weeklyChallenges(snapshot: Snapshot, ownedIds: string[], now = new Date()) {
 const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
 start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7)
 const end = new Date(start.getTime() + 7 * 86400000)
 const belongs = (id:string) => ownedIds.includes(id)
 const inWeek = (stamp:string) => Date.parse(stamp) >= +start && Date.parse(stamp) < +end
 const discoveries = new Set(snapshot.history.filter(e=>belongs(e.projectId)&&e.to==='discovered'&&inWeek(e.createdAt)).map(e=>e.projectId)).size
 const revivals = new Set(snapshot.history.filter(e=>belongs(e.projectId)&&e.to==='revived'&&inWeek(e.createdAt)).map(e=>e.projectId)).size
 const evidence = new Set(snapshot.progress.filter(e=>belongs(e.projectId)&&!!e.evidenceUrl&&inWeek(e.createdAt)).map(e=>e.projectId)).size
 return { startsAt:start.toISOString(), endsAt:end.toISOString(), challenges: [
  {id:'discover',title:'Find the potential',description:'Move five of your archived ideas into discovery with a reason.',progress:discoveries,target:5},
  {id:'revive',title:'One second beginning',description:'Revive one project with recorded evidence of work.',progress:revivals,target:1},
  {id:'evidence',title:'Show the work',description:'Document meaningful progress on an unfinished project.',progress:evidence,target:1},
 ].map(c=>({...c,complete:c.progress>=c.target})) }
}
