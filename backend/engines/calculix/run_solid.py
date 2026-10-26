"""Layer-conforming quadratic 3D solid cross-check, N-mm-s."""
from pathlib import Path
import json, argparse, math
from run_model import ROOT, split_axis, run
from material_adapter import ccx_constants

def generate_solid(p,size,load,folder,divisions=None,dead_mode='reference_surface',rigid_supports=True):
    xs=split_axis(sorted(set(p['geometry']['x_breaks']+[s['x'] for s in p['supports']])),size)
    zs=split_axis(sorted(set(p['geometry']['z_breaks']+[s['z'] for s in p['supports']])),size)
    coords={};nodes={};elements=[];groups={};elem_meta={}
    def node(x,y,z):
        key=tuple(round(v,9) for v in (x,y,z))
        if key not in nodes:
            ident=len(nodes)+1;nodes[key]=ident;coords[ident]=[x,y,z]
        return nodes[key]
    y=0
    for il,l in enumerate(p['layers']):
        name=l['name'].replace('-','_').upper();groups[name]=[]
        nd=(divisions or [1,1,1,1])[il]
        for iz in range(nd):
            a=y+l['thickness']*iz/nd;b=y+l['thickness']*(iz+1)/nd
            for x0,x1 in zip(xs,xs[1:]):
                for z0,z1 in zip(zs,zs[1:]):
                    # x cross y = z. C3D20R standard right-handed cube.
                    q=[(x0,a,z0),(x1,a,z0),(x1,b,z0),(x0,b,z0),(x0,a,z1),(x1,a,z1),(x1,b,z1),(x0,b,z1)]
                    edges=[(0,1),(1,2),(2,3),(3,0),(4,5),(5,6),(6,7),(7,4),(0,4),(1,5),(2,6),(3,7)]
                    pts=q+[tuple((q[i][k]+q[j][k])/2 for k in range(3)) for i,j in edges]
                    e=[node(*pt) for pt in pts];ident=len(elements)+1
                    elements.append(e);groups[name].append(ident)
                    elem_meta[ident]={'layer':il,'x0':x0,'x1':x1,'y0':a,'y1':b,'z0':z0,'z1':z1}
        y+=l['thickness']
    supports=[dict(s,node=node(s['x'],0,s['z'])) for s in p['supports']]
    if rigid_supports:
        for s in supports:
            line=[i for i,(x,y,z) in coords.items() if abs(x-s['x'])<1e-7 and abs(z-s['z'])<1e-7]
            rp=max(coords)+1;rot=rp+1
            coords[rp]=[s['x'],0,s['z']];coords[rot]=[s['x'],0,s['z']]
            s.update(physical_node=s['node'],node=rp,rotation_node=rot,through_nodes=line)
    lines=['*HEADING','C-Tower explicit layers; N,mm,s; C3D20R','*NODE']
    lines += [f'{i},{x:.12g},{y:.12g},{z:.12g}' for i,(x,y,z) in coords.items()]
    lines += ['*ELEMENT,TYPE=C3D20R,ELSET=PANEL']
    lines += [','.join(map(str,[i]+e[:15]))+',\n'+','.join(map(str,e[15:])) for i,e in enumerate(elements,1)]
    lines += ['*NSET,NSET=NALL,GENERATE',f'1,{len(coords)},1','*NSET,NSET=SUPPORTS',','.join(str(s['node']) for s in supports)]
    for name,m in p['materials'].items():
        lines += [f'*MATERIAL,NAME={name}']
        if 'engineering_constants' in m:
            v=ccx_constants(m);lines+=['*ELASTIC,TYPE=ENGINEERING CONSTANTS',','.join(f'{x:.10E}' for x in v[:8]),f'{v[8]:.10E}']
        else:lines+=['*ELASTIC',f"{m['E']},{m['nu']}"]
        rho=m['weight_density']/p['loads']['g'] if load=='DEAD' else m['mass_density']
        lines+=['*DENSITY',f'{rho:.10E}']
    lines+=['*ORIENTATION,NAME=SAPAXES','-1,0,0,0,0,1']
    for l in p['layers']:
        name=l['name'].replace('-','_').upper();lines+=[f'*ELSET,ELSET={name}']
        ids=groups[name]
        lines += [','.join(map(str,ids[k:k+16])) for k in range(0,len(ids),16)]
        lines += [f"*SOLID SECTION,ELSET={name},MATERIAL={l['material']},ORIENTATION=SAPAXES"]
    if rigid_supports:
        for s in supports:
            lines += [f"*NSET,NSET=H{s['sap_joint']}",','.join(map(str,s['through_nodes'])),f"*RIGID BODY,NSET=H{s['sap_joint']},REF NODE={s['node']},ROT NODE={s['rotation_node']}"]
    lines+=['*BOUNDARY']
    for s in supports:lines += [f"{s['node']},{d},{d},0" for d in s['dofs']]
    if rigid_supports:lines += [f"{s['rotation_node']},2,2,0" for s in supports]
    accel={'DEAD':(p['loads']['g'],0,0,-1),'EQ_Y':(p['loads']['y_acceleration'],0,-1,0),'EQ_X':(p['loads']['x_acceleration'],-1,0,0)}[load]
    lines+=['*STEP','*STATIC,SOLVER=SPOOLES']
    applied={}
    if load=='DEAD' and dead_mode=='reference_surface':
        q=sum(p['materials'][l['material']]['weight_density']*l['thickness'] for l in p['layers'])
        # Consistent S8 surface load at SAP reference y=0, not at the volume centre.
        for x0,x1 in zip(xs,xs[1:]):
            for z0,z1 in zip(zs,zs[1:]):
                area=(x1-x0)*(z1-z0)
                pts=[(x0,0,z0),(x1,0,z0),(x1,0,z1),(x0,0,z1),((x0+x1)/2,0,z0),(x1,0,(z0+z1)/2),((x0+x1)/2,0,z1),(x0,0,(z0+z1)/2)]
                for k,pt in enumerate(pts):
                    ident=node(*pt);w=-1/12 if k<4 else 1/3
                    applied[ident]=applied.get(ident,0)-q*area*w
        lines+=['*CLOAD']+[f'{i},3,{v:.10E}' for i,v in applied.items()]
    else:
        lines+=['*DLOAD','PANEL,GRAV,'+','.join(map(str,accel))]
    lines+=['*NODE PRINT,NSET=NALL','U','*NODE PRINT,NSET=SUPPORTS,TOTALS=YES','RF','*EL PRINT,ELSET=PANEL','S','*NODE FILE','U','*EL FILE','S','*END STEP']
    folder.mkdir(parents=True,exist_ok=True)
    (folder/'panel.inp').write_text('\n'.join(lines)+'\n',encoding='ascii')
    meta={'size':size,'load':load,'formulation':'C3D20R','dead_mode':dead_mode,'rigid_supports':rigid_supports,'applied_nodal_forces':applied,'divisions':divisions or [1]*4,'xs':xs,'zs':zs,'nodes':coords,'elements':elements,'supports':supports,'element_metadata':elem_meta}
    (folder/'mesh.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
    return meta

def main():
    a=argparse.ArgumentParser();a.add_argument('--mesh',type=float,default=100);a.add_argument('--load',choices=['DEAD','EQ_Y','EQ_X'],default='EQ_Y');a.add_argument('--core-divisions',type=int,default=1)
    args=a.parse_args();p=json.loads((ROOT/'project.json').read_text(encoding='utf-8'))
    folder=ROOT/'cases'/f'solid_m{args.mesh:g}_{args.load}_c{args.core_divisions}'
    m=generate_solid(p,args.mesh,args.load,folder,[1,1,args.core_divisions,1])
    print(f"Generated {len(m['elements'])} C3D20R, {len(m['nodes'])} nodes",flush=True)
    r=run(folder)
    for s in r['sections']:
        if s['kind']=='displacements':print('max abs Uy',max(abs(row[2]) for row in s['rows']))
        if s['kind']=='forces':print('sum RF',[sum(row[i] for row in s['rows']) for i in (1,2,3)])
    print('Elapsed',r['elapsed_seconds'])

if __name__=='__main__':main()
