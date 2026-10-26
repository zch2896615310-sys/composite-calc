from pathlib import Path
"""Variable-layer adapter derived from the verified C3D8I model generator.

Original engine files are retained unchanged. Only this adapter owns the
variable layer divisions and the interactive solver timeout.
"""
import json
import os
import subprocess
import time
import copy
from run_solid import generate_solid
from run_model import ROOT, parse_dat
from support_geometry import layer_bounds, support_y, thickness_planes


def generate(p, size, load, folder, divisions):
    ys = thickness_planes(p, divisions)
    original_bounds = layer_bounds(p)
    base_planes = {round(a+(b-a)*j/divisions[i], 9) for i, (a, b) in enumerate(original_bounds) for j in range(divisions[i]+1)}
    split = any(y not in base_planes for y in ys)
    generated_project, generated_divisions, owners = p, divisions, None
    if split:
        generated_project = copy.deepcopy(p)
        generated_project['layers'], owners = [], []
        for i, layer in enumerate(p['layers']):
            a, b = original_bounds[i]
            cuts = [y for y in ys if a <= y <= b]
            for j, (y0, y1) in enumerate(zip(cuts, cuts[1:])):
                generated_project['layers'].append(dict(layer, name=f'V2L{i}S{j}', thickness=y1-y0))
                owners.append(i)
        generated_divisions = [1]*len(owners)
    m = generate_solid(generated_project, size, load, folder, divisions=generated_divisions, rigid_supports=False, dead_mode='body')
    if owners is not None:
        for e in m['element_metadata'].values():
            e['layer'] = owners[e['layer']]
    used = {n for e in m['elements'] for n in e[:8]}
    m['elements'] = [e[:8] for e in m['elements']]
    m['nodes'] = {n: v for n, v in m['nodes'].items() if n in used}
    m['formulation'] = 'C3D8I'
    s = (folder/'panel.inp').read_text()
    start, end = s.index('*NODE\n'), s.index('*NSET,NSET=NALL')
    block = ['*NODE'] + [f'{n},'+','.join(f'{v:.10E}' for v in q) for n, q in m['nodes'].items()]
    block += ['*ELEMENT,TYPE=C3D8I,ELSET=PANEL'] + [','.join(map(str, [i]+e)) for i, e in enumerate(m['elements'], 1)]
    s = s[:start]+'\n'.join(block)+'\n'+s[end:]
    start, end = s.index('*NSET,NSET=NALL,GENERATE'), s.index('*NSET,NSET=SUPPORTS')
    ns = sorted(used)
    block = ['*NSET,NSET=NALL'] + [','.join(map(str, ns[k:k+16])) for k in range(0, len(ns), 16)]
    s = s[:start]+'\n'.join(block)+'\n'+s[end:]
    s = s.replace('*EL PRINT,ELSET=PANEL\nS', '*EL PRINT,ELSET=PANEL,GLOBAL=NO\nS,COORD')
    # Bind each support to a connected corner node on its actual physical plane.
    # The unchanged engine initially binds all restraints to its reference Y=0.
    if any(support_y(p, sp) != 0 for sp in p['supports']):
        lookup = {tuple(round(v, 9) for v in q): n for n, q in m['nodes'].items()}
        supports = []
        for sp in p['supports']:
            y = support_y(p, sp)
            key = tuple(round(v, 9) for v in (sp['x'], y, sp['z']))
            if key not in lookup:
                raise ValueError('挂点未落到有效实体网格节点')
            supports.append(dict(sp, y=y, node=lookup[key]))
        m['supports'] = supports
        start, end = s.index('*NSET,NSET=SUPPORTS\n'), s.index('*MATERIAL,', s.index('*NSET,NSET=SUPPORTS\n'))
        s = s[:start]+'*NSET,NSET=SUPPORTS\n'+','.join(str(sp['node']) for sp in supports)+'\n'+s[end:]
        start, end = s.index('*BOUNDARY\n'), s.index('*STEP\n')
        s = s[:start]+'*BOUNDARY\n'+'\n'.join(f"{sp['node']},{d},{d},0" for sp in supports for d in sp['dofs'])+'\n'+s[end:]
    if split:
        m['thickness_planes'] = ys
        m['layer_subdivision'] = True
    (folder/'panel.inp').write_text(s, encoding='ascii')
    (folder/'mesh.json').write_text(json.dumps(m, indent=2), encoding='utf-8')
    return m


def run(folder):
    start = time.perf_counter()
    env = dict(os.environ, OMP_NUM_THREADS='2', NUMBER_OF_CPUS='2')
    result = subprocess.run([str(Path(os.environ['STONECALC_CCX'])), '-i', 'panel'], cwd=folder,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env,
                            timeout=300, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    log = result.stdout.decode(errors='replace')
    (folder/'solver.log').write_text(log, encoding='utf-8')
    if result.returncode or not (folder/'panel.dat').exists() or '*ERROR' in log.upper() or 'Job finished' not in log:
        raise RuntimeError(f'CalculiX求解失败：{log[-2500:]}')
    data = {'elapsed_seconds': time.perf_counter()-start, 'returncode': result.returncode, 'sections': parse_dat(folder/'panel.dat')}
    (folder/'results.json').write_text(json.dumps(data, indent=2), encoding='utf-8')
    return data
