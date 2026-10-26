"""Build the public browser client from an existing workbench checkout.

Only executable client dependencies are copied. Engineering fixtures, reports,
solver runs and private project templates are deliberately outside this build.
Usage: python tools/build-public-workbench.py <workbench-directory>
"""
from pathlib import Path
import argparse
import json
import re

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'structural-v1'


def replace(text, old, new):
    if text.count(old) != 1:
        raise ValueError(f'Expected one source anchor: {old[:90]!r}')
    return text.replace(old, new, 1)


def block(text, start, end, new=''):
    a = text.index(start)
    b = text.index(end, a)
    return text[:a] + new + text[b:]


def public_app(text):
    text = text.replace("import {calculixProject,solidFromShell} from './calculix-project.mjs?calculix-checks=19';\n", '')
    text = "import {services,serviceURL,reportDownloadURL} from './public-runtime.mjs';\n" + text
    text = replace(text, "KEY='stonecalc.workbench.v1'", "KEY='stonecalc.public.v1'")
    text = replace(text, "${main}${analysis}<details", "${main}${analysis}<p class=\"hint\">${services.solverBase?'有限元由已配置的在线服务运行。':'有限元服务待接入；当前可使用截面、连续梁、荷载与构件验算。'}</p><details")
    text = replace(text, '<button data-action="fem-choose">选择材料</button>', '<button data-action="fem-choose" ${defaultFem?\'\':\'disabled title="有限元在线服务待接入"\'}>选择材料</button>')
    text = replace(text, '已有完整示例可从左侧“项目模板与验证”打开。', '可从左侧“计算示例”载入截面与连续梁联动示例。')
    text = replace(text, '从一个截面开始，或直接建立连续梁、复合板有限元分析。', '从一个截面开始，或直接建立连续梁。有限元分析需连接在线服务。')
    text = block(text, "    if(action==='migrate-solid'){", "    if(action==='fem-tab'){", "    if(action==='migrate-solid')throw Error('请新建有限元分析；旧壳记录仅供查看。');\n")
    text = block(text, "    if(action==='demo'){", "    if(action==='report'){", """    if(action==='public-demo'){
      $('#templates').close();
      const p=newProject('示例 · 截面与连续梁联动');
      const s=addModule(p,'section',extra());s.name='矩形钢管 · 100×60×4';
      const b=addModule(p,'beam',extra());b.name='两跨连续梁 · 引用截面';b.input.sectionId=s.id;
      const c=addModule(p,'check',extra());c.name='构件正应力与剪应力';c.input.sectionId=s.id;c.input.beamId=b.id;c.input.S=19984;c.input.t=4;
      store.projects.push(p);activeId=p.id;selectedId=s.id;undoModule=null;mutate();toast('已新建独立示例，请按实际工程确认荷载与模型。');return;
    }
""")
    text = block(text, "      if(action==='module:cad-example'){", "      registry.get(selected().type).action")
    text = replace(text, "fetch('http://127.0.0.1:8879/api/report'", "fetch(serviceURL('report','/api/report')")
    text = replace(text, "a.href=payload.format==='pdf'?value.pdf_url:value.docx_url", "a.href=reportDownloadURL(payload.format==='pdf'?value.pdf_url:value.docx_url)")
    text = replace(text, "      button.disabled=true;toast('正在生成含公式与结果图的计算书…');", "      if(!services.reportBase)throw Error('Word/PDF 在线导出服务待接入；可先下载 HTML 计算书。');\n      button.disabled=true;toast('正在生成含公式与结果图的计算书…');")
    text = replace(text, "fetch(definition.endpoint||'/api/fem'", "fetch(serviceURL('solver',definition.endpoint||'/api/fem')")
    text = replace(text, 'fetch(`/api/jobs/${run.jobId}`)', "fetch(serviceURL('solver',`/api/jobs/${run.jobId}`))")
    text = replace(text, "function restoreRuns(){for(", "function restoreRuns(){if(!services.solverBase)return;for(")
    text = replace(text, "fetch('/api/default-fem')", "fetch(serviceURL('solver','/api/default-fem'))")
    text = text.replace('本地有限元服务尚未连接，请运行“启动工作台.cmd”。', '有限元在线服务待接入。')
    text = text.replace('本地服务已连接 · V2 CalculiX · 不调用SAP', '在线有限元服务已连接 · CalculiX')
    text = text.replace('已加入本地计算队列', '已加入计算队列')
    text = replace(text, "}catch{$('#service-status').textContent='服务未连接 · 请使用启动器打开';}", """}catch{$('#service-status').textContent=services.solverBase?'有限元服务连接失败 · 浏览器计算可用':'浏览器计算可用 · 有限元服务待接入';}
for(const action of ['export-docx','export-pdf'])if(!services.reportBase){const b=document.querySelector(`[data-action="${action}"]`);b.disabled=true;b.title='Word/PDF 在线导出服务待接入，可先下载 HTML';}
if(!services.reportBase){const note=document.createElement('p');note.className='hint public-export-note';note.textContent='Word/PDF 在线导出服务待接入。当前可预览或下载 HTML 计算书，不满足项以红色标注。';$('#report-body').before(note);}
""")
    return text


def public_index(text):
    text = replace(text, '<title>Stonecalc · 结构计算工作台</title>', '<title>结构计算模块板V1 · 结构计算工具箱</title>')
    text = text.replace('<small>结构计算工作台</small>', '<small>结构计算模块板V1</small>')
    text = replace(text, '<a class="brand" href="/">', '<a class="brand" href="../" title="返回结构计算工具箱">')
    text = text.replace('项目模板与验证', '计算示例')
    text = block(text, '<div class="template-list">', '</div></dialog>\n  <dialog id="report">', '<div class="template-list"><div><h3>截面与连续梁联动</h3><p>100×60×4 矩形钢管、两跨连续梁与构件验算。参数仅作操作演示，可按实际情况修改。</p><button data-action="public-demo">载入联动示例</button></div>')
    text = text.replace('连接本地计算服务…', '浏览器计算就绪…').replace('例如：C塔主龙骨32×32', '例如：主龙骨矩形钢管')
    return text


def transform(name, text):
    if name == 'app.mjs':
        return public_app(text)
    if name == 'index.html':
        return public_index(text)
    if name == 'model.mjs':
        text = text.replace("import originalComparison from './modules/original-comparison.mjs?v=2';\n", '')
        return replace(text, ',originalComparison,...worksheetModules', ',...worksheetModules')
    if name == 'modules/section.mjs':
        text = replace(text, '<button data-action="module:cad-example">C塔截面样本</button>', '')
        return text.replace('DWG在本机转换为DXF；', 'DXF / 轮廓 JSON 可直接读取；DWG 需要在线转换服务。')
    if name == 'cad-import.mjs':
        text = "import {serviceURL} from './public-runtime.mjs';\n" + text
        text = block(text, "    let base='';", "    const response=await fetch(base+'/api/cad/convert'", "    const base=serviceURL('cad','');\n")
        return text.replace('本机', '在线').replace('本地服务尚未加载DWG转换功能，请重启工作台服务', 'DWG转换服务响应格式无效')
    if name == 'fem-workspace.mjs':
        text = block(text, '</div><button class="primary" data-action="calculix-project"', '`;}\n', '</div>')
        return text.replace('复现第二份计算书可选择已验证的分层壳；', '复合板可选择分层壳；').replace('分层壳 · 复现第二份计算书', '新建分层壳分析')
    if name in ('modules/fem.mjs', 'layered-results.mjs'):
        text = "import {serviceURL} from '" + ('../' if name.startswith('modules/') else './') + "public-runtime.mjs';\n" + text
        text = re.sub(r'href="/runs/(.*?)"', r'href="${esc(serviceURL(\'solver\',`/runs/\1`))}"', text)
        # Avoid an unnecessary quote escape inside JavaScript interpolation.
        text = text.replace("serviceURL(\\'solver\\'", "serviceURL('solver'")
    return text.replace('当前 C塔壳模板', '当前旧壳模板')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbench', type=Path)
    args = parser.parse_args()
    source = args.workbench.resolve() / 'web'
    if not (source / 'app.mjs').is_file():
        parser.error('workbench/web/app.mjs was not found')
    DEST.mkdir(exist_ok=True)
    queue = ['index.html']
    files = {}
    while queue:
        name = queue.pop()
        if name in files or name == 'public-runtime.mjs':
            continue
        path = (source / name).resolve()
        if not path.is_relative_to(source) or not path.is_file():
            raise ValueError(f'Invalid client dependency: {name}')
        text = transform(name, path.read_text(encoding='utf-8-sig'))
        if re.search(r'ctower|C塔|[DE]:[\\/]|127\.0\.0\.1|localhost|fixtures/', text):
            raise ValueError(f'Private template or local service reference in {name}')
        files[name] = text
        if name.endswith(('.mjs', '.js')):
            refs = re.findall(r'(?:from\s*|import\s*)[\'\"](\.[^\'\"]+)[\'\"]', text)
        elif name.endswith('.html'):
            refs = re.findall(r'(?:src|href)="([^"#]+\.(?:mjs|js|css)(?:\?[^" ]*)?)"', text)
        else:
            refs = []
        for ref in refs:
            relative = (path.parent / ref.split('?')[0]).resolve().relative_to(source)
            queue.append(relative.as_posix())
    for name, text in files.items():
        target = DEST / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding='utf-8', newline='\n')
    (DEST / 'build-manifest.json').write_text(json.dumps({'edition':'public-v1','files':sorted(files)},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Built {len(files)} public client files in {DEST}')


if __name__ == '__main__':
    main()
