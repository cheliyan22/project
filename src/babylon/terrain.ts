import {seedOf,type CityId} from './profiles';
function terrainHeight(x:number,z:number,seed:number,city:CityId){
 const radius=Math.hypot(x,z),edge=Math.min(1,Math.max(0,(radius-175)/150));
 const wave=Math.sin(x*.018+seed)*Math.cos(z*.014)+Math.sin(x*.039-z*.024)*.4;
 if(city==='gaming')return -25+edge*(10+wave*8);
 if(city==='space')return -1.5+edge*(8+Math.abs(wave)*9-Math.pow(Math.max(0,Math.cos(x*.025)*Math.cos(z*.025)),7)*13);
 const height=18+wave*16;
 if(city==='ai')return -1.5+edge*Math.floor((18+Math.abs(wave)*24)/8)*8;
 if(city==='robotics'||city==='revival'||city==='education')return -1.5+edge*Math.floor(height/5)*5;
 if(city==='graveyard')return -1.5+edge*(8+wave*7);
 return -1.5+edge*height;
}

export function groundHeight(city:CityId,x:number,z:number){return terrainHeight(x,z,seedOf(city)%20,city);}
