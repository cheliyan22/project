import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, Color, type ShaderMaterial } from 'three'
import { type CityId } from '../cityRegistry'
import { useEnvironment } from './ScenePrimitives'
export const SKIES: Record<CityId,[string,string]> = {
 Graveyard:['#101426','#454657'],IdeaHub:['#355b6b','#c7b58f'],Legend:['#648aa3','#efc997'],AI:['#0d2449','#36556e'],
 Gaming:['#17132f','#574366'],Education:['#5b8ead','#d2d8c3'],Health:['#598b9c','#bfd5c4'],Creator:['#1b1233','#694d75'],
 Space:['#030617','#101c3d'],Robotics:['#263e52','#9a8874'],Community:['#689db5','#e3d2ad'],
}
export const SKY_FOG: Record<CityId,string> = {
 Graveyard:'#30303f',IdeaHub:'#81988c',Legend:'#b5b4a6',AI:'#203e52',Gaming:'#342b4b',Education:'#9ab6b1',
 Health:'#9fbdb0',Creator:'#453653',Space:'#0c1830',Robotics:'#68777a',Community:'#a3b09b',
}
const fragmentShader = `
 #include <common>
 #include <dithering_pars_fragment>
 varying vec3 vPosition;
 uniform vec3 top;uniform vec3 horizon;uniform float time;uniform float space;uniform float daylight;uniform float detail;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
 float clouds(vec2 p){return noise(p)*.5+noise(p*2.03)*.26+noise(p*4.01)*.14+noise(p*8.07)*.07+noise(p*16.13)*.03;}
 void main(){
   vec3 d=normalize(vPosition);
   vec3 color=mix(horizon,top,smoothstep(-.12,.8,d.y));
   if(space<.5){
     vec3 sun=normalize(vec3(.42,.48,.72));float alignment=max(0.,dot(d,sun));
     float haze=pow(1.-clamp(abs(d.y),0.,1.),5.);
     color+=horizon*haze*.1;
     color+=vec3(1.,.72,.41)*pow(alignment,24.)*.28*daylight;
     color+=vec3(1.,.88,.65)*smoothstep(.999,.9997,alignment)*2.4*daylight;
     if(detail>.5&&d.y>.035){
       vec2 p=d.xz/max(.12,d.y)*1.6+vec2(time*.007,0.);
       float density=smoothstep(.46,.75,clouds(p));
       float fade=smoothstep(.035,.2,d.y)*(1.-smoothstep(.75,1.,d.y));
       vec3 cloud=mix(horizon*.85,vec3(.92,.94,.95),daylight*.65);
       float lightEdge=smoothstep(.2,.8,clouds(p+normalize(sun.xz)*.18));
       cloud+=vec3(.12,.1,.08)*lightEdge*daylight;
       color=mix(color,cloud,density*fade*.7);
     }
     color=mix(horizon*.52,color,smoothstep(-.55,.02,d.y));
   }else{
     vec2 uv=vec2(atan(d.z,d.x),asin(clamp(d.y,-1.,1.)));
     vec2 grid=uv*vec2(310.,260.);vec2 id=floor(grid);float seed=hash(id);
     float star=pow(max(0.,1.-length(fract(grid)-.5)*2.),10.)*step(.989,seed);
     float band=exp(-pow((d.y+.18*sin(d.x*4.))*3.,2.));
     float dust=detail>.5?clouds(uv*5.+vec2(8.)):0.;
     color+=mix(vec3(.14,.2,.36),vec3(.28,.14,.35),dust)*band*dust*.5;
     color+=mix(vec3(.62,.77,1.),vec3(1.,.87,.65),seed)*star*1.8;
   }
   gl_FragColor=vec4(color,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   #include <dithering_fragment>
 }
`
/** Directional sky light, layered cloud fields and a star field with no remote textures. */
export function CitySky({city}:{city:CityId}) {
 const {lowEffects,reduced}=useEnvironment(),material=useRef<ShaderMaterial>(null)
 const uniforms=useMemo(()=>({top:{value:new Color(SKIES[city][0])},horizon:{value:new Color(SKIES[city][1])},time:{value:0},space:{value:city==='Space'?1:0},daylight:{value:['Graveyard','AI','Gaming','Creator'].includes(city)?.22:1},detail:{value:lowEffects?0:1}}),[city,lowEffects])
 useFrame((_,delta)=>{if(material.current&&!reduced)material.current.uniforms.time.value+=Math.min(delta,.1)})
 return <mesh name={`${city}-sky`} renderOrder={-100} frustumCulled={false}><sphereGeometry args={[450,64,32]}/><shaderMaterial ref={material} uniforms={uniforms} side={BackSide} depthWrite={false} dithering
 vertexShader="varying vec3 vPosition;void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}"
 fragmentShader={fragmentShader}/></mesh>
}
