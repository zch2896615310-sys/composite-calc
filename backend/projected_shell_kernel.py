"""Verified flat layered-shell formulation; independent CalculiX matrix solve.
Custom element, not native S4. Reference datasets are NOT runtime dependencies.
"""
from pathlib import Path
import collections,hashlib,json,math,os,sys,subprocess,time
import numpy as np
APP=Path(__file__).resolve().parent
sys.path.insert(0,str(APP/'engines/calculix'))
from run_model import split_axis,parse_dat
from layered_precision import refine
RT=math.sqrt(3)
GP=[(-1/RT,-1/RT),(1/RT,-1/RT),(-1/RT,1/RT),(1/RT,1/RT)]
INDEX5=[6*i+j for i in range(4)for j in(0,1,2,3,5)]
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))

def write(p,v):Path(p).write_text(json.dumps(v,ensure_ascii=False,indent=2),encoding='utf-8')

def native_run(folder):
 # CCX 2.23's matrix reader uses Fortran unit 20. Do not read several element
 # matrix files concurrently through that shared unit (mafillsm.f:323-338).
 env=dict(os.environ,OMP_NUM_THREADS='1',NUMBER_OF_CPUS='1',CCX_NPROC_STIFFNESS='1',CCX_NPROC_RESULTS='1')
 start=time.perf_counter();r=subprocess.run([str(Path(os.environ['STONECALC_CCX'])),'-i','panel'],cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=env,timeout=300,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
 log=r.stdout.decode(errors='replace');(folder/'solver.log').write_text(log,encoding='utf-8')
 if r.returncode or '*ERROR'in log.upper()or'Job finished'not in log:raise RuntimeError(f'CCX returned {r.returncode}: {log[-1800:]}')
 result={'elapsed_seconds':time.perf_counter()-start,'returncode':r.returncode,'sections':parse_dat(folder/'panel.dat'),'matrix_assembly_threads':1};write(folder/'results.json',result);return result

def plane_q(m):
 if 'engineering_constants'in m:E1,E2=m['engineering_constants'][:2];nu=m['engineering_constants'][3];G=m['engineering_constants'][6]
 else:E1=E2=m['E'];nu=m['nu'];G=E1/(2*(1+nu))
 den=1-nu**2*E2/E1
 return np.array([[E1/den,nu*E2/den,0],[nu*E2/den,E2/den,0],[0,0,G]])

def laminate(p):
 D=np.zeros((6,6));S=np.zeros((2,2));layers=[];y=0.
 for l in p['layers']:
  t=l['thickness'];m=p['materials'][l['material']];Q=plane_q(m)
  I=[t,((y+t)**2-y*y)/2,((y+t)**3-y**3)/3]
  D[:3,:3]+=Q*I[0];D[:3,3:]+=Q*I[1];D[3:,:3]+=Q*I[1];D[3:,3:]+=Q*I[2]
  if 'engineering_constants'in m:g=m['engineering_constants'][7:9]
  else:g=[m['E']/(2*(1+m['nu']))]*2
  G=np.array(g)*5/6;S+=np.diag(G)*t
  layers.append({'name':l['name'],'y0':y,'y1':y+t,'Q':Q,'G':G});y+=t
 return D,S,layers

def membrane_operators(w,h,xi,eta,eas):
 # Physical corner order: bottom-left, bottom-right, top-left, top-right.
 signs=[(-1,-1),(1,-1),(-1,1),(1,1)];B=np.zeros((6,20));Bs=np.zeros((2,20))
 for i,(sx,sz)in enumerate(signs):
  dx=sx*(1+sz*eta)/(2*w);dz=sz*(1+sx*xi)/(2*h);j=i*5
  B[0,j]=dx;B[1,j+2]=dz;B[2,j]=-dz;B[2,j+2]=-dx
  B[3,j+4]=-dx;B[4,j+3]=dz;B[5,j+4]=dz;B[5,j+3]=-dx
  # Shear13 sampled on bottom/top edge midpoints; shear23 on left/right.
  Bs[0,j+1]=-sx*(1+sz*eta)/(2*w);Bs[0,j+4]=(1+sz*eta)/4
  Bs[1,j+1]=sz*(1+sx*xi)/(2*h);Bs[1,j+3]=(1+sx*xi)/4
 if eas==-1:
  # Rectangular B-bar projection: only membrane gamma12 is projected onto
  # the constant strain subspace. Curvature/twisting strains stay Q4.
  # This is an exact L2 strain projection, not a material/output scale.
  for i,(sx,sz)in enumerate(signs):B[2,5*i]=-sz/(2*h);B[2,5*i+2]=-sx/(2*w)
 G=np.zeros((6,max(eas,0)))
 if eas>0:
  M=np.array([[xi,0,0,0],[0,eta,0,0],[0,0,xi,eta]])
  G[:3,:4]=M
  if eas==8:G[3:,4:]=M
 return B,Bs,G

def base36(i):
 s='';a='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
 while i:s=a[i%36]+s;i//=36
 return s.rjust(3,'0')

def operators(w,h,xi,eta,eas=-1):
 B,Bs,G=membrane_operators(w,h,xi,eta,-1);c=np.zeros(20)
 for i,(sx,sz)in enumerate(((-1,-1),(1,-1),(-1,1),(1,1))):c[5*i+3]=sx/(2*w);c[5*i+4]=sz/(2*h)
 Bs[0]-=eta*h/4*c;Bs[1]-=xi*w/4*c
 return B,Bs,G

def physical_element(w,h,D,S,eas=-1):
 K=np.zeros((20,20));v=np.zeros(20)
 for xi,eta in GP:
  B,Bs,G=operators(w,h,xi,eta);K+=(B.T@D@B+Bs.T@S@Bs)*w*h/4
 for i,(sx,sz)in enumerate(((-1,-1),(1,-1),(-1,1),(1,1))):v[5*i+3]=h*sx;v[5*i+4]=w*sz
 K+=np.trace(S)*np.outer(v,v)
 return (K+K.T)/2,np.zeros((0,20))

def element(w,h,D,S,eas=-1):
 physical,A=physical_element(w,h,D,S);K=np.zeros((24,24));K[np.ix_(INDEX5,INDEX5)]=physical
 for xi,eta in GP:
  b=np.zeros(24)
  for i,(sx,sz)in enumerate(((-1,-1),(1,-1),(-1,1),(1,1))):
   dx=sx*(1+sz*eta)/(2*w);dz=sz*(1+sx*xi)/(2*h);N=(1+sx*xi)*(1+sz*eta)/4
   b[6*i]=-dz;b[6*i+2]=dx;b[6*i+4]=2*N
  K+=1e-5*np.trace(D[:3,:3])*np.outer(b,b)*w*h/4
 return (K+K.T)/2,A

def recover(w,h,xy,d,D,S,layers,eas,A):
 B,Bs,G=operators(w,h,*xy);eps=B@d[INDEX5];gamma=Bs@d[INDEX5];rows=[]
 for l in layers:
  for ip,sg in((1,-1),(2,1)):
   y=(l['y0']+l['y1'])/2+sg*(l['y1']-l['y0'])/2/RT
   stress=l['Q']@(eps[:3]+y*eps[3:]);shear=l['G']*gamma
   rows.append({'layer':l['name'],'IP':ip,'Y':y,'stress':[float(x)for x in list(stress)+list(shear)]})
 return rows

def run(folder):return refine(folder,native_run,Path(os.environ['STONECALC_CCX']),parse_dat)

def build(p,size,folder,progress=lambda message:None):
 eas=-1;folder=Path(folder)
 label='R6'
 folder.mkdir(exist_ok=True,parents=True);stiff=folder/'stiffness';stiff.mkdir(exist_ok=True)
 D,S,layers=laminate(p);xs=split_axis(sorted(set(p['geometry']['x_breaks']+[s['x']for s in p['supports']])),size);zs=split_axis(sorted(set(p['geometry']['z_breaks']+[s['z']for s in p['supports']])),size)
 nodes={};lookup={};elements=[];cache={};sourcecards=[]
 for x in xs:
  for z in zs:
   n=len(nodes)+1;nodes[n]=[x,0,z];lookup[round(x,8),round(z,8)]=n
 N=len(nodes)
 for a,b in zip(xs,xs[1:]):
  for c,d in zip(zs,zs[1:]):
   ids=[lookup[round(x,8),round(z,8)]for x,z in((a,c),(b,c),(a,d),(b,d))];key=(round(b-a,7),round(d-c,7))
   if key not in cache:cache[key]=element(b-a,d-c,D,S,eas)
   K,A=cache[key];eid=len(elements)+1;meta={'nodes':ids,'x0':a,'x1':b,'z0':c,'z1':d};elements.append(meta)
   slots=[slot for n in ids for slot in((n,1),(n,2),(n,3),(n+N,1),(n+N,2),(n+N,3))]
   order=sorted(range(24),key=lambda j:slots[j])
   # Emit exactly one triangular matrix entry, including every diagonal.
   fn=stiff/f'e{eid:04d}.mtx'
   with fn.open('w',encoding='ascii')as f:
    for ii,i in enumerate(order):
     for j in order[ii:]:
      if K[i,j]!=0 or i==j:f.write(f'{slots[i][0]},{slots[i][1]},{slots[j][0]},{slots[j][1]},{K[i,j]:.15e}\n')
   sourcecards.append(f'*MATRIX ASSEMBLE,NAME=L{base36(eid)},STIFFNESSFILE=../stiffness/e{eid:04d}.mtx')
 forces={};qmass=sum(p['materials'][l['material']]['mass_density']*l['thickness']for l in p['layers']);weight=sum(p['materials'][l['material']]['weight_density']*l['thickness']for l in p['layers'])
 for case,(dof,q)in {'DEAD':(3,-weight),'EQ_Y':(2,-qmass*p['loads']['y_acceleration']),'EQ_X':(1,-qmass*p['loads']['x_acceleration'])}.items():
  ff=collections.defaultdict(float)
  for e in elements:
   f=q*(e['x1']-e['x0'])*(e['z1']-e['z0'])/4
   for n in e['nodes']:ff[n]+=f
  forces[case]={'dof':dof,'values':dict(ff)}
 boundary=[];supports=[]
 for s in p['supports']:
  n=lookup[round(s['x'],8),round(s['z'],8)];supports.append(dict(s,node=n))
  boundary.extend(f'{n},{d},{d},0'for d in s['dofs'])
 allnodes=dict(nodes);allnodes.update({n+N:[q[0],-100,q[2]]for n,q in nodes.items()})
 model=['*HEADING','Independent projected layered shell: six generalized DOF','*NODE']+[f'{n},{q[0]},{q[1]},{q[2]}'for n,q in allnodes.items()]+sourcecards+['*NSET,NSET=NALL,GENERATE',f'1,{2*N},1','*NSET,NSET=PHYSICAL,GENERATE',f'1,{N},1','*NSET,NSET=SUPPORTS',','.join(str(s['node'])for s in supports),'*BOUNDARY']+boundary
 meta={'formulation':'projected-layered-shell-six-dof-v1','eas':eas,'nodes':nodes,'elements':elements,'supports':supports,'rotation_auxiliary_offset':N,'rotation_slot_mapping':{'RX':'auxiliary_UX','RY':'auxiliary_UY','RZ':'auxiliary_UZ'},'rotational_coordinate_scale':1.,'xs':xs,'zs':zs,'source_project':p,'matrix_file_sha256':{q.name:hashlib.sha256(q.read_bytes()).hexdigest()for q in stiff.glob('*.mtx')}}
 write(folder/'mesh.json',meta)
 for case,ff in forces.items():
  progress('CalculiX 分层壳：'+case)
  dest=folder/case;dest.mkdir(exist_ok=True)
  text=model+['*STEP','*STATIC,SOLVER=SPOOLES','*CLOAD']+[f'{n},{ff["dof"]},{v:.11e}'for n,v in ff['values'].items()]+['*NODE PRINT,NSET=NALL','U','*NODE PRINT,NSET=SUPPORTS','RF','*END STEP']
  inp='\n'.join(text)+'\n';path=dest/'panel.inp'
  fingerprint=hashlib.sha256((inp+json.dumps(meta['matrix_file_sha256'],sort_keys=True)).encode()).hexdigest()
  if path.exists()and path.read_text()==inp and(dest/'independent_fields.json').exists()and read(dest/'independent_fields.json').get('generated_input_fingerprint')==fingerprint:continue
  path.write_text(inp,encoding='ascii');result=run(dest)
  U={}
  for s in result['sections']:
   if s['kind']=='displacements':U.update({int(v[0]):v[1:4]for v in s['rows']})
  assert len(U)==2*N,(len(U),2*N)
  kin={n:[*U[n],*U[n+N]]for n in nodes};internal={n:np.zeros(6)for n in nodes};stress=[]
  for ei,e in enumerate(elements,1):
   w=e['x1']-e['x0'];h=e['z1']-e['z0'];key=(round(w,7),round(h,7));K,A=cache[key];dd=np.array([v for n in e['nodes']for v in kin[n]])
   force=K@dd
   for j,n in enumerate(e['nodes']):internal[n]+=force[j*6:j*6+6]
   for gp,(x,z)in enumerate(GP,1):
    stress.extend([dict(r,element=ei,planar_gp=gp)for r in recover(w,h,(x,z),dd,D,S,layers,eas,A)])
  reactions={}
  for s in supports:
   n=s['node'];v=internal[n][:3].copy();v[ff['dof']-1]-=ff['values'].get(n,0);reactions[s['sap_joint']]=list(map(float,v))
  residual=[]
  for n in nodes:
   vec=internal[n].copy();vec[ff['dof']-1]-=ff['values'].get(n,0)
   restrained=next((s['dofs']for s in supports if s['node']==n),[])
   residual.extend(abs(v)for j,v in enumerate(vec)if j+1 not in restrained)
  fields={'independently_solved_by':'CalculiX *MATRIX ASSEMBLE / SPOOLES','reference_solution_as_input':False,'generated_input_fingerprint':fingerprint,'displacements':{str(k):[v[j]for j in(0,1,2,3,5)]for k,v in kin.items()},'normal_rotations':{str(k):v[4]for k,v in kin.items()},'reactions_N':reactions,'stresses':stress,'max_generalized_free_residual':float(max(residual)),'elapsed_seconds':result['elapsed_seconds']}
  write(dest/'independent_fields.json',fields)
  print('INDEPENDENT',size,eas,case,'UY',max(abs(v[1])for v in kin.values()),'residual',max(residual),flush=True)
 return folder
