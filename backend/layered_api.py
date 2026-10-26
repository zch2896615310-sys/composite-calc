"""Standard-library launcher/validation; never imports or starts SAP."""
from pathlib import Path
import json,math,os,subprocess
ROOT=Path(__file__).resolve().parent
FORMULATION='projected-layered-shell-v1'
VERSION='layered-shell-v1'

def validate(p,size,solid_validate):
 if not isinstance(size,(int,float))or not math.isfinite(size)or size<0:raise ValueError('壳网格须为0（原断点分格）或正数')
 # Reuse existing material/geometry checks; shell cell count is checked below.
 solid_validate(p,max(size,1000000))
 from support_geometry import support_y
 if any(abs(support_y(p,s))>1e-9 for s in p['supports']):raise ValueError('当前已验证分层壳的挂点必须位于参考面Y=0；其他连接面请使用实体模型')
 if len(p['layers'])!=4 or [l['material']for l in p['layers']]!=['MARBLE','STEEL','CORE','STEEL']:raise ValueError('当前分层壳支持石材/钢板/蜂窝芯/钢板四层；其他构造请使用实体模型')
 xs=sorted(set(p['geometry']['x_breaks']+[s['x']for s in p['supports']]));zs=sorted(set(p['geometry']['z_breaks']+[s['z']for s in p['supports']]))
 count=math.prod(sum(math.ceil((b-a)/size)if size else 1 for a,b in zip(axis,axis[1:]))for axis in(xs,zs))
 if count>5000:raise ValueError('分层壳超过5000个平面单元，请增大网格尺寸')
 return True

def compute(job_id,p,size,update):
 folder=ROOT/'runs'/job_id;folder.mkdir(parents=True,exist_ok=True);snapshot=dict(project=p,mesh_mm=size,formulation=FORMULATION,postprocess=VERSION);(folder/'input.json').write_text(json.dumps(snapshot,ensure_ascii=False,indent=2),encoding='utf-8')
 try:
  update(job_id,status='running',message='CalculiX分层壳独立求解中：三个基本工况、精度校正与应力恢复')
  python=Path(os.environ.get('STONECALC_SHELL_PYTHON',str(Path(os.environ.get('USERPROFILE','C:/Users/Admin'))/'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')))
  if not python.is_file():raise ValueError('未找到分层壳NumPy运行环境，请配置STONECALC_SHELL_PYTHON')
  with(folder/'worker.log').open('w',encoding='utf-8')as log:
   r=subprocess.run([str(python),str(ROOT/'layered_shell_worker.py'),'--input',str(folder/'input.json'),'--folder',str(folder)],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,env=dict(os.environ,PYTHONUTF8='1'),timeout=900,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
  if r.returncode:raise ValueError('分层壳求解失败，详见 /runs/'+job_id+'/worker.log')
  result=json.loads((folder/'summary.json').read_text(encoding='utf-8'));update(job_id,status='done',message='分层壳计算完成：各层应力、挠度与反力已保存，不调用SAP',result=result)
 except Exception as e:
  (folder/'error.txt').write_text(str(e),encoding='utf-8');update(job_id,status='error',message=str(e))
