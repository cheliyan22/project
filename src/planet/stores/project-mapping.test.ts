import {describe,it,expect,vi,afterEach} from 'vitest'
import {ideaToProject,useProjects} from './auth'
import type {Idea} from '@/lib/supabase'
describe('legacy idea score contract',()=>{
 it('maps the documented 1–5 score directly to growth and 20–100 momentum',()=>{
  const idea={id:'fixture',category:'AI',status:'abandoned',is_anonymous:true,creator_name:'Private identity',revival_score:5} as Idea
  const result=ideaToProject(idea)
  expect(result.stage).toBe(5);expect(result.momentum).toBe(100);expect(result.founder).toBe('Anonymous')
 })
})


describe('isolated project loading',()=>{
 afterEach(()=>{vi.unstubAllGlobals();useProjects.setState({projects:[],loading:false,error:null})})
 it('uses failure story when the legacy description is empty',()=>{
  const idea={id:'fixture',category:'AI',status:'abandoned',description:'',failure_story:'Original story'} as Idea
  expect(ideaToProject(idea).description).toBe('Original story')
  expect(ideaToProject({...idea,description:'Full description'}).description).toBe('Full description')
 })
 it('exposes pending state and prevents overlapping refreshes',async()=>{
  let finish!:(response:Response)=>void
  const fetch=vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve}))
  vi.stubGlobal('fetch',fetch)
  useProjects.setState({error:'Previous failure'})
  const pending=useProjects.getState().fetchProjects()
  expect(useProjects.getState().loading).toBe(true)
  expect(useProjects.getState().error).toBeNull()
  await useProjects.getState().fetchProjects()
  expect(fetch).toHaveBeenCalledTimes(1)
  finish(new Response(JSON.stringify({session:null,snapshot:{projects:[],supports:[],progress:[],revivals:[],profile:{}}})))
  await pending
  expect(useProjects.getState().loading).toBe(false)
  expect(useProjects.getState().error).toBeNull()
 })
 it('releases loading after a rejected refresh',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')))
  await useProjects.getState().fetchProjects()
  expect(useProjects.getState().loading).toBe(false)
  expect(useProjects.getState().error).toContain('unavailable')
 })
})
