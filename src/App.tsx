import { lazy, Suspense } from 'react';
const Hub=lazy(()=>import('./beta-ui/Hub'));
const World=lazy(()=>import('./babylon/World'));
const Legacy=lazy(()=>import('./LegacyApp'));
export default function App(){
 const path=window.location.pathname;
 return <Suspense fallback={<div role="status" style={{position:'fixed',inset:0,display:'grid',placeItems:'center',background:'#0c1c28',color:'#e6ebed',fontFamily:'sans-serif'}}>Opening Reboot…</div>}>
  {/^\/hub\/?$/.test(path)?<Hub/>:path==='/legacy'||/^\/(beta|u)(\/|$)/.test(path)?<Legacy/>:<World/>}
 </Suspense>;
}
