"""Standalone standard-library CalculiX model generator and runner. N-mm-s.
Development/validation runner; project data in project.json.
"""
from pathlib import Path
import argparse, json, math, subprocess, os, re, time
from material_adapter import ccx_constants

ROOT=Path(__file__).resolve().parent

def split_axis(breaks, size):
    out=[float(breaks[0])]
    for a,b in zip(breaks,breaks[1:]):
        n=math.ceil((b-a)/size) if size else 1
        out.extend(a+(b-a)*i/n for i in range(1,n+1))
    return out

def generate(p,size,load,folder,offset=-.5):
    xs=split_axis(p['geometry']['x_breaks'],size)
    zs=split_axis(p['geometry']['z_breaks'],size)
    nodes={}; coords={}; elements=[]
    def node(x,z):
        key=round(x,9),round(z,9)
        if key not in nodes:
            ident=len(nodes)+1; nodes[key]=ident
            coords[ident]=[x,0,z]
        return nodes[key]
    for x0,x1 in zip(xs,xs[1:]):
        for z0,z1 in zip(zs,zs[1:]):
            pts=[(x0,z0),(x0,z1),(x1,z1),(x1,z0),
                 (x0,(z0+z1)/2),((x0+x1)/2,z1),(x1,(z0+z1)/2),((x0+x1)/2,z0)]
            elements.append([node(*q) for q in pts])
    supports=[dict(s,node=node(s['x'],s['z'])) for s in p['supports']]
    lines=['*HEADING','C-Tower composite panel; N,mm,s; audit source project.json','*NODE']
    lines += [f'{i},{x:.12g},{y:.12g},{z:.12g}' for i,(x,y,z) in coords.items()]
    lines+=['*ELEMENT,TYPE=S8R,ELSET=PANEL']
    lines += [','.join(map(str,[i]+e)) for i,e in enumerate(elements,1)]
    lines += ['*NSET,NSET=NALL,GENERATE',f'1,{len(coords)},1','*NSET,NSET=SUPPORTS',','.join(str(s['node']) for s in supports)]
    for name,m in p['materials'].items():
        lines += [f'*MATERIAL,NAME={name}']
        if 'engineering_constants' in m:
            v=ccx_constants(m);lines+=['*ELASTIC,TYPE=ENGINEERING CONSTANTS',','.join(f'{x:.10E}' for x in v[:8]),f'{v[8]:.10E}']
        else: lines+=['*ELASTIC',f"{m['E']},{m['nu']}"]
        rho=m['weight_density']/p['loads']['g'] if load=='DEAD' else m['mass_density']
        lines+=['*DENSITY',f'{rho:.15g}']
    lines += ['*ORIENTATION,NAME=SAPAXES','-1,0,0,0,0,1',f'*SHELL SECTION,ELSET=PANEL,COMPOSITE,ORIENTATION=SAPAXES,OFFSET={offset}']
    lines += [f"{l['thickness']},,{l['material']},SAPAXES" for l in p['layers']]
    lines += ['*BOUNDARY']
    for s in supports:
        lines += [f"{s['node']},{d},{d},0" for d in s['dofs']]
    lines += ['*STEP','*STATIC,SOLVER=SPOOLES','*DLOAD']
    if load=='DEAD': lines += [f"PANEL,GRAV,{p['loads']['g']},0,0,-1"]
    elif load=='EQ_Y':lines += [f"PANEL,GRAV,{p['loads']['y_acceleration']},0,-1,0"]
    elif load=='EQ_X':lines += [f"PANEL,GRAV,{p['loads']['x_acceleration']},-1,0,0"]
    else: raise ValueError(load)
    lines += ['*NODE PRINT,NSET=NALL','U','*NODE PRINT,NSET=SUPPORTS,TOTALS=YES','RF','*EL PRINT,ELSET=PANEL','S','*NODE FILE','U','*EL FILE','S','*END STEP']
    folder.mkdir(parents=True,exist_ok=True)
    (folder/'panel.inp').write_text('\n'.join(lines)+'\n',encoding='ascii')
    metadata={'size':size,'load':load,'xs':xs,'zs':zs,'nodes':coords,'elements':elements,'supports':supports,'offset':offset}
    (folder/'mesh.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    return metadata

def parse_dat(path):
    sections=[];cur=None
    for line in path.read_text(errors='replace').splitlines():
        low=line.strip().lower()
        if low.startswith('global coordinates'):low=low.removeprefix('global ')
        if low.startswith(('displacements (','forces (','stresses (','coordinates (')):
            cur={'header':line.strip(),'kind':low.split()[0],'rows':[]};sections.append(cur)
        elif low.startswith('total force'):
            cur=None
        elif cur and re.match(r'^\s*\d+\s+[-+\d.]',line):
            count={'stresses':8,'coordinates':5}.get(cur['kind'],4)
            cur['rows'].append([float(x.replace('D','E')) for x in line.split()[:count]])
    return sections

def run(folder):
    env=dict(os.environ,OMP_NUM_THREADS='2',NUMBER_OF_CPUS='2')
    start=time.perf_counter()
    result=subprocess.run([str(Path(os.environ['STONECALC_CCX'])),'-i','panel'],cwd=folder,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=env)
    log=result.stdout.decode(errors='replace');(folder/'solver.log').write_text(log,encoding='utf-8')
    if result.returncode or not (folder/'panel.dat').exists() or '*ERROR' in log.upper() or 'Job finished' not in log:
        raise RuntimeError(f'CalculiX failed in {folder}: {result.returncode}\n{log[-5000:]}')
    sections=parse_dat(folder/'panel.dat')
    data={'elapsed_seconds':time.perf_counter()-start,'returncode':result.returncode,'sections':sections}
    (folder/'results.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
    return data

def main():
    a=argparse.ArgumentParser();a.add_argument('--mesh',type=float,default=100);a.add_argument('--load',choices=['DEAD','EQ_Y','EQ_X'],default='EQ_Y');a.add_argument('--generate-only',action='store_true');a.add_argument('--offset',type=float,default=-.5)
    args=a.parse_args();p=json.loads((ROOT/'project.json').read_text(encoding='utf-8'))
    name=f"m{args.mesh:g}_{args.load}"+('' if args.offset==-.5 else f'_offset{args.offset:g}')
    folder=ROOT/'cases'/name
    meta=generate(p,args.mesh,args.load,folder,args.offset)
    print(f"Generated {len(meta['elements'])} S8R, {len(meta['nodes'])} nodes: {folder}",flush=True)
    if not args.generate_only:
        data=run(folder)
        for s in data['sections']:
            if s['kind']=='displacements':print('max abs Uy',max(abs(r[2]) for r in s['rows']))
            if s['kind']=='forces':print('sum RF',[sum(r[i] for r in s['rows']) for i in (1,2,3)])
        print('Elapsed',data['elapsed_seconds'])

if __name__=='__main__':main()
