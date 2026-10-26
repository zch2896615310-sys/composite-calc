"""Double-precision reconstruction by CCX residual-correction solves.

CCX DAT U is printed to 7 significant digits. Solve K*du = F-K*u using the
SAME analytic K and CCX solver; accumulated U keeps double precision. This is
linear-system iterative refinement, not an engineering load/material change.
No reference response is used or accessible here.
"""
from pathlib import Path
import json,os,subprocess,time
import numpy as np

def refine(folder,raw_run,exe,parse_dat):
 raw=raw_run(folder);input_text=(folder/'panel.inp').read_text();allrows=[]
 for f in sorted((folder.parent/'stiffness').glob('*.mtx')):
  for line in f.read_text().splitlines():
   n,d,m,e,v=line.split(',');allrows.append((3*(int(n)-1)+int(d)-1,3*(int(m)-1)+int(e)-1,float(v)))
 a=np.array(allrows);i=a[:,0].astype(int);j=a[:,1].astype(int);v=a[:,2];neq=int(max(i.max(),j.max()))+1;off=i!=j
 def matvec(u):return np.bincount(i,weights=v*u[j],minlength=neq)+np.bincount(j[off],weights=v[off]*u[i[off]],minlength=neq)
 def vector(result):
  u=np.zeros(neq)
  for sec in result['sections']:
   if sec['kind']=='displacements':
    for r in sec['rows']:u[3*(int(r[0])-1):3*int(r[0])]=r[1:4]
  return u
 f=np.zeros(neq);fixed=[];mode=None
 for line in input_text.splitlines():
  if line.startswith('*'):mode=line.split(',')[0];continue
  if mode=='*CLOAD':n,d,val=line.split(',');f[3*(int(n)-1)+int(d)-1]+=float(val)
  if mode=='*BOUNDARY':n,d,e,val=line.split(',');assert float(val)==0;fixed.extend(3*(int(n)-1)+k-1 for k in range(int(d),int(e)+1))
 free=np.ones(neq,dtype=bool);free[fixed]=False;u=vector(raw);history=[]
 head=input_text[:input_text.index('*CLOAD')];tail=input_text[input_text.index('*NODE PRINT'):]
 env=dict(os.environ,OMP_NUM_THREADS='1',NUMBER_OF_CPUS='1',CCX_NPROC_STIFFNESS='1',CCX_NPROC_RESULTS='1')
 for it in range(3):
  residual=f-matvec(u);residual[~free]=0;maxres=float(max(abs(residual)));history.append({'iteration':it,'max_free_generalized_residual':maxres})
  if it and maxres<1e-6:break
  name=f'precision_correction_{it+1}';text=head+'*CLOAD\n'+'\n'.join(f'{k//3+1},{k%3+1},{val:.11e}'for k,val in enumerate(residual)if val!=0)+'\n'+tail
  (folder/f'{name}.inp').write_text(text,encoding='ascii');t=time.perf_counter();r=subprocess.run([str(exe),'-i',name],cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=env,timeout=300,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
  log=r.stdout.decode(errors='replace');(folder/f'{name}.log').write_text(log,encoding='utf-8')
  if r.returncode or '*ERROR'in log.upper()or'Job finished'not in log:raise RuntimeError(log[-1800:])
  du=vector({'sections':parse_dat(folder/f'{name}.dat')});assert max(abs(du[~free]))==0;u+=du;history[-1].update(correction_max=float(max(abs(du))),solver_elapsed_seconds=time.perf_counter()-t)
 final_res=f-matvec(u);final_res[~free]=0
 evidence={'method':'CCX solves K*du=F-K*u, same K, original engineering F unchanged','reference_data_used':False,'history':history,'final_max_free_generalized_residual':float(max(abs(final_res))),'raw_DAT_significant_digits':7}
 (folder/'precision_refinement.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
 # Keep the native result unmodified and expose a distinct accumulated result.
 result=dict(raw,sections=[dict(kind='displacements',rows=[[n+1,*u[3*n:3*n+3]]for n in range(neq//3)])],precision_refinement=evidence)
 (folder/'refined_results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
 print('REFINE',folder.name,'residual',history[0]['max_free_generalized_residual'],'->',evidence['final_max_free_generalized_residual'],flush=True)
 return result
