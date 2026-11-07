export const CITY_IDS = ['ai','gaming','education','health','creative','revival','graveyard','success','space','robotics','community'] as const;
export type CityId = typeof CITY_IDS[number];
export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type CityProfile = {name:string; sky:string; horizon:string; ground:string; accent:string; sun:string; water:boolean; vegetation:boolean; exposure:number};
export const PROFILES:Record<CityId,CityProfile> = {
 ai:{name:'AI City',sky:'#173c58',horizon:'#a8c5ce',ground:'#243c48',accent:'#6de6ed',sun:'#e9f8ff',water:true,vegetation:false,exposure:1.15},
 gaming:{name:'Gaming City',sky:'#463461',horizon:'#e5b7aa',ground:'#45415a',accent:'#f8be5c',sun:'#ffe9b9',water:false,vegetation:false,exposure:1.2},
 education:{name:'Education City',sky:'#4c8297',horizon:'#e3dbbe',ground:'#9c987b',accent:'#f2ca78',sun:'#ffe8b6',water:true,vegetation:true,exposure:1.12},
 health:{name:'Health City',sky:'#43828e',horizon:'#c4dfc9',ground:'#648073',accent:'#72f1bc',sun:'#f6ffe3',water:true,vegetation:true,exposure:1.2},
 creative:{name:'Creative City',sky:'#776894',horizon:'#eec6b1',ground:'#74727e',accent:'#ff91bb',sun:'#ffe2b9',water:true,vegetation:true,exposure:1.15},
 revival:{name:'Revival City',sky:'#536b73',horizon:'#dfc7a8',ground:'#69645a',accent:'#ffc56d',sun:'#fff0cf',water:false,vegetation:false,exposure:1.15},
 graveyard:{name:'Graveyard',sky:'#3e5461',horizon:'#a9b4af',ground:'#5b6461',accent:'#d4b58c',sun:'#cde3ec',water:true,vegetation:false,exposure:1.05},
 success:{name:'Success City',sky:'#3c739d',horizon:'#eedac0',ground:'#929997',accent:'#f9d981',sun:'#ffedc7',water:true,vegetation:true,exposure:1.15},
 space:{name:'Space City',sky:'#020510',horizon:'#151d37',ground:'#626979',accent:'#9bd4ff',sun:'#d6e3ff',water:false,vegetation:false,exposure:1.35},
 robotics:{name:'Robotics City',sky:'#405b67',horizon:'#b9c2bb',ground:'#526367',accent:'#ffae69',sun:'#ffebcc',water:false,vegetation:false,exposure:1.1},
 community:{name:'Community City',sky:'#5c8e9b',horizon:'#f0d7b5',ground:'#82907c',accent:'#ffc98a',sun:'#ffebbe',water:true,vegetation:true,exposure:1.12},
};
export function cityFromQuery(value:string|null):CityId {
 const aliases:Record<string,CityId>={creator:'creative',ideahub:'revival',legend:'success'};
 const key=(value||'ai').toLowerCase();
 return CITY_IDS.includes(key as CityId)?key as CityId:aliases[key]||'ai';
}
/** Stable integer hash shared by landscape placement and project addresses. */
export function seedOf(value:string){let n=2166136261;for(const c of value)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
export function randomSource(seed:number){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
