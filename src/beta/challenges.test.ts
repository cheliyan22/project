import {describe,it,expect} from 'vitest'
import {weeklyChallenges} from './challenges'
import type {Snapshot} from './data'
const empty:Snapshot={projects:[],revivals:[],progress:[],comments:[],supports:[],history:[],nominations:[],reports:[]}
describe('weekly participation',()=>{
 it('starts Monday UTC and awards no activity to an empty community',()=>{
  const r=weeklyChallenges(empty,[],new Date('2026-11-08T23:59:00Z'));expect(r.startsAt).toBe('2026-11-02T00:00:00.000Z');expect(r.challenges.every(c=>!c.complete)).toBe(true)
 })
 it('counts unique owned projects, excluding repeats, other founders and earlier weeks',()=>{
  const events=['mine','mine','other'].map((projectId,i)=>({id:String(i),projectId,from:'abandoned' as const,to:'discovered' as const,reason:'Test evidence',createdAt:'2026-11-07T00:00:00Z'}))
  events.push({...events[0],projectId:'old',createdAt:'2026-10-01T00:00:00Z'})
  const r=weeklyChallenges({...empty,history:events},['mine','old'],new Date('2026-11-07T00:00:00Z'));expect(r.challenges[0].progress).toBe(1)
 })
})
