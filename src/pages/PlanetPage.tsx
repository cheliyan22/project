import World from '../babylon/World';
export default function PlanetPage({onExit}:{onExit:()=>void}){return <><World/><button onClick={onExit} style={{position:'fixed',right:24,top:85,zIndex:120}}>Return to archive</button></>;}
