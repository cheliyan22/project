import { ReflectionLighting } from './environment/ReflectionLighting'
import { SKY_FOG } from './environment/CitySky'
import { WORLD_PROFILES } from './worldManifest'
import { ExplorationHUD } from './exploration/ExplorationHUD'
import { Weather,WeatherControl } from './environment/Weather'
import { ZeroScene } from '../zero/ZeroScene'
import { isZeroProject,recordedViews,sceneBuildings } from '@/planet/lib/projectDiscovery'
import { LandmarkConsole } from './environment/LandmarkConsole'
import { useDistrictSignals } from './environment/districtSignals'
import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ACESFilmicToneMapping, HalfFloatType, SRGBColorSpace, UnsignedByteType } from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SoftShadows } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { supportsHdrBuffers } from '@/planet/lib/hdrSupport'
import { HdrGuard } from '@/planet/lib/HdrGuard'
import { OrbitalWorld } from './OrbitalWorld'
import { ArrivalCamera } from './ArrivalCamera'
import { FlightDeck } from './FlightDeck'
import { useJourney } from '@/planet/stores/journey'
import { CityLife } from './CityLife'
import { EnvironmentSettings } from './environment/ScenePrimitives'
import { CITY_STORIES, CITY_LIGHTING } from './environment/cityDesign'
import { ViewpointCamera } from './environment/ViewpointCamera'
import { WorldControls } from './WorldControls'
import { useUI } from '@/planet/stores/ui'
import { useAuth, useProjects } from '@/planet/stores/auth'
import { planPlanet } from '@/planet/modules/city/CityModule'
import { ProjectDetail } from '@/planet/modules/city/CityVisualization'
import { CustomizationPanel } from '@/planet/components/CustomizationPanel'
import { CITIES, isCityId, CITY_CATEGORIES, CITY_LABELS, CITY_ENV } from './cityRegistry'
import { DISTRICT_MAP } from '@/planet/types/project'
import { CITY_SCENES } from './cityScenes'
import { PortalTransition } from './PortalTransition'
import { useCityNavigation, useMotionSettings } from './hooks/useCityNavigation'
import { PersonalCityScene } from './PersonalCityScene'
import { useEconomy } from '@/planet/stores/economy'

const Exploration = lazy(() => import('./exploration/Exploration'))
const WorldsScene = lazy(() => import('@/planet/modules/city/MiniatureWorlds').then(m => ({default: m.WorldsScene})))
class SceneBoundary extends Component<{children: ReactNode; onError: () => void; fallback: ReactNode}, {failed: boolean}> {
  state = {failed: false}
  static getDerivedStateFromError() { return {failed: true} }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
function Ready({ onReady }: {onReady: () => void}) {
  const frames = useRef(0)
  const invalidate = useThree(s => s.invalidate)
  useFrame(() => {
    frames.current++
    if (frames.current === 3) onReady()
    if (frames.current < 3) invalidate()
  })
  return null
}
function ContextHealth({ onLost }: {onLost: () => void}) {
  const gl = useThree(s => s.gl)
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onLost() }
    gl.domElement.addEventListener('webglcontextlost', lost)
    return () => gl.domElement.removeEventListener('webglcontextlost', lost)
  }, [gl, onLost])
  return null
}
function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2')
    if (!context) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch { return false }
}

export function CityWorldManager() {
  const {phase, destination, busy} = useCityNavigation()
  const {reduced, lowEffects, setLowEffects} = useMotionSettings()
  const hdr = supportsHdrBuffers()
  const [hdrFailed, setHdrFailed] = useState(false)
  const useHdr = hdr && !hdrFailed
  const category = useUI(s => s.cityCategory)
  const exploring = useUI(s => s.exploring)
  const mode = useUI(s => s.mode)
  const introducing = useJourney(s => s.introducing)
  const hub = !category && mode !== 'personal' && mode !== 'zero' && mode !== 'worlds'
  const projects = useProjects(s => s.projects)
  const projectError = useProjects(s => s.error)
  const projectsLoading = useProjects(s => s.loading)
  const selectedId = useUI(s => s.selectedProjectId)
  const selectProject = useUI(s => s.selectProject)
  const error = useUI(s => s.travelError)
  const status = useUI(s => s.statusFilter)
  const sort = useUI(s => s.sortFilter)
  const filter = useUI(s => s.categoryFilter)
  const [guideOpen,setGuideOpen]=useState(false)
  const [readyKey, setReadyKey] = useState('')
  const [viewpoint, setViewpoint] = useState({view:'Entrance',request:0})
  useEffect(()=>setViewpoint({view:'Entrance',request:0}),[category])
  const [webgl, setWebgl] = useState(supportsWebGL)
  useEffect(() => { if (!webgl) useJourney.getState().finishEntry() }, [webgl])
  const veil = useRef<HTMLDivElement>(null)
  const user = useAuth(s => s.user)
  const landmarkOpen = useDistrictSignals(s => !!s.landmark || !!s.resident)
  useEffect(() => {
    useDistrictSignals.getState().close()
    return () => useDistrictSignals.getState().close()
  }, [category])
  useEffect(() => {if(selectedId) useDistrictSignals.getState().signal()}, [selectedId])
  const canCustomize = true
  const key = category ?? mode
  const visible = useMemo(() => {
    let list = projects.filter(p=>mode==='zero'?isZeroProject(p):!isZeroProject(p)).filter(p => (!category || p.category === category || (category==='Graveyard'&&p.status==='abandoned')) && (!status || p.status === status))
    if (!category && !busy && filter) list = list.filter(p => p.category === filter)
    return [...list].sort((a,b) => sort === 'alphabetical' ? a.name.localeCompare(b.name) : sort === 'trending' ? b.followers-a.followers : sort === 'revived' ? Number(b.status==='reviving')-Number(a.status==='reviving') : sort === 'abandoned' ? Number(b.status==='abandoned')-Number(a.status==='abandoned') : +new Date(b.createdAt)-+new Date(a.createdAt))
  }, [projects, category, status, sort, filter, busy,mode])
  const rendered=useMemo(()=>sceneBuildings(visible,selectedId),[visible,selectedId])
  const planet = useMemo(() => planPlanet(rendered), [rendered])
  const customizations=useUI(s=>s.customizations)
  const placements=useEconomy(s=>s.placements)
  const ownership=useEconomy(s=>s.ownership)
  const collisionRevision=useMemo(()=>JSON.stringify([lowEffects,rendered.map(p=>[p.id,p.category,p.stage,p.status,p.buildingCustomization,customizations[p.id]]),placements,ownership]),[lowEffects,rendered,customizations,placements,ownership])
  const customizing = useUI(s=>s.customizingProjectId)
  const selected = projects.find(p => p.id === selectedId)
  const Scene = mode==='personal'?PersonalCityScene:mode==='zero'?ZeroScene:category ? CITY_SCENES[category] : null
  const env = mode==='personal'?{bg:'#07111d',fogNear:130,fogFar:390}:category ? CITY_ENV[category]! : {bg:'#03050a', fogNear:260, fogFar:700}
  const lighting=category&&isCityId(category)?CITY_LIGHTING[category]:{sky:'#9bc4ff',sun:'#cfe2ff',intensity:1.6}
  const name = mode==='personal'?'My City':mode==='zero'?'Zero Hub':category ? CITY_LABELS[category] : mode === 'worlds' ? 'Worlds' : 'Reboot'
  const tintCity = destination ?? category ?? 'AI'
  const accent = isCityId(tintCity) ? CITIES[tintCity].palette.accent : '#3DD8FF'
  useEffect(() => {
    if (!webgl && phase !== 'idle') {
      useUI.getState().advanceTravel(useUI.getState().travelId, phase === 'loading' ? 'departing' : phase === 'departing' ? 'crossing' : phase === 'crossing' ? 'arriving' : 'idle')
    }
  }, [webgl, phase])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('dialog[open]') || event.key !== 'Escape' || /INPUT|TEXTAREA/.test((event.target as HTMLElement).tagName)) return
      const state = useUI.getState()
      if (useJourney.getState().introducing) { useJourney.getState().finishEntry(); return }
      if (state.travelPhase !== 'idle') state.cancelTravel()
      else if (state.exploring) state.setExploring(false)
      else if (state.selectedProjectId) state.selectProject(null)
      else if (state.mode==='personal') state.setMode('city')
      else if (state.cityCategory==='Graveyard')state.setMode('graveyard')
      else if (state.cityCategory) state.exitCity()
    }
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('keydown', escape); document.body.style.cursor = '' }
  }, [])
  useEffect(() => { document.body.style.cursor = '' }, [key])
  const onReady = useMemo(() => () => setReadyKey(key), [key])
  const onLost = useMemo(() => () => {setWebgl(false); useUI.getState().setExploring(false); useUI.getState().cancelTravel('Graphics connection lost. Project navigation is still available.')}, [])
  const fallback = <div className="world-fallback"><h2>3D view unavailable</h2><p>You can still explore cities and open their projects using the controls below.</p></div>
  const walk = () => {
    if (!webgl || busy || readyKey !== key) return
    setViewpoint({view:'Entrance',request:0})
    useUI.getState().setExploring(true)
    if (useUI.getState().exploring) useJourney.getState().signal('walk')
  }
  const frameLandmark = () => {
    if (!webgl || busy || readyKey !== key) return
    setViewpoint(v => ({view:'Landmark',request:v.request+1})); useJourney.getState().signal('landmark')
  }
  return <div className={`absolute inset-0 dawn-world ${hub ? 'is-orbital' : 'is-surface'}`} data-city={category ?? 'hub'} data-travel-phase={phase} data-introducing={introducing} data-reduced-motion={reduced} data-exploring={exploring} data-graphics={webgl}>
    {webgl ? <SceneBoundary onError={() => {setWebgl(false); useUI.getState().setExploring(false); useUI.getState().cancelTravel('The 3D scene could not load. Project navigation is still available.')}} fallback={fallback}>
      <Canvas camera={{position:[0,26,124], fov:50, near:.25, far:1200}}
        shadows={!lowEffects} dpr={[1, lowEffects ? 1 : 2]} gl={{toneMapping:ACESFilmicToneMapping,outputColorSpace:SRGBColorSpace,antialias:!lowEffects, powerPreference:'high-performance', preserveDrawingBuffer:true}} frameloop={reduced && !busy && !exploring && !introducing ? 'demand' : 'always'}>
        <color attach="background" args={[env.bg]} /><fog attach="fog" args={[category && isCityId(category) ? SKY_FOG[category] : env.bg, env.fogNear+25, env.fogFar+60]} />
        {!lowEffects && <SoftShadows size={18} samples={12} focus={.2} />}
        <ReflectionLighting enabled={!lowEffects && !!category && isCityId(category)} city={category && isCityId(category) ? category : 'AI'} />
        <ambientLight intensity={category ? .22 : .9} />
        <hemisphereLight args={[lighting.sky,'#454339',category ? .55 : .65]} />
        <directionalLight position={[-45,35,-35]} intensity={category ? .55 : .2} color={lighting.sky} />
        <directionalLight castShadow={!lowEffects} shadow-mapSize={[lowEffects?2048:4096,lowEffects?2048:4096]} shadow-camera-left={-72} shadow-camera-right={72} shadow-camera-top={72} shadow-camera-bottom={-72} shadow-camera-near={20} shadow-camera-far={320} shadow-bias={-.00012} shadow-normalBias={.025} position={[60,80,140]} intensity={lighting.intensity*1.25} color={lighting.sun} />
        <EnvironmentSettings.Provider value={{reduced,lowEffects}}><Suspense fallback={null}>
          {Scene ? <Scene key={key} projects={rendered} selectedId={selectedId} onSelect={p => {if (!busy) selectProject(p.id)}} /> : mode === 'worlds' ? <WorldsScene projects={planet} /> : <OrbitalWorld reduced={reduced} lowEffects={lowEffects} />}
          {(category||mode==='zero')&&<Weather />}<>{mode==='zero'&&<CityLife city="Community" reduced={reduced} lowEffects={lowEffects}/>} {category && isCityId(category) && <CityLife key={category} city={category} reduced={reduced} lowEffects={lowEffects} />}</>
          <Ready key={`ready-${key}`} onReady={onReady} />
          {exploring && !busy && ((category && isCityId(category)) || mode==='personal') && <Suspense fallback={null}><Exploration key={key} city={category && isCityId(category) ? category : 'Community'} collisionRevision={collisionRevision} paused={!!selectedId || landmarkOpen} reduced={reduced} /></Suspense>}
        </Suspense></EnvironmentSettings.Provider>
        <PortalTransition color={accent} reduced={reduced} lowEffects={lowEffects} ready={readyKey === key} veil={veil} />
        {hub && <ArrivalCamera reduced={reduced} ready={readyKey === key} />}
        {!busy && !exploring && !introducing && <WorldControls key={key} city={!!category||mode==='zero'||mode==='personal'} reduced={reduced} />}
        {!busy && mode==='zero' && <ViewpointCamera city="Community" view="Entrance" request={0} reduced={reduced}/>}
        {!busy && !exploring && category && isCityId(category) && <ViewpointCamera city={category} view={viewpoint.view} request={viewpoint.request} reduced={reduced} />}
        {!lowEffects && category && isCityId(category) && <EffectComposer multisampling={0} frameBufferType={useHdr ? HalfFloatType : UnsignedByteType}>
          <N8AO quality="high" aoRadius={2.4} distanceFalloff={1.2} intensity={1.35} denoiseSamples={8} denoiseRadius={8} halfRes depthAwareUpsampling />
          <Bloom mipmapBlur intensity={.55} luminanceThreshold={useHdr ? 1 : .8} luminanceSmoothing={.22} radius={.72} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <SMAA />
          <HdrGuard active={useHdr} onFail={() => setHdrFailed(true)} />
        </EffectComposer>}
        <ContextHealth onLost={onLost} />
      </Canvas>
    </SceneBoundary> : fallback}
    <div className="dawn-vignette" />
    <div ref={veil} className="portal-veil" style={{opacity:0}} />
    <FlightDeck hub={hub} city={category && isCityId(category) ? category : null} ready={webgl ? readyKey === key : true} graphics={webgl} onLandmark={frameLandmark} onWalk={walk} />
    {exploring && <ExplorationHUD />}
    {!busy && !introducing && projectError && <div className="world-data-status" role="status">{projectError}<button disabled={projectsLoading} onClick={() => void useProjects.getState().fetchProjects()}>{projectsLoading ? 'Retrying…' : 'Retry project records'}</button></div>}
    <div className={`world-hud ${busy || introducing ? 'is-travelling' : ''}`}>
      <section className="world-identity" aria-live="polite"><p className="label-mono">REBOOT / {mode==='personal'?'PERSONAL BUILD DISTRICT':category ? 'CONNECTED DISTRICT' : `${CITY_CATEGORIES.length-1} DISTRICTS`}</p>
        <h1 style={{color:accent}}>{name}</h1><p>{mode==='personal'?'Your persistent corner of Reboot. Place one free design, build with owned structures, and walk the streets you create.':category && isCityId(category) ? WORLD_PROFILES[category].copy : mode==='zero'?'A quiet home for ideas below 100 unique beta-member views. At 100, they join their category district.':'Explore a district, or visit Zero Hub for ideas finding their first audience.'}</p>
      </section>
      {mode==='personal' && <button className="world-return btn" onClick={() => useUI.getState().setMode('city')} disabled={busy}>← Return to World Hub</button>}
      {category && <button className="world-return btn" onClick={() => category==='Graveyard'?useUI.getState().setMode('graveyard'):useUI.getState().exitCity()} disabled={busy}>← {category==='Graveyard'?'Return to planet':'Return to World Hub'}</button>}
      {mode==='personal' && !exploring && <section className="city-field-guide personal-city-guide">
        <button className="explore-world" disabled={busy || !webgl || readyKey !== key} onClick={walk}>Explore My City →</button>
        <p className="label-mono">{placements.length} {placements.length===1?'BUILDING':'BUILDINGS'} PLACED</p>
        <p className="muted">Use the Building Shop to place, reposition, or customize your structures. Owned buildings stay yours when removed from the grid.</p>
      </section>}
      {category && isCityId(category) && !exploring && <section className="city-field-guide">
        <button className="explore-world" disabled={busy || !webgl || readyKey !== key} onClick={walk}>Explore World →</button>
        <p className="label-mono">{CITIES[category].landmark}</p>
        <button className="field-guide-toggle" aria-expanded={guideOpen} onClick={()=>setGuideOpen(!guideOpen)}>{guideOpen?'Close city controls':'Explore this city'}</button>
        {guideOpen&&<><nav aria-label="City viewpoints">{['Entrance','Path','Landmark','Skyline','Activity'].map(view=><button key={view} disabled={busy} aria-pressed={viewpoint.view===view} onClick={()=>setViewpoint(v=>({view,request:v.request+1}))}>{view}</button>)}</nav>
        <button className="landmark-open" onClick={()=>useDistrictSignals.getState().open(category)}>Activate landmark ↗</button>
        <details><summary>Explore this place</summary><p>{CITY_STORIES[category].atmosphere}</p><ul>{CITY_STORIES[category].sites.map(site=><li key={site}>{site}</li>)}</ul><p>{CITY_STORIES[category].roles.join(' · ')}</p></details></>}
      </section>}
      {(category||mode==='zero')&&<WeatherControl />}<div className="world-quality"><label><input type="checkbox" checked={lowEffects} onChange={e => setLowEffects(e.target.checked)} /> Reduced effects</label></div>
      <nav className="city-destinations" aria-label="City destinations">{CITY_CATEGORIES.map(c => <button key={c} disabled={busy} aria-pressed={category === c} style={{'--city-color':CITIES[c].palette.accent} as React.CSSProperties} onClick={() => useUI.getState().enterCity(c)}>{CITY_LABELS[c]}</button>)}</nav>
      {mode!=='personal' && <section className="world-projects" data-empty={visible.length===0}><p className="muted">Up to 120 buildings shown. {useProjects.getState().hasMore&&<button onClick={()=>useProjects.getState().fetchProjects(true)}>Load more records</button>}</p><h2 className="label-mono">{visible.length} projects / {name}</h2><div>
        {visible.map(p => <button key={p.id} disabled={busy} aria-pressed={selectedId === p.id} onClick={() => selectProject(p.id)}><span style={{color:DISTRICT_MAP[p.category].theme.color}}>◆</span> {p.name}{mode==='zero'&&` · ${recordedViews(p)}/100`}</button>)}
        {!visible.length && <p>No projects match this district and filter.</p>}
      </div></section>}

      {!busy && mode!=='personal' && <LandmarkConsole />}
      {mode!=='personal' && selected && !busy && !landmarkOpen && <>{customizing !== selected.id && <ProjectDetail project={selected} canCustomize={!!(selected.temporary || (user && selected.ownerId === user.uid))} onClose={() => selectProject(null)} />}{canCustomize && <CustomizationPanel projectId={selected.id} projectName={selected.name} />}</>}
    </div>
    {error && <div className="world-error" role="alert">{error}<button onClick={() => window.location.reload()}>Reload</button><button onClick={() => useUI.getState().cancelTravel()}>Dismiss</button></div>}
  </div>
}
