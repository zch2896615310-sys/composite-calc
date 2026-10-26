"""Stonecalc local workbench. Standard library only; bind to loopback."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from concurrent.futures import ThreadPoolExecutor
import argparse
import hashlib
import json
import math
import os
import sys
import threading
import time
import uuid
import webbrowser
import subprocess

ROOT = Path(__file__).resolve().parent
CORE = ROOT / 'engines/calculix'
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(CORE))
from offline_run import validate as core_validate
from fem_adapter import generate, run
from analyze_results import solve_fields, combine, COMBOS
from report_docx import build as build_docx
from solid_results import CASES, VERSION as POSTPROCESS_VERSION, summarize as solid_summary
import layered_api



JOBS = {}
LOCK = threading.Lock()
POOL = ThreadPoolExecutor(max_workers=1)


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def validate(p, size):
    from support_geometry import support_y, thickness_planes
    def finite(value):
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError('参数不能包含 NaN 或 Infinity')
        if isinstance(value, dict):
            for v in value.values(): finite(v)
        if isinstance(value, list):
            for v in value: finite(v)
    finite(p)
    if p.get('units') != 'N, mm, s, MPa':
        raise ValueError('有限元单位必须为 N, mm, s, MPa')
    if p.get('local_axes') != {'1': [-1, 0, 0], '2': [0, 0, 1], '3': [0, 1, 0]}:
        raise ValueError('当前核心固定材料轴 1=-X、2=Z、3=Y')
    if not isinstance(size, (float, int)) or not math.isfinite(size) or size <= 0:
        raise ValueError('网格尺寸必须为正数')
    if not 1 <= len(p['layers']) <= 24:
        raise ValueError('支持 1–24 层材料')
    if len({s['sap_joint'] for s in p['supports']}) != len(p['supports']):
        raise ValueError('支点编号重复')
    if len({(s['x'], support_y(p, s), s['z']) for s in p['supports']}) != len(p['supports']):
        raise ValueError('支点位置重复，请合并约束')
    if len({l['name'] for l in p['layers']}) != len(p['layers']):
        raise ValueError('材料层名称不能重复')
    import re
    for name in list(p['materials']) + [l['name'] for l in p['layers']] + [s['sap_joint'] for s in p['supports']]:
        if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_-]{0,39}', str(name)):
            raise ValueError('材料、层和支点标识须为英文、数字、下划线或短横线')
    for s in p['supports']:
        if 'surface' in s:
            s['y'] = support_y(p, s)
        if not s['dofs'] or len(s['dofs']) != len(set(s['dofs'])):
            raise ValueError('支点约束不能为空或重复')
    names = [l['name'].replace('-', '_').upper() for l in p['layers']]
    if len(set(names)) != len(names):
        raise ValueError('层名称转换后冲突')
    core_validate(p)
    # The retained generator's original default assumes four layers. Always
    # pass explicit divisions in our adapter to support a variable layer count.
    xs = sorted(set(p['geometry']['x_breaks'] + [s['x'] for s in p['supports']]))
    zs = sorted(set(p['geometry']['z_breaks'] + [s['z'] for s in p['supports']]))
    nx = sum(math.ceil((b-a)/size) for a,b in zip(xs,xs[1:]))
    nz = sum(math.ceil((b-a)/size) for a,b in zip(zs,zs[1:]))
    if nx*nz*(len(thickness_planes(p))-1) > 30000:
        raise ValueError('单元数超过本地交互上限 30000，请增大网格尺寸')
    return True


def update_job(job_id, **values):
    with LOCK:
        JOBS[job_id].update(values)


def reactions(mesh, fields, p, factors):
    # RF includes externally applied nodal body loads. Restore reactions
    # using each C3D8I corner's consistent body load = volume*rho*a/8.
    external = {int(n): [0., 0., 0.] for n in mesh['nodes']}
    for eid, nodes in enumerate(mesh['elements'], 1):
        e = mesh['element_metadata'][str(eid)]
        mat = p['materials'][p['layers'][e['layer']]['material']]
        vol = math.prod(e[k+'1']-e[k+'0'] for k in 'xyz')
        f = [-mat['mass_density']*p['loads']['x_acceleration']*factors.get('EQ_X', 0),
             -mat['mass_density']*p['loads']['y_acceleration']*factors.get('EQ_Y', 0),
             -mat['weight_density']*factors.get('DEAD', 0)]
        for n in nodes:
            for j in range(3): external[n][j] += vol*f[j]/8
    out = {s['sap_joint']: [fields['rf'][s['node']][j]-external[s['node']][j] for j in range(3)] for s in mesh['supports']}
    expected = [-sum(v[j] for v in external.values()) for j in range(3)]
    total = [sum(v[j] for v in out.values()) for j in range(3)]
    residual = [total[j]-expected[j] for j in range(3)]
    tolerance = max(.001, max(map(abs, expected))*1e-5)
    if max(map(abs, residual)) > tolerance:
        raise ValueError(f'反力平衡未通过：{residual} N')
    return out, total, residual


def contour_fields(mesh, fields):
    """Preserve reference-surface UY and thickness-weight tensors in split layers."""
    cells = {}
    for eid, nodes in enumerate(mesh['elements'], 1):
        e = mesh['element_metadata'][str(eid)]
        key = (e['layer'], e['x0'], e['z0'], e['x1'], e['z1'])
        cell = cells.setdefault(key, {'tensor': [0.]*6, 'thickness': 0., 'uy': 0.})
        thickness = e['y1']-e['y0']
        cell['thickness'] += thickness
        for j in range(6):
            cell['tensor'][j] += sum(fields['s'][eid, gp][j] for gp in range(1, 9))/8*thickness
        if abs(e['y0']) < 1e-8:
            cell['uy'] = sum(fields['u'][nodes[k]][1] for k in (0, 1, 5, 4))/4
    return [list(k) for k in cells], {'stress_mean': [[v/t['thickness'] for v in t['tensor']] for t in cells.values()], 'front_uy': [t['uy'] for t in cells.values()]}


def compute_job(job_id, p, size):
    dest = ROOT / 'runs' / job_id
    dest.mkdir(parents=True)
    snapshot = {'project': p, 'mesh_mm': size, 'formulation': 'C3D8I-body-point-v1', 'postprocess': POSTPROCESS_VERSION}
    (dest/'input.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding='utf-8')
    try:
        fields = {}
        for i, case in enumerate(['DEAD', 'EQ_Y', 'EQ_X']):
            update_job(job_id, status='running', message=f'正在求解 {case}（{i+1}/3）')
            folder = dest/case
            mesh = generate(p, size, case, folder, divisions=[1]*len(p['layers']))
            run(folder)
            mesh, fields[case] = solve_fields(folder)
        summaries = []
        contours = {'mesh': [], 'cases': {}}
        for eid in range(1, len(mesh['elements'])+1):
            e = mesh['element_metadata'][str(eid)]
            contours['mesh'].append([e['layer'], e['x0'], e['z0'], e['x1'], e['z1']])
        for case, factors in CASES.items():
            f = combine(fields, factors)
            stress_mean, front_uy = [], []
            for eid, nodes in enumerate(mesh['elements'], 1):
                stress_mean.append([sum(f['s'][eid, gp][j] for gp in range(1, 9))/8 for j in range(6)])
                e = mesh['element_metadata'][str(eid)]
                front_uy.append(sum(f['u'][nodes[k]][1] for k in (0, 1, 5, 4))/4 if e['layer'] == 0 else 0)
            contours['cases'][case] = {'stress_mean': stress_mean, 'front_uy': front_uy}
            if mesh.get('layer_subdivision'):
                contours['mesh'], contours['cases'][case] = contour_fields(mesh, f)
                contours['aggregation'] = 'thickness_weighted_tensor_mean'
            rx, total, residual = reactions(mesh, f, p, factors)
            front = [int(n) for n, q in mesh['nodes'].items() if abs(q[1]) < 1e-8]
            stresses, displacement_peak, all_peak = solid_summary(mesh, f, p)
            summaries.append({'case': case, 'factors': factors, 'max_abs_uy_mm': displacement_peak['value'],
                              'max_abs_uy_all_mm': all_peak['value'], 'displacement_peak': displacement_peak, 'displacement_all_peak': all_peak,
                              'reactions_N': rx, 'resultant_N': total, 'balance_residual_N': residual, 'layers': stresses})
        # Surface nodal field; not a stress contour or a layered-shell average.
        uy = fields['EQ_Y']['u']
        surface = [[q[0], q[2], uy[int(n)][1]] for n, q in mesh['nodes'].items() if abs(q[1]) < 1e-8]
        result = {'job_id': job_id, 'input_hash': digest(snapshot), 'snapshot': snapshot,
                  'formulation': 'C3D8I · 逐层三维实体 · 体积自重 · XYZ实际位置点约束',
                  'postprocess': POSTPROCESS_VERSION, 'nodes': len(mesh['nodes']), 'elements': len(mesh['elements']), 'summary': summaries, 'contours': contours,
                  'surface_EQ_Y': surface,
                  'basis': '线弹性、小变形、层间完全粘结；应力为材料局部轴积分点分量。强度采用同一积分点张量求主应力、三维Mises和横向剪应力合值；云图平均值不用于验算。',
                  'created_at': time.strftime('%Y-%m-%d %H:%M:%S')}
        (dest/'summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
        update_job(job_id, status='done', message='计算完成，三个基本工况与正负组合、实体积分点峰值已保存', result=result)
    except Exception as e:
        (dest/'error.txt').write_text(str(e), encoding='utf-8')
        update_job(job_id, status='error', message=str(e))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT/'web'), **kwargs)

    def json(self, value, code=200):
        data = json.dumps(value, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/api/health':
            return self.json({'ok': True, 'engine': 'CalculiX 2.23', 'formulation': 'C3D8I / projected layered shell', 'version': 1, 'features': ['cad-dwg', POSTPROCESS_VERSION, layered_api.VERSION], 'sap_enabled': False})
        if path == '/api/default-fem':
            return self.json(read(CORE/'project.json'))
        if path == '/api/cad/status':
            return self.json(cad_status())
        if path.startswith('/api/jobs/'):
            job_id = path.rsplit('/', 1)[-1]
            with LOCK: job = dict(JOBS.get(job_id, {}))
            if not job:
                file = ROOT/'runs'/job_id/'summary.json'
                if len(job_id) == 32 and all(c in '0123456789abcdef' for c in job_id) and file.is_file():
                    job = {'status': 'done', 'message': '已从本地算例恢复', 'result': read(file)}
            return self.json(job or {'error': '找不到算例'}, 200 if job else 404)
        if path.startswith('/runs/') or path.startswith('/reports/') or path.startswith('/cad-files/'):
            # Read-only result downloads. Restrict to this workbench's runs.
            from urllib.parse import unquote
            target = (ROOT/unquote(path).lstrip('/')).resolve()
            allowed_root = (ROOT/path.strip('/').split('/')[0]).resolve()
            if not target.is_relative_to(allowed_root) or not target.is_file():
                return self.send_error(404)
            data = target.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        return super().do_GET()

    def do_POST(self):
        if self.path not in ('/api/fem','/api/shell','/api/report','/api/cad/convert'): return self.send_error(404)
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers.get('Host', ''):
            return self.json({'error': '仅允许本地工作台提交'}, 403)
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= (20_000_000 if self.path in ('/api/report','/api/cad/convert') else 2_000_000): raise ValueError('请求大小无效')
            value = json.loads(self.rfile.read(length))
            if self.path == '/api/cad/convert':
                return self.json(convert_cad(value))
            if self.path == '/api/report':
                ident=uuid.uuid4().hex;folder=ROOT/'reports'/ident;folder.mkdir(parents=True)
                target=folder/'结构计算书.docx'
                (folder/'payload.json').write_text(json.dumps(value,ensure_ascii=False),encoding='utf-8')
                evidence=build_docx(value,target,ROOT/'templates/ctower-reference.docx')
                (folder/'export-verification.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
                out={'docx_url':f'/reports/{ident}/结构计算书.docx'}
                if value.get('format')=='pdf':
                    soffice=Path(os.environ.get('PROGRAMFILES','C:/Program Files'))/'LibreOffice/program/soffice.exe'
                    if not soffice.is_file():raise ValueError('本机未找到 LibreOffice，DOCX 已保存；可用 Word 打开后另存 PDF')
                    subprocess.run([str(soffice),'-env:UserInstallation='+str((folder/'lo-profile').resolve().as_uri()),'--headless','--convert-to','pdf','--outdir',str(folder),str(target)],capture_output=True,timeout=90,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),check=True)
                    if not target.with_suffix('.pdf').is_file():raise ValueError('PDF 转换未生成文件；DOCX 已保存')
                    out['pdf_url']=f'/reports/{ident}/结构计算书.pdf'
                return self.json(out)
            if self.path == '/api/shell':
                return self.json({'error':'SAP调用已停用；请使用CalculiX实体验算。'},410)
            p, size = value['project'], value['mesh_mm']
            is_layered=value.get('formulation')==layered_api.FORMULATION
            if is_layered:
                if value.get('postprocess')!=layered_api.VERSION:raise ValueError('分层壳结果版本不匹配')
                layered_api.validate(p,size,validate)
            else:
                if value.get('formulation') not in (None,'C3D8I-body-point-v1'):raise ValueError('不支持的有限元模型')
                validate(p, size)
            with LOCK:
                if sum(j['status'] in ('queued', 'running') for j in JOBS.values()) >= 4:
                    return self.json({'error': '已有四个算例排队，请稍后再试'}, 429)
                job_id = uuid.uuid4().hex
                JOBS[job_id] = {'status': 'queued', 'message': '已加入本地计算队列'}
            if is_layered:POOL.submit(layered_api.compute,job_id,p,size,update_job)
            else:POOL.submit(compute_job, job_id, p, size)
            self.json({'job_id': job_id}, 202)
        except (ValueError, KeyError, TypeError, IndexError, subprocess.SubprocessError) as e:
            self.json({'error': str(e)}, 400)


def main():
    from report_service import ensure_running as ensure_report_service
    ensure_report_service()
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8878)
    parser.add_argument('--open', action='store_true')
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    url = f'http://127.0.0.1:{args.port}'
    print(f'Stonecalc workbench: {url}', flush=True)
    if args.open: webbrowser.open(url)
    server.serve_forever()


if __name__ == '__main__': main()
