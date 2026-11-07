import {describe,it,expect} from 'vitest';
import {getSupportCount,type Snapshot} from './data';
const base:Snapshot={projects:[],revivals:[],progress:[],comments:[],supports:[],history:[],nominations:[],reports:[]};
describe('support aggregates',()=>{
 it('uses authoritative count without generating member records',()=>{expect(getSupportCount({...base,supportCounts:{p:23}},'p')).toBe(23);expect(base.supports).toEqual([])});
 it('rejects corrupt and unsafe counts',()=>{for(const value of [-1,0.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1])expect(getSupportCount({...base,supportCounts:{p:value}},'p')).toBe(0)});
 it('deduplicates real legacy fixture identities and separates projects',()=>{const s={...base,supports:[{projectId:'p',founder:'a'},{projectId:'p',founder:'a'},{projectId:'p',founder:'b'},{projectId:'q',founder:'c'},{projectId:'p',founder:''}]};expect(getSupportCount(s,'p')).toBe(2);expect(getSupportCount(s,'missing')).toBe(0);expect(getSupportCount({...s,supportCounts:{p:0}},'p')).toBe(0)});
});
