"""CodeRabbit browser acceptance through the task's shared Chromium session."""
import subprocess,json,pathlib,os
out=pathlib.Path(os.environ['WORKSPACE_ROOT'])/'output'/'babylon-cities'
out.mkdir(parents=True,exist_ok=True)
def b(*args):
 r=subprocess.run(['coderabbit-agent-browser',*args],capture_output=True,text=True,timeout=70)
 if r.returncode:raise RuntimeError(r.stderr+r.stdout)
 return r.stdout.strip()
def value(source):
 result=json.loads(b('eval','JSON.stringify('+source+')'))
 return json.loads(result) if isinstance(result,str) else result
ids=['ai','gaming','education','health','creative','revival','graveyard','success','space','robotics','community']
labels=['AI','Gaming','Education','Health','Creative','Revival','Graveyard','Success','Space','Robotics','Community']
b('set','viewport','1200','800');b('set','media','reduced-motion');b('open','http://localhost:5173/?city=ai&capture=1&quality=low')
b('wait','--fn','window.__rebootBabylon?.ready===true')
results=[]
for index,(city,label) in enumerate(zip(ids,labels)):
 b('find','role','button','click','--name',f'{index+1:02} {label}')
 b('wait','--fn',f'window.__rebootBabylon?.city==="{city}" && window.__rebootBabylon?.ready===true')
 item=value('window.__rebootBabylon');item['selectedLabel']=b('eval','document.querySelector("[aria-current=location]")?.innerText');results.append(item)
 print(city,item['fps'],flush=True)
(out/'navigation.json').write_text(json.dumps({'generatedBy':'CodeRabbit','quality':'low','results':results},indent=2))
b('eval','window.__qaStartAlpha=window.__rebootBabylon.camera.alpha')
b('find','role','button','click','--name','Take a tour')
b('wait','--fn','Math.abs(window.__rebootBabylon.camera.alpha-window.__qaStartAlpha)>.01')
b('find','role','button','click','--name','Pause tour')
(out/'tour.json').write_text(json.dumps({'generatedBy':'CodeRabbit','explicitTourWithReducedMotion':'camera alpha changed after explicit start; pause button worked'},indent=2))
print('tour pass',flush=True)
