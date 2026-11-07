"""Capture the actual shared Preview; requires registered Vite service and WebGL."""
import subprocess,json,pathlib,time,os,sys
out=pathlib.Path(os.environ.get('WORKSPACE_ROOT','.'))/'output'
port=sys.argv[1] if len(sys.argv)>1 else '5173'
folder=out/('before' if port=='5174' else 'cities');folder.mkdir(parents=True,exist_ok=True)
cities={'AI':'ai','Gaming':'gaming','Education':'education','Health':'health','Creator':'creative','IdeaHub':'revival','Graveyard':'graveyard','Legend':'success','Space':'space','Robotics':'robotics','Community':'community'}
def browser(*args):
 r=subprocess.run(['coderabbit-agent-browser',*args],capture_output=True,text=True,timeout=90)
 if r.returncode:raise RuntimeError(r.stderr or r.stdout)
 return r.stdout.strip()
browser('set','viewport','1200','800');browser('set','media','reduced-motion')
results=[]
for city,name in cities.items():
 browser('open',f'http://localhost:{port}/record-cities.html?city={city}')
 for attempt in range(30):
  state=browser('eval',"document.querySelector('[data-render-state]')?.dataset.renderState")
  if 'painted' in state:break
  time.sleep(.5)
 else:raise RuntimeError(f'{city} did not paint: {state}')
 time.sleep(1)
 # Hide interface chrome consistently, leaving every rendered world pixel intact.
 browser('eval',"document.querySelectorAll('.dawn-world > *').forEach(el=>{if(!el.querySelector('canvas'))el.style.visibility='hidden'})")
 browser('screenshot',str(folder/(name+'.png')))
 metrics=browser('eval','JSON.stringify({probe:window.__rebootRender,metrics:window.__rebootMetrics})')
 results.append({'city':city,'result':metrics,'screenshot':name+'.png'})
 print(city,'painted',flush=True)
(folder/'capture-results.json').write_text(json.dumps({'viewport':[1200,800],'camera':[92,66,128],'target':[0,16,0],'reducedEffects':True,'reducedMotion':True,'results':results},indent=2))
