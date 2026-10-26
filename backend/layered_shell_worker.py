"""Offline layered-shell job: own analytic matrices and CalculiX solve only."""
from projected_shell_kernel import *
from solid_results import CASES
VERSION='layered-shell-v1'
FORMULATION='projected-layered-shell-v1'

def scalar_fields(t):
 a,b,c,d,e=[t[...,j]for j in range(5)];radius=np.sqrt(((a-b)/2)**2+c*c)
 return {'S11':a,'S22':b,'S12':c,'SMax':(a+b)/2+radius,'SMin':(a+b)/2-radius,'SVM':np.sqrt(a*a-a*b+b*b+3*c*c),'S13Avg':d,'S23Avg':e,'SMaxAvg':np.sqrt(d*d+e*e)}

def summarize(folder,snapshot,job_id):
 p=snapshot['project'];m=read(folder/'mesh.json');D,S,ls=laminate(p);cells=m['elements'];n=len(cells);raw={c:read(folder/c/'independent_fields.json')for c in('DEAD','EQ_Y','EQ_X')};states={};displacements={}
 for c,r in raw.items():
  state=[]
  for e in cells:
   dd=np.array([v for node in e['nodes']for v in r['displacements'][str(node)]]);w=e['x1']-e['x0'];h=e['z1']-e['z0']
   state.append([np.concatenate([operators(w,h,x,z)[0]@dd,operators(w,h,x,z)[1]@dd]).tolist()for x,z in((-1,-1),(1,-1),(-1,1),(1,1))])
  states[c]=np.array(state);displacements[c]={f'N{k}':v[1]for k,v in r['displacements'].items()}
 coordinates={f'N{k}':v for k,v in m['nodes'].items()};coordinates.update({s['sap_joint']:[s['x'],0,s['z']]for s in p['supports']});elements={str(i+1):[f'N{e["nodes"][j]}'for j in(0,1,3,2)]for i,e in enumerate(cells)};summary=[]
 for case,fac in CASES.items():
  state=sum(states[c]*factor for c,factor in fac.items());layers=[]
  for li,l in enumerate(ls):
   yloc=[(l['y0']+l['y1'])/2+sg*(l['y1']-l['y0'])/2/RT for sg in(-1,1)]
   tensor=np.stack([np.concatenate([(state[...,:3]+y*state[...,3:6])@l['Q'].T,state[...,6:8]*l['G']],axis=2)for y in yloc],axis=2)
   fields=scalar_fields(tensor);peaks={};keys={'principal_plane':'SMax','mises_plane':'SVM','t13_avg':'S13Avg','t23_avg':'S23Avg','shear_avg':'SMaxAvg'}
   for key,col in keys.items():
    values=np.maximum(fields[col],0)if key=='principal_plane'else abs(fields[col]);ei,corner,ip=np.unravel_index(np.argmax(values),values.shape);e=cells[ei];node=e['nodes'][corner]
    peaks[key]={'value':float(values[ei,corner,ip]),'signed':float(fields[col][ei,corner,ip]),'element':int(ei+1),'gp':f'C{corner+1}/IP{ip+1}','corner':int(corner+1),'ip':int(ip+1),'ip_location':(-1 if ip==0 else 1)/RT,'xyz_mm':[m['nodes'][str(node)][0],yloc[ip],m['nodes'][str(node)][2]],'location_kind':'element_corner_at_layer_gauss'}
   layers.append({'layer':l['name'],'material':p['layers'][li]['material'],'peaks':peaks})
  uy={key:sum(displacements[c][key]*v for c,v in fac.items())for key in displacements['DEAD']};node=max(uy,key=lambda key:abs(uy[key]));peak={'value':abs(uy[node]),'signed':uy[node],'node':node,'xyz_mm':coordinates[node]}
  reactions={s['sap_joint']:[sum(raw[c]['reactions_N'][s['sap_joint']][j]*v for c,v in fac.items())for j in range(3)]for s in p['supports']};totals=np.sum(list(reactions.values()),axis=0)
  area=(max(m['xs'])-min(m['xs']))*(max(m['zs'])-min(m['zs']));mass=sum(p['materials'][l['material']]['mass_density']*l['thickness']for l in p['layers'])*area;weight=sum(p['materials'][l['material']]['weight_density']*l['thickness']for l in p['layers'])*area
  expected=np.array([mass*p['loads']['x_acceleration']*fac.get('EQ_X',0),mass*p['loads']['y_acceleration']*fac.get('EQ_Y',0),weight*fac.get('DEAD',0)]);residual=totals-expected
  if max(abs(residual))>max(1e-5,max(abs(expected))*1e-7):raise ValueError('分层壳反力平衡未通过：'+str(residual))
  summary.append(dict(case=case,factors=fac,max_abs_uy_mm=peak['value'],max_abs_uy_all_mm=peak['value'],displacement_peak=peak,displacement_all_peak=peak,reactions_N=reactions,resultant_N=totals.tolist(),balance_residual_N=residual.tolist(),layers=layers))
 snapshot_hash=hashlib.sha256(json.dumps(snapshot,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
 return dict(job_id=job_id,input_hash=snapshot_hash,snapshot=snapshot,postprocess=VERSION,formulation='CalculiX 2.23 · 自编投影分层壳 · 独立矩阵求解',nodes=len(m['nodes']),elements=n,summary=summary,coordinates=coordinates,shell_elements=elements,basic_states={c:s.tolist()for c,s in states.items()},basic_displacements=displacements,layer_matrices=[dict(name=l['name'],Q=l['Q'].tolist(),G=l['G'].tolist(),y0=l['y0'],y1=l['y1'])for l in ls],layers=dict(LayerName=[l['name']for l in ls],Dist=[(l['y0']+l['y1'])/2 for l in ls],Thickness=[l['y1']-l['y0']for l in ls],NumIntegrationPts=[2]*len(ls)),locations={l['name']:{'1':-1/RT,'2':1/RT}for l in ls},basis='矩形平板、线弹性、小变形、完全粘结；Y=0参考面。面内层应力取层厚高斯位置的单元独立角点值；横向剪应力为层平均，不与三维实体积分点混用。',provenance=dict(kind='independent-calculix-projected-layered-shell',SAP_used=False,reference_response_used=False,custom_element=True,verified_meshes_mm=[0,50],runtime_parameter_set_is_not_automatically_benchmark_verified=True),created_at=time.strftime('%Y-%m-%d %H:%M:%S'))

def main():
 import argparse
 a=argparse.ArgumentParser();a.add_argument('--input',type=Path,required=True);a.add_argument('--folder',type=Path,required=True);args=a.parse_args();snapshot=read(args.input);folder=args.folder
 build(snapshot['project'],snapshot['mesh_mm'],folder,lambda s:print(s,flush=True));result=summarize(folder,snapshot,folder.name);write(folder/'summary.json',result)
 print('分层壳独立求解、应力恢复和反力平衡完成',flush=True)
if __name__=='__main__':main()
