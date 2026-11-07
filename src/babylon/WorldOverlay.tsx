import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Compass, Layers3, Maximize2, MousePointer2, Pause, Play, Rotate3D, SlidersHorizontal, Volume2, VolumeX, RotateCcw, Bell, UserRound, Settings2, X } from 'lucide-react';
import { getSnapshot, subscribe } from '../beta/data';
import './world.css';
import { projectsForCity } from './pulse';
import { cityFromQuery } from './profiles';

interface Props {
  city: string;
  onCity: (id: string) => void;
  ready: boolean;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  onQuality: (quality: 'low' | 'medium' | 'high' | 'ultra') => void;
  introActive: boolean;
  onSkipIntro: () => void;
  onReplayIntro: () => void;
  onEnterIntro: () => void;
  introSeconds?: number;
  transitioning?: boolean;
  audioEnabled?: boolean;
  onAudio?: () => void;
  volume?: number;
  onVolume?: (volume: number) => void;
  onProjectSelect?: (id: string) => void;
  touring: boolean;
  onTour: () => void;
  projectCount: number;
  fps: number;
  error: string | null;
  /** World picking can supply a project; the required navigation contract stays small. */
  selectedProject?: { id: string; title: string; status: string } | null;
  onCloseProject?: () => void;
}

const DISTRICTS = [
  { id: 'ai', name: 'AI City', label: 'Intelligence', title: 'Thought, given form.', description: 'A computational civilisation of connected minds, suspended structures, and luminous neural pathways.', color: '#a2d8ff', category: 'AI' },
  { id: 'gaming', name: 'Gaming City', label: 'Imagination', title: 'Play beyond possibility.', description: 'Impossible arenas and layered worlds. A city for the ideas that turn spectators into players.', color: '#ddbcff', category: 'Gaming' },
  { id: 'education', name: 'Education City', label: 'Knowledge', title: 'Every idea opens a door.', description: 'Terraced archives and monumental places of learning, built around the exchange of knowledge.', color: '#f1d2a2', category: 'Education' },
  { id: 'health', name: 'Health City', label: 'Regeneration', title: 'Designed to flourish.', description: 'Branching architecture, living gardens, and spaces where technology makes room for life.', color: '#b8e4c1', category: 'Health' },
  { id: 'creative', name: 'Creative City', label: 'Expression', title: 'Nothing follows a template.', description: 'Sculptural forms and unexpected silhouettes. A landscape for experiments that deserve to be seen.', color: '#ffc3bf', category: 'Creative' },
  { id: 'revival', name: 'Revival City', label: 'Transformation', title: 'The next chapter is being built.', description: 'An architecture of becoming. Unfinished structures reflect the work of bringing ideas back to life.', color: '#e8d59e', category: '' },
  { id: 'graveyard', name: 'Graveyard', label: 'Remembrance', title: 'Unfinished is not forgotten.', description: 'Quiet monuments and fractured horizons preserve the stories of ideas waiting for another beginning.', color: '#bdc9cf', category: '' },
  { id: 'success', name: 'Success City', label: 'Achievement', title: 'What persistence makes possible.', description: 'Open plazas and completed monuments celebrate projects that made the journey from forgotten to finished.', color: '#f3e3ab', category: '' },
  { id: 'space', name: 'Space City', label: 'Discovery', title: 'A different kind of horizon.', description: 'Orbital habitats and suspended infrastructure, composed at the scale of a civilisation beyond the ground.', color: '#bdc6ff', category: 'Space' },
  { id: 'robotics', name: 'Robotics City', label: 'Engineering', title: 'A world in the making.', description: 'Mechanical landmarks and automated infrastructure. Precision, movement, and the ambition to build.', color: '#f4bc8b', category: 'Robotics' },
  { id: 'community', name: 'Community City', label: 'Belonging', title: 'Great things happen together.', description: 'Connected neighbourhoods and shared spaces. A city shaped around people, participation, and possibility.', color: '#d4e0aa', category: 'Community' },
];

export default function WorldOverlay({ city, onCity, ready, quality, onQuality, touring, onTour, projectCount, fps, error, selectedProject, onCloseProject, introActive, onSkipIntro, onReplayIntro, onEnterIntro, introSeconds, transitioning = false, audioEnabled = false, onAudio, volume = .35, onVolume, onProjectSelect }: Props) {
  const introduced = !introActive;
  const [introElapsed, setIntroElapsed] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const rail = useRef<HTMLDivElement>(null);
  const index = Math.max(0, DISTRICTS.findIndex(d => d.id === city));
  const district = DISTRICTS[index];
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const projects = projectsForCity(snapshot, cityFromQuery(city));
  const [dismissedProject, setDismissedProject] = useState<string | null>(null);
  const picked = selectedProject && selectedProject.id !== dismissedProject ? selectedProject : null;
  const selected = picked ? snapshot.projects.find(p => p.id === picked.id) ?? { ...picked, description: 'Discover this project and its revival journey in Zero Hub.', founder: '' } : projects.find(p => p.id === expandedProject);

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReducedMotion(query.matches); };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => { setExpandedProject(null); }, [city]);
  useEffect(() => { setDismissedProject(null); }, [selectedProject?.id]);

  const chooseCity = (id: string) => {
    onCity(id);
    if (introActive) onSkipIntro();
    setShowProjects(false);
  };
  const navigateRail = (event: KeyboardEvent<HTMLButtonElement>, position: number) => {
    let next: number;
    if (event.key === 'ArrowRight') next = (position + 1) % DISTRICTS.length;
    else if (event.key === 'ArrowLeft') next = (position + DISTRICTS.length - 1) % DISTRICTS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = DISTRICTS.length - 1;
    else return;
    event.preventDefault();
    const button = rail.current?.querySelectorAll<HTMLButtonElement>('button')[next];
    button?.focus();
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    chooseCity(DISTRICTS[next].id);
  };
  useEffect(() => {
    if (!introActive || !ready) { setIntroElapsed(0); return; }
    const start = performance.now();
    const timer = window.setInterval(() => setIntroElapsed((performance.now() - start) / 1000), 200);
    return () => window.clearInterval(timer);
  }, [introActive, ready]);
  const elapsed = reducedMotion ? 22 : introSeconds ?? introElapsed;
  const phase = elapsed < 3 ? 'A signal in the silence' : elapsed < 7 ? 'A world of unfinished possibility' : elapsed < 11 ? 'Eleven cities. Infinite beginnings.' : elapsed < 15 ? 'Every light holds a possibility' : elapsed < 19 ? 'Some endings are entrances' : 'Welcome to Reboot';
  const identityVisible = elapsed >= 19;
  const enter = () => { onEnterIntro(); };

  return <div className={`bw-overlay ${introduced ? 'bw-entered' : 'bw-introduction bw-cinematic-intro'} ${transitioning ? 'bw-changing-city' : ''}`} style={{ '--bw-accent': district.color } as CSSProperties}>
    <div className="bw-vignette" aria-hidden="true" /><div className="bw-transition-veil" aria-hidden="true" />
    <header className="bw-header">
      <a className="bw-brand" href="/hub" aria-label="Reboot — return to Zero Hub"><img className="bw-brand-logo" src="/favicon.svg" alt="" width="36" height="36"/><span>REBOOT<small>WORLD ATLAS</small></span></a>
      <div className="bw-location"><span className="bw-coordinate">{String(index + 1).padStart(2, '0')} / 11</span><span>{district.name}</span><span className="bw-ready-dot" data-ready={ready && !error} aria-hidden="true" /></div>
      <nav className="bw-main-links" aria-label="Reboot navigation"><a className="bw-archive-link" href="/hub">Zero Hub <ArrowUpRight size={14} aria-hidden="true" /></a>{introduced&&<><a href="/hub?section=profile" title="Founder profile" aria-label="Founder profile"><UserRound size={17}/></a><a href="/hub?section=notifications" title="Notifications" aria-label="Notifications"><Bell size={17}/></a><button onClick={()=>setShowSettings(!showSettings)} aria-expanded={showSettings} aria-controls="bw-settings" title="World settings" aria-label="World settings"><Settings2 size={17}/></button></>}{introActive&&onAudio&&<button onClick={onAudio} aria-pressed={audioEnabled} aria-label={audioEnabled?'Mute introduction sound':'Enable introduction sound'} title={audioEnabled?'Mute sound':'Enable sound'}>{audioEnabled?<Volume2 size={16}/>:<VolumeX size={16}/>}</button>}{introActive&&<button className="bw-skip-intro" onClick={onSkipIntro}>Skip introduction <ArrowRight size={13}/></button>}</nav>
    </header>

    {!introduced && <section className={`bw-intro-copy bw-planet-intro ${identityVisible?'bw-identity-visible':''}`} aria-labelledby="bw-intro-title">
      <div className="bw-cinema-caption" aria-live="off"><span className="bw-cinema-phase">0{elapsed<3?1:elapsed<7?2:elapsed<11?3:elapsed<15?4:elapsed<19?5:6} / 06</span><span>{phase}</span></div>
      <div className="bw-identity"><img src="/favicon.svg" alt="" width="58" height="58"/><h1 id="bw-intro-title">REBOOT</h1><p>Abandoned projects finally get a home.</p></div>
      <div className="bw-intro-actions"><button className="bw-enter-button" onClick={enter} disabled={!ready}>{ready ? 'Enter Reboot' : 'Preparing your arrival'}{ready ? <ArrowRight size={17} aria-hidden="true" /> : <span className="bw-loading-mark" aria-hidden="true" />}</button><a href="/hub">Explore the archive <ArrowUpRight size={13} aria-hidden="true" /></a></div>
      <div className="bw-intro-note"><Compass size={13} aria-hidden="true" /> {reducedMotion?'Reduced motion · a still welcome':'Eleven cities. A second chance for every idea.'}</div>
    </section>}

    {introduced && <section className="bw-city-copy" aria-labelledby="bw-city-title" key={city}>
      <div className="bw-eyebrow">District {String(index + 1).padStart(2, '0')} <span className="bw-eyebrow-divider" /> {district.label}</div>
      <h1 id="bw-city-title">{district.name}</h1>
      <p className="bw-city-tagline">{district.title}</p>
      <p className="bw-city-description">{district.description}</p>
      <button className="bw-project-button" onClick={() => setShowProjects(!showProjects)} aria-expanded={showProjects} aria-controls="bw-projects"><span className="bw-project-count">{projects.length}</span> recorded {projects.length === 1 ? 'project' : 'projects'} here <ChevronDown size={14} aria-hidden="true" /></button>
    </section>}

    {introduced && <aside className="bw-toolbox" aria-label="World controls">
      <button className={touring ? 'bw-tool-active' : ''} onClick={onTour} aria-pressed={touring} title={touring ? 'Pause cinematic tour' : 'Start cinematic tour'}>{touring ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}<span>{touring ? 'Pause tour' : 'Take a tour'}</span></button>
      <button onClick={()=>setShowSettings(!showSettings)} aria-expanded={showSettings} aria-controls="bw-settings" title="Rendering quality"><SlidersHorizontal size={16} aria-hidden="true" /><span>{quality[0].toUpperCase()+quality.slice(1)} detail</span></button>
      <button onClick={() => setShowControls(!showControls)} aria-expanded={showControls} aria-controls="bw-controls"><MousePointer2 size={16} aria-hidden="true" /><span>Controls</span></button>
    </aside>}

    {introduced && showSettings && <section className="bw-glass-panel bw-settings-panel" id="bw-settings" aria-label="World settings"><div className="bw-panel-heading"><span>Your experience</span><button onClick={()=>setShowSettings(false)} aria-label="Close settings"><X size={15}/></button></div><fieldset className="bw-quality-options"><legend>Rendering quality</legend>{(['low','medium','high','ultra'] as const).map(level=><button key={level} aria-pressed={quality===level} onClick={()=>onQuality(level)}>{level[0].toUpperCase()+level.slice(1)}{quality===level&&<Check size={12}/>}</button>)}</fieldset><p className="bw-control-note">Lower quality reduces the rendering workload. Ultra is intended for capable graphics hardware.</p>{onAudio&&<div className="bw-audio-settings"><button onClick={onAudio} aria-pressed={audioEnabled}>{audioEnabled?<Volume2 size={16}/>:<VolumeX size={16}/>} Ambient sound {audioEnabled?'on':'off'}</button>{onVolume&&<label>Volume<input type="range" min="0" max="1" step="0.05" value={volume} onChange={event=>onVolume(Number(event.target.value))}/></label>}</div>}<button className="bw-replay-intro" onClick={()=>{setShowSettings(false);onReplayIntro()}}><RotateCcw size={14}/> Replay introduction</button><a className="bw-settings-account" href="/hub?section=profile">Founder record and account <ArrowUpRight size={12}/></a></section>}

    {introduced && showControls && <section className="bw-glass-panel bw-control-panel" id="bw-controls" aria-label="Exploration controls">
      <div className="bw-panel-heading"><span>Make yourself at home</span><button onClick={() => setShowControls(false)} aria-label="Close controls"><X size={15} /></button></div>
      <p><Rotate3D size={16} aria-hidden="true" /><span><strong>Look around</strong>Drag with your mouse or one finger.</span></p>
      <p><Maximize2 size={16} aria-hidden="true" /><span><strong>Move closer</strong>Scroll or pinch to explore the architecture.</span></p>
      <p><Layers3 size={16} aria-hidden="true" /><span><strong>Change district</strong>Choose a city below. Arrow keys move through the rail.</span></p>
      <div className="bw-control-note">{reducedMotion ? 'Reduced motion is on. Tours start only when you choose.' : 'Pause the tour whenever you want to explore freely.'}</div>
    </section>}

    {introduced && (showProjects || selected) && <section className="bw-glass-panel bw-project-panel" id="bw-projects" aria-label={`${district.name} projects`}>
      <div className="bw-panel-heading"><span>{selected ? 'A story in this city' : 'Ideas with another chapter'}</span><button onClick={() => { setShowProjects(false); setExpandedProject(null); setDismissedProject(selectedProject?.id ?? null); onCloseProject?.(); }} aria-label="Close project list"><X size={15} /></button></div>
      {selected ? <article className="bw-project-story"><span className="bw-eyebrow">{selected.status.replace(/_/g, ' ')}</span><h2>{selected.title}</h2><p>{selected.description}</p>{selected.founder && <span className="bw-project-author">By {selected.founder}</span>}<a href={`/hub?project=${encodeURIComponent(selected.id)}`}>Read its story in Zero Hub <ArrowUpRight size={14} aria-hidden="true" /></a>{!selectedProject && <button className="bw-back-projects" onClick={() => setExpandedProject(null)}><ArrowLeft size={12} /> Back to projects</button>}</article> : projects.length ? <div className="bw-project-list">{projects.map(project => <button key={project.id} onClick={() => { setExpandedProject(project.id); onProjectSelect?.(project.id); }}><span><strong>{project.title}</strong><small>{project.status.replace(/_/g, ' ')} · {project.founder}</small></span><ArrowUpRight size={14} aria-hidden="true" /></button>)}</div> : <div className="bw-project-empty"><p>This district is waiting for its first recorded project.</p><a href="/hub">Give an idea a second chance <ArrowUpRight size={13} aria-hidden="true" /></a></div>}
    </section>}

    {(error || !ready) && <div className={`bw-scene-status ${error ? 'bw-scene-error' : ''}`} role={error ? 'alert' : 'status'}>{error ? <><strong>The world couldn’t finish loading.</strong><span>{error}</span><a href="/hub">The project archive is still available <ArrowUpRight size={13} /></a></> : <><span className="bw-loading-mark" aria-hidden="true" /> Composing {district.name}…</>}</div>}

    {introduced&&<footer className="bw-footer">
      <div className="bw-rail-heading"><span><span className="bw-orbit-mark" aria-hidden="true" /> Eleven worlds. One beginning.</span><span className="bw-rail-direction">Choose your destination <ArrowDown size={11} aria-hidden="true" /></span></div>
      <nav aria-label="City destinations" className="bw-city-rail" ref={rail}>{DISTRICTS.map((item, position) => <button key={item.id} className={city === item.id ? 'bw-city-selected' : ''} aria-current={city === item.id ? 'location' : undefined} onClick={() => chooseCity(item.id)} onKeyDown={event => navigateRail(event, position)}><span className="bw-city-number">{String(position + 1).padStart(2, '0')}</span><span>{item.name.replace(' City', '')}</span>{city === item.id && <Check size={11} aria-hidden="true" />}</button>)}</nav>
      <div className="bw-footer-meta"><span>THE REBOOT EXPERIMENT <span className="bw-meta-separator">/</span> {Math.max(0, projectCount)} recorded {projectCount === 1 ? 'project' : 'projects'}</span><span>{quality.toUpperCase()} DETAIL <span className="bw-meta-separator">/</span> {Number.isFinite(fps) && fps > 0 ? Math.round(fps) : '—'} FPS</span></div>
    </footer>}
  </div>;
}
