"""Comparable quantities, with explicit coordinates, load recovery and sampling."""
from pathlib import Path
import json, math
from run_model import ROOT

def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
COMBOS={'DEAD':{'DEAD':1},'EQ_Y':{'EQ_Y':1},'qe':{'EQ_Y':1,'EQ_X':1},'SLS':{'DEAD':1,'EQ_Y':1,'EQ_X':1},'ULS':{'DEAD':1.3,'EQ_Y':1.4,'EQ_X':1.4}}
SAP_CASE={'SLS':'正常使用极限状态','ULS':'承载力极限状态'}

def solve_fields(folder):
    mesh=read(folder/'mesh.json');data=read(folder/'results.json')
    fields={}
    for section in data['sections']:
        if section['kind']=='displacements': fields['u']={int(r[0]):r[1:] for r in section['rows']}
        elif section['kind']=='forces':fields['rf']={int(r[0]):r[1:] for r in section['rows']}
        elif section['kind']=='stresses':fields['s']={(int(r[0]),int(r[1])):r[2:] for r in section['rows']}
    return mesh,fields

def combine(allfields,factors):
    first=allfields[next(iter(factors))]
    return {kind:{k:[sum(allfields[case][kind][k][j]*factor for case,factor in factors.items()) for j in range(len(v))] for k,v in first[kind].items()} for kind in first}

def reaction(mesh,fields,project,factors):
    # RF = applied external nodal loads + reaction. Each support is an S8
    # surface corner / a rigid line of C3D20 nodes. The consistent integrated
    # load weight at that line is -A/12, not +A/4 as in a 4-node shell.
    total_area={s['sap_joint']:0. for s in mesh['supports']}
    for s in mesh['supports']:
        for a,b in zip(mesh['xs'],mesh['xs'][1:]):
            for c,d in zip(mesh['zs'],mesh['zs'][1:]):
                if any(abs(s['x']-v)<1e-6 for v in (a,b)) and any(abs(s['z']-v)<1e-6 for v in (c,d)):
                    total_area[s['sap_joint']]+=(b-a)*(d-c)
    qd=sum(project['materials'][l['material']]['weight_density']*l['thickness'] for l in project['layers'])
    mass=sum(project['materials'][l['material']]['mass_density']*l['thickness'] for l in project['layers'])
    q=[-factors.get('EQ_X',0)*mass*project['loads']['x_acceleration'], -factors.get('EQ_Y',0)*mass*project['loads']['y_acceleration'], -factors.get('DEAD',0)*qd]
    output={}
    for s in mesh['supports']:
        applied=[v*(-total_area[s['sap_joint']]/12) for v in q]
        output[s['sap_joint']]=[fields['rf'][s['node']][i]-applied[i] for i in range(3)]
    return output

def sap_fields(ref):
    r=read(ref/'api_results.json')['results'];coords=read(ref/'node_coordinates.json')
    output={}
    for case in COMBOS:
        cname=SAP_CASE.get(case,case);u=r['displacement'];f=r['jointReaction']
        output[case]={'u':{str(n):[u['U1'][i],u['U2'][i],u['U3'][i]] for i,n in enumerate(u['Elm']) if u['LoadCase'][i]==cname},'reactions':{str(n):[f['F1'][i],f['F2'][i],f['F3'][i]] for i,n in enumerate(f['Elm']) if f['LoadCase'][i]==cname}}
    return r,coords,output

def stress_components(s):
    a,b,_,t,_,_=s
    return {'s11':a,'s22':b,'s12':t,'principal_max':(a+b)/2+math.sqrt(((a-b)/2)**2+t*t),'mises_plane':math.sqrt(a*a+b*b-a*b+3*t*t),'t13':s[4],'t23':s[5]}

# CalculiX 2.23 src/gauss.f; indices 3/4 and 7/8 differ from node ordering.
GAUSS=[(-1,-1,-1),(1,-1,-1),(-1,1,-1),(1,1,-1),(-1,-1,1),(1,-1,1),(-1,1,1),(1,1,1)]

def stress_compare(mesh,fields,sapraw,coords,case,project,exclude=100):
    # SAP supplies four extrapolated corner values at each layer-depth Gauss
    # point; interpolate those to CCX's in-plane Gauss coordinates. Do not
    # compare these with SAP's raw corner peak or with through-thickness
    # average transverse shear, which is a different reported quantity.
    r=sapraw['layerStress'];cname=SAP_CASE.get(case,case)
    groups={}
    for i,c in enumerate(r['LoadCase']):
        if c==cname:
            key=(r['Elm'][i],r['Layer'][i],int(r['IntPtNum'][i]))
            x,y,z=coords[r['PointElm'][i]]
            groups.setdefault(key,[]).append((x,z,[r['S11'][i],r['S22'][i],r['S12'][i]]))
    bycell={}
    def keycell(a,b,c,d,layer,ip):return tuple(round(v,5) for v in (a,b,c,d))+(layer,ip)
    for (_,layer,ip),v in groups.items():
        xx=[q[0] for q in v];zz=[q[1] for q in v]
        bycell[keycell(min(xx),max(xx),min(zz),max(zz),layer,ip)]=v
    sampled={l['name']:{k:[] for k in ['s11','s22','s12','principal_max','mises_plane']} for l in project['layers']}
    for (eid,gp),s in fields['s'].items():
        e=mesh['element_metadata'][str(eid)];sx,sy,sz=GAUSS[gp-1];root=math.sqrt(3)
        x=(e['x0']+e['x1'])/2+sx*(e['x1']-e['x0'])/(2*root)
        z=(e['z0']+e['z1'])/2+sz*(e['z1']-e['z0'])/(2*root)
        if min(math.hypot(x-sp['x'],z-sp['z']) for sp in project['supports'])<exclude:continue
        layer=project['layers'][e['layer']]['name'];ip=1 if sy<0 else 2
        corners=bycell[keycell(e['x0'],e['x1'],e['z0'],e['z1'],layer,ip)]
        a=(x-e['x0'])/(e['x1']-e['x0']);b=(z-e['z0'])/(e['z1']-e['z0'])
        v=[0.,0.,0.]
        for cx,cz,cs in corners:
            w=(a if cx>e['x0']+1e-6 else 1-a)*(b if cz>e['z0']+1e-6 else 1-b)
            for j in range(3):v[j]+=w*cs[j]
        cc=stress_components(s);ss=stress_components([v[0],v[1],0,v[2],0,0])
        for k in sampled[layer]:sampled[layer][k].append([ss[k],cc[k]])
    def stats(v):
        a=[q[0] for q in v];b=[q[1] for q in v]
        den=sum(t*t for t in a)
        return {'count':len(v),'sap_abs_max':max(map(abs,a)),'ccx_abs_max':max(map(abs,b)),'relative_l2':math.sqrt(sum((x-y)**2 for x,y in v)/den) if den>1e-30 else None}
    return {l:{k:stats(v) for k,v in group.items()} for l,group in sampled.items()}

def analyze(size=75):
    p=read(ROOT/'project.json');allfields={};mesh=None
    for case in ('DEAD','EQ_Y','EQ_X'):
        mesh,allfields[case]=solve_fields(ROOT/'cases'/f'solid_m{size}_{case}_c1')
    raw,coords,sap=sap_fields(ROOT/'references'/f'sap_m{size}')
    ccxnodes={tuple(round(v,6) for v in q):int(i) for i,q in mesh['nodes'].items() if abs(q[1])<1e-8}
    # Remove rotation/reference dummy nodes from this lookup.
    for s in mesh['supports']:ccxnodes[(s['x'],0,s['z'])]=s['physical_node']
    cases={}
    points=[dict(name=n,xyz=coords[n],ccx=ccxnodes[tuple(round(v,6) for v in coords[n])]) for n in sap['DEAD']['u']]
    area=(p['geometry']['x_breaks'][-1]-p['geometry']['x_breaks'][0])*(p['geometry']['z_breaks'][-1]-p['geometry']['z_breaks'][0])
    mass=area*sum(p['materials'][l['material']]['mass_density']*l['thickness'] for l in p['layers'])
    weight=area*sum(p['materials'][l['material']]['weight_density']*l['thickness'] for l in p['layers'])
    for name,factors in COMBOS.items():
        f=combine(allfields,factors);rx=reaction(mesh,f,p,factors)
        aa=[sap[name]['u'][q['name']][1] for q in points];bb=[f['u'][q['ccx']][1] for q in points]
        sma=max(map(abs,aa));cma=max(map(abs,bb))
        reaction_errors={s['sap_joint']:[rx[s['sap_joint']][j]-sap[name]['reactions'][s['sap_joint']][j] for j in range(3)] for s in mesh['supports']}
        resultant=[sum(v[j] for v in rx.values()) for j in range(3)]
        expected=[mass*p['loads']['x_acceleration']*factors.get('EQ_X',0),mass*p['loads']['y_acceleration']*factors.get('EQ_Y',0),weight*factors.get('DEAD',0)]
        balance=[a-b for a,b in zip(resultant,expected)]
        cases[name]={'factors':factors,'max_abs_uy_sap':sma,'max_abs_uy_ccx_common_nodes':cma,'peak_relative_difference':(cma/sma-1) if sma else None,'field_relative_l2':math.sqrt(sum((a-b)**2 for a,b in zip(aa,bb))/sum(a*a for a in aa)), 'reactions_ccx':rx,'reactions_sap':{s['sap_joint']:sap[name]['reactions'][s['sap_joint']] for s in mesh['supports']},'resultant':resultant,'expected_resultant':expected,'force_balance_residual_N':balance,'max_abs_support_reaction_error_N':max(abs(v) for vec in reaction_errors.values() for v in vec),'points':[[q['xyz'][0],q['xyz'][2],a,b] for q,a,b in zip(points,aa,bb)],'stress_common_gauss_excluding_100mm':stress_compare(mesh,f,raw,coords,name,p)}
    return {'mesh_size':size,'sap_nodes':len(points),'sap_elements':(len(mesh['xs'])-1)*(len(mesh['zs'])-1),'ccx_nodes':len(mesh['nodes']),'ccx_elements':len(mesh['elements']),'project_weight_N':weight,'project_inertia_y_N':mass*p['loads']['y_acceleration'],'cases':cases,'grid_x':mesh['xs'],'grid_z':mesh['zs']}

def main():
    output={str(n):analyze(n) for n in (100,75)}
    (ROOT/'comparison.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
    for size,d in output.items():
        for case,v in d['cases'].items():print(size,case,'UySAP/CCX',v['max_abs_uy_sap'],v['max_abs_uy_ccx_common_nodes'],'diff',v['peak_relative_difference'],'balance',v['force_balance_residual_N'])
    print('Saved comparison.json')

if __name__=='__main__':main()
