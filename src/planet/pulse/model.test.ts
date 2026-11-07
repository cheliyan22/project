import { describe, it, expect } from 'vitest'
import { pulseProjects } from './model'
import type { Snapshot } from '@/beta/data'
const empty: Snapshot = { projects:[],revivals:[],progress:[],comments:[],supports:[],history:[],nominations:[],reports:[] }
describe('City Pulse', () => {
 it('never creates activity or projects for an empty community', () => expect(pulseProjects(empty)).toEqual([]))
 it('routes real lifecycle states without inventing engagement', () => {
 const projects = (['abandoned','discovered','under_revival','revived','completed'] as const).map((status,i)=>({id:String(i),title:'Fixture',description:'Synthetic test fixture only',category:'Creative',anonymous:true,founder:'Anonymous founder',status,createdAt:'2026-01-01',updatedAt:'2026-01-01',requirements:'Help',url:''}))
 const result=pulseProjects({...empty,projects})
 expect(result.map(p=>p.stage)).toEqual([1,2,3,4,5])
 expect(result.map(p=>p.category)).toEqual(['Creator','Creator','IdeaHub','Creator','Legend'])
 expect(result.every(p=>p.followers===0&&p.momentum===0&&p.viewCount===0)).toBe(true)
 expect(result.every(p=>p.founder==='Anonymous founder')).toBe(true)
 })
})
