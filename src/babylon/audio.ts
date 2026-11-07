/** Optional synthesized environmental audio. Created only after an explicit user gesture. */
export class WorldAudio {
 private context:AudioContext|null=null;private gain:GainNode|null=null;private voices:OscillatorNode[]=[];
 async start(city:string,volume:number){
  if(!this.context){this.context=new AudioContext();this.gain=this.context.createGain();this.gain.gain.value=0;this.gain.connect(this.context.destination);
   for(const frequency of [48,72,97]){const voice=this.context.createOscillator();voice.type='sine';voice.frequency.value=frequency;voice.connect(this.gain);voice.start();this.voices.push(voice);}}
  await this.context.resume();this.setCity(city);this.setVolume(volume);
 }
 setCity(city:string){const offset=[...city].reduce((sum,c)=>sum+c.charCodeAt(0),0)%25;this.voices.forEach((voice,i)=>voice.frequency.setTargetAtTime([48,72,97][i]+offset,this.context!.currentTime,2));}
 setVolume(volume:number){if(this.gain&&this.context)this.gain.gain.setTargetAtTime(Math.max(0,Math.min(1,volume))*.035,this.context.currentTime,.15);}
 mute(){this.setVolume(0);}
 dispose(){this.voices.forEach(v=>v.stop());this.voices=[];void this.context?.close();this.context=null;this.gain=null;}
}
