"""One-click offline rerun. Never connects to SAP2000 or the internet."""
import json, time, math, html, os, argparse
from pathlib import Path
from run_model import ROOT, run
from run_solid import generate_solid
from material_adapter import ccx_constants
from analyze_results import read, solve_fields, reaction, combine, COMBOS, main as analyze_main

def validate(p):
    g=p['geometry'];xs=g['x_breaks'];zs=g['z_breaks']
    if sorted(set(xs))!=xs or sorted(set(zs))!=zs:raise ValueError('Geometry breakpoints must be strictly increasing')
    if len(xs)<2 or len(zs)<2:raise ValueError('At least two geometry breakpoints are required')
    if len(p['supports'])<3:raise ValueError('This point-supported panel runner requires at least 3 supports')
    if g.get('reference_y',0)!=0:raise ValueError('Current runner uses reference_y=0')
    if p['loads']['g']<=0:raise ValueError('Gravity reference g must be positive')
    for s in p['supports']:
        if not(xs[0]<=s['x']<=xs[-1] and zs[0]<=s['z']<=zs[-1]):raise ValueError('Support outside panel')
        if not all(i in (1,2,3) for i in s['dofs']):raise ValueError('Only translation support DOFs are allowed')
    for l in p['layers']:
        if l['thickness']<=0:raise ValueError('Layer thickness must be positive')
        m=p['materials'][l['material']]
        if min(m['mass_density'],m['weight_density'])<0:raise ValueError('Material density must be nonnegative')
        if 'engineering_constants' in m:
            e1,e2,e3,n12,n13,n23,g12,g13,g23=ccx_constants(m)
            if min(e1,e2,e3,g12,g13,g23)<=0:raise ValueError('Elastic moduli must be positive')
            a,b,c=1/e1,1/e2,1/e3;d,e,f=-n12/e1,-n13/e1,-n23/e2
            if a*b-d*d<=0 or a*b*c+2*d*e*f-a*f*f-b*e*e-c*d*d<=0:raise ValueError('Orthotropic compliance matrix is not positive definite')
        elif m['E']<=0 or not -1<m['nu']<.5:raise ValueError('Invalid isotropic elastic constants')
    return True

def new_parameters(p):
    out=ROOT/'runs'/time.strftime('%Y%m%d_%H%M%S');out.mkdir(parents=True,exist_ok=False)
    (out/'project.json').write_text(json.dumps(p,ensure_ascii=False,indent=2),encoding='utf-8')
    summaries=[];allfields={};mesh_size=p.get('mesh_mm',75)
    if mesh_size<=0:raise ValueError('mesh_mm must be positive')
    for load in ('DEAD','EQ_Y','EQ_X'):
        f=out/load;m=generate_solid(p,mesh_size,load,f);run(f);_,fields=solve_fields(f);allfields[load]=fields
        rx=reaction(m,fields,p,{load:1});resultant=[sum(v[j] for v in rx.values()) for j in range(3)]
        area=(m['xs'][-1]-m['xs'][0])*(m['zs'][-1]-m['zs'][0]);mass=area*sum(p['materials'][l['material']]['mass_density']*l['thickness'] for l in p['layers']);weight=area*sum(p['materials'][l['material']]['weight_density']*l['thickness'] for l in p['layers'])
        expected={'DEAD':[0,0,weight],'EQ_Y':[0,mass*p['loads']['y_acceleration'],0],'EQ_X':[mass*p['loads']['x_acceleration'],0,0]}[load]
        residual=[a-b for a,b in zip(resultant,expected)]
        if max(map(abs,residual))>max(.001,max(map(abs,expected))*1e-5):raise RuntimeError(f'Force balance failed: {load} {residual}')
        realnodes={i for e in m['elements'] for i in e if abs(m['nodes'][i][1])<1e-8}
        summaries.append({'case':load,'max_abs_uy_front_mm':max(abs(fields['u'][i][1]) for i in realnodes),'resultant_N':resultant,'force_balance_residual_N':residual,'reactions_N':rx,'element_count':len(m['elements']),'node_count':len(m['nodes'])})
    for name in ('qe','SLS','ULS'):
        fields=combine(allfields,COMBOS[name]);rx=reaction(m,fields,p,COMBOS[name])
        summaries.append({'case':name,'factors':COMBOS[name],'max_abs_uy_front_mm':max(abs(fields['u'][i][1]) for i in realnodes),'resultant_N':[sum(v[j] for v in rx.values()) for j in range(3)],'reactions_N':rx,'element_count':len(m['elements']),'node_count':len(m['nodes'])})
    (out/'summary.json').write_text(json.dumps(summaries,ensure_ascii=False,indent=2),encoding='utf-8')
    rows=''.join(f"<tr><td>{x['case']}</td><td>{x['max_abs_uy_front_mm']:.7g}</td><td>{html.escape(str(x['resultant_N']))}</td></tr>" for x in summaries)
    page=f'<!doctype html><meta charset="utf-8"><title>当前参数重算结果</title><style>body{{max-width:950px;margin:50px auto;font:16px/1.9 Microsoft YaHei}}table{{border-collapse:collapse;width:100%}}td,th{{border:1px solid #ddd;padding:10px}}</style><h1>当前参数：CalculiX重算完成</h1><p>参数已与冻结SAP基准不同，本页不作相同输入的SAP对比。既有验证报告只代表原基准参数。</p><table><tr><th>工况</th><th>参考面最大|UY| mm</th><th>合计反力 N [X,Y,Z]</th></tr>{rows}</table><p>输入、模型、原始结果及摘要保存在 <a href="{out.relative_to(ROOT).as_posix()}/summary.json">{out.name}/summary.json</a>；现阶段仍未做材料强度通过/不通过判定。</p>'
    (ROOT/'当前参数重算结果.html').write_text(page,encoding='utf-8')
    return ROOT/'当前参数重算结果.html'

def main():
    a=argparse.ArgumentParser();a.add_argument('--open',action='store_true');args=a.parse_args()
    p=read(ROOT/'project.json');validate(p);baseline=read(ROOT/'references/baseline_project.json')
    if p!=baseline:
        print('Input differs from SAP baseline. Running a new CalculiX-only study.',flush=True);target=new_parameters(p)
    else:
        specs=[(size,load,1) for size in (100,75) for load in ('DEAD','EQ_Y','EQ_X')]+[(50,'DEAD',1),(50,'EQ_Y',1),(75,'DEAD',2),(75,'EQ_Y',2)]
        for size,load,nd in specs:
            folder=ROOT/'cases'/f'solid_m{size}_{load}_c{nd}'
            print(f'Running {size}mm {load}, core divisions={nd}',flush=True)
            generate_solid(p,size,load,folder,[1,1,nd,1]);run(folder)
        # Regenerate one explicit shell diagnostic, separate from primary model.
        from run_model import generate
        folder=ROOT/'cases/m75_EQ_Y';generate(p,75,'EQ_Y',folder);run(folder)
        analyze_main()
        from verify_engine import main as verify_main
        verify_main()
        from build_report import report
        report();target=ROOT/'CalculiX与SAP2000离线验证报告.html'
    print(f'Completed. Report: {target}',flush=True)
    if args.open:os.startfile(target)

if __name__=='__main__':main()
