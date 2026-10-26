"""Build the public browser client from an existing workbench checkout.

Executable client dependencies and the explicitly selected second-book example
are copied. Other project fixtures, reports and solver files are excluded.
Usage: python tools/build-public-workbench.py <workbench-directory>
"""
from pathlib import Path
import argparse
import json
import re
from pathlib import PureWindowsPath

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
    text = "import {services,serviceURL,reportDownloadURL} from './public-runtime.mjs';\nimport {onlineReport} from './online-report.mjs';\nimport {loadSecondBook,loadWord0920,instantiateExample,restoreExampleResults} from './example-project.mjs';\n" + text
    text = replace(text, "KEY='stonecalc.workbench.v1'", "KEY='stonecalc.public.v1'")
    text = replace(text, "${main}${analysis}<details", "${main}${analysis}<p class=\"hint\">${services.solverBase?'有限元由已配置的在线服务运行。':'有限元服务待接入；当前可使用截面、连续梁、荷载与构件验算。'}</p><details")
    text = replace(text, '<button data-action="fem-choose">选择材料</button>', '<button data-action="fem-choose" ${defaultFem?\'\':\'disabled title="有限元在线服务待接入"\'}>选择材料</button>')
    text = replace(text, '已有完整示例可从左侧“项目模板与验证”打开。', '左侧“计算示例”提供原值1有限元分析，以及0920版6mm Word计算书两个独立项目。')
    text = replace(text, '从一个截面开始，或直接建立连续梁、复合板有限元分析。', '从一个截面开始，或直接建立连续梁。有限元分析需连接在线服务。')
    text = block(text, "    if(action==='migrate-solid'){", "    if(action==='fem-tab'){", "    if(action==='migrate-solid')throw Error('请新建有限元分析；旧壳记录仅供查看。');\n")
    text = block(text, "    if(action==='demo'){", "    if(action==='report'){", """    if(action==='public-demo'||action==='word0920-demo'){
      button.disabled=true;
      try{
        const word=action==='word0920-demo',bundle=await(word?loadWord0920():loadSecondBook()),p=validateProject(instantiateExample(bundle));
        if(!word)restoreExampleResults(p,bundle,femResults);
        store.projects.push(p);activeId=p.id;selectedId=(word?p.modules[0]:p.modules.find(m=>m.type==='fem')).id;undoModule=null;
        $('#templates').close();mutate();toast(word?'已载入示例2：0920版6mm Word，18个模块与原文对照。':'已载入第二份计算书：原值1、18格分层壳及已验证结果快照。');
      }finally{button.disabled=false;}
      return;
    }
""")
    text = block(text, "      if(action==='module:cad-example'){", "      registry.get(selected().type).action")
    text = replace(text, "fetch('http://127.0.0.1:8879/api/report'", "fetch(serviceURL('report','/api/report')")
    text = replace(text, "const response=await fetch(serviceURL('report','/api/report'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const value=await response.json();if(!response.ok)throw Error(value.error||'导出失败');", "const value=await onlineReport(payload);")
    text = replace(text, "a.href=payload.format==='pdf'?value.pdf_url:value.docx_url", "a.href=reportDownloadURL(payload.format==='pdf'?value.pdf_url:value.docx_url)")
    text = replace(text, "      button.disabled=true;toast('正在生成含公式与结果图的计算书…');", "      if(!services.reportBase)throw Error('Word/PDF 在线导出服务待接入；可先下载 HTML 计算书。');\n      button.disabled=true;toast('正在生成含公式与结果图的计算书…');")
    text = replace(text, "fetch(definition.endpoint||'/api/fem'", "fetch(serviceURL('solver',definition.endpoint||'/api/fem')")
    text = replace(text, 'fetch(`/api/jobs/${run.jobId}`)', "fetch(serviceURL('solver',`/api/jobs/${run.jobId}`))")
    text = replace(text, "function restoreRuns(){for(const m of project().modules)if(m.type==='fem'&&m.lastRun&&!femResults.has(m.id))poll(m);}", """async function restoreRuns(){
  const p=project();
  if(p.modules.some(m=>m.exampleSnapshot==='second-book-original-1')){
    try{restoreExampleResults(p,await loadSecondBook(),femResults);if(activeId===p.id)render();}
    catch(e){toast('示例结果加载失败：'+e.message);}
  }
  if(!services.solverBase)return;
  for(const m of p.modules)if(m.type==='fem'&&m.lastRun&&!femResults.has(m.id))poll(m);
}""")
    text = replace(text, "fetch('/api/default-fem')", "fetch(serviceURL('solver','/api/default-fem'))")
    text = replace(text, "  $('#service-status').textContent='本地服务已连接 · V2 CalculiX · 不调用SAP';restoreRuns();", "  $('#service-status').textContent='本地服务已连接 · V2 CalculiX · 不调用SAP';if(!project().modules.length)render();restoreRuns();")
    text = replace(text, 'p.reportInfo.paragraphs.map(t=>', "p.reportInfo.paragraphs.map(t=>t.startsWith('公开示例载入此前')?'公开示例初始载入已验证结果快照；载入本身不触发在线求解。修改模型后请运行在线有限元，并使用与当前输入匹配的结果生成计算书。':t).map(t=>")
    text = text.replace('本地有限元服务尚未连接，请运行“启动工作台.cmd”。', '有限元在线服务待接入。')
    text = text.replace('本地服务已连接 · V2 CalculiX · 不调用SAP', '在线有限元服务已连接 · CalculiX')
    text = text.replace('已加入本地计算队列', '已加入计算队列')
    text = replace(text, "}catch{$('#service-status').textContent='服务未连接 · 请使用启动器打开';}", """}catch{$('#service-status').textContent=services.solverBase?'有限元服务连接失败 · 浏览器计算可用':'浏览器计算可用 · 有限元服务待接入';}
for(const action of ['export-docx','export-pdf'])if(!services.reportBase){const b=document.querySelector(`[data-action="${action}"]`);b.disabled=true;b.title='Word/PDF 在线导出服务待接入，可先下载 HTML';}
if(!services.reportBase){const note=document.createElement('p');note.className='hint public-export-note';note.textContent='Word/PDF 在线导出服务待接入。当前可预览或下载 HTML 计算书，不满足项以红色标注。';$('#report-body').before(note);}
restoreRuns();
""")
    return text


def public_index(text):
    text = replace(text, '<title>Stonecalc · 结构计算工作台</title>', '<title>结构计算模块板V1 · 结构计算工具箱</title>')
    text = text.replace('<small>结构计算工作台</small>', '<small>结构计算模块板V1</small>')
    text = replace(text, '<a class="brand" href="/">', '<a class="brand" href="../" title="返回结构计算工具箱">')
    text = text.replace('项目模板与验证', '计算示例')
    text = block(text, '<div class="template-list">', '</div></dialog>\n  <dialog id="report">', '<div class="template-list"><div><h3>示例1 · 第二份计算书有限元分析</h3><p>原值1 mm/s²，18格分层壳、28个参考面节点、10个挂点。保留材料、连接、CAD异型立柱、连续梁与原文对照章节。</p><p class="hint">附已验证结果快照；修改参数后可运行在线有限元重新计算，支持Word / PDF导出。</p><button data-action="public-demo">载入第二份计算书 · 原值1</button></div><div><h3>示例2 · C塔6mm Word计算书（0920）</h3><p>20个模块：面板荷载、挂件需求、立柱连续梁及2025版稳定性、原书2020标注公式复算、偏心角码、横向角钢单向对照及双向耦合梁、锚栓拉拔与原书逐项对照。</p><p class="hint">保留原书采用值；算术与建模差异单独列示。挂件和锚栓无试验报告时为待补数据。此书未提供板有限元模型，示例按原梁模型复现。</p><button data-action="word0920-demo">载入0920 Word · 6mm</button></div>')
    text = text.replace('连接本地计算服务…', '浏览器计算就绪…').replace('例如：C塔主龙骨32×32', '例如：主龙骨矩形钢管')
    text = text.replace('app.mjs?report-red=20261026-v1','app.mjs?structured-inputs=20261026-v1')
    text = text.replace('修改模型后结果失效；重新求解需接入在线有限元服务。','修改模型后结果失效；可在在线有限元服务连接后重新求解。')
    return text


def transform(name, text):
    if name == 'app.mjs':
        return public_app(text)
    if name == 'index.html':
        return public_index(text)
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
        text = "import {services,serviceURL} from '" + ('../' if name.startswith('modules/') else './') + "public-runtime.mjs';\n" + text
        text = re.sub(r'href="/runs/(.*?)"', r'href="${esc(serviceURL(\'solver\',`/runs/\1`))}"', text)
        # Avoid an unnecessary quote escape inside JavaScript interpolation.
        text = text.replace("serviceURL(\\'solver\\'", "serviceURL('solver'")
        variable = 'current' if name == 'modules/fem.mjs' else 'r'
        text = re.sub(r'<div class="links">.*?</div>', lambda m: '${services.solverBase?`'+m[0]+'`:'+variable+'.exampleSnapshot?\'<div class="links"><a href="examples/second-book-original-1.json" download>下载示例与结果快照</a></div>\':\'\'}', text)
    if name == 'modules/fem.mjs':
        text = replace(text, "let output=`<div class=\"fem-runbar\">", "let output=(ctx.instance.exampleSnapshot&&r?.exampleSnapshot?`<p class=\"result-notice\">${stale?'示例参数已修改，原结果已失效。':'当前显示第二份计算书已验证的示例结果快照。'}${services.solverBase?'可运行在线有限元重新计算。':'在线有限元服务待接入，暂不能重新求解。'}</p>`:'')+`<div class=\"fem-runbar\">")
        text = replace(text, "${isBusy||requestError?'disabled':''}", "${isBusy||requestError||!services.solverBase?'disabled':''}")
        text = text.replace('本地实体或分层壳独立求解', '实体或分层壳独立求解')
    if name == 'layered-results.mjs':
        text = text.replace('变更参数后的结果由本机独立计算', '变更参数后须连接在线有限元服务重新计算')
    if name == 'report-export.mjs':
        text = replace(text, 'introduction:project.reportInfo?.paragraphs||[]', "introduction:(project.reportInfo?.paragraphs||[]).map(t=>t.startsWith('公开示例载入此前')?'公开示例初始载入已验证结果快照；载入本身不触发在线求解。修改模型后请运行在线有限元，并使用与当前输入匹配的结果生成计算书。':t)")
    return text.replace('当前 C塔壳模板', '当前旧壳模板')


def second_book_example(source):
    project = json.loads((source / 'fixtures/ctower-original-1.stonecalc.json').read_text(encoding='utf-8-sig'))
    fem = next(m for m in project['modules'] if m['type'] == 'fem')
    job = fem['lastRun']['jobId']
    if not re.fullmatch('[0-9a-f]{32}', job):
        raise ValueError('Invalid example job ID')
    result = json.loads((source.parent / 'runs' / job / 'summary.json').read_text(encoding='utf-8-sig'))
    if result['snapshot'] != json.loads(fem['lastRun']['inputKey']):
        raise ValueError('Verified result does not match the example input')
    if not (fem['input']['analysisKind'] == 'layered' and fem['input']['mesh_mm'] == 0 and fem['input']['project']['loads']['y_acceleration'] == 1 and result['elements'] == 18 and result['nodes'] == 28 and len(fem['input']['project']['supports']) == 10):
        raise ValueError('Expected the unchanged original-1 second-book model')
    project['name'] = '示例 · 第二份计算书（原值1）'
    # The selected engineering example is authorized for publishing; local
    # filesystem locations are not part of that example's engineering input.
    project['reportInfo']['source'] = PureWindowsPath(project['reportInfo']['source']).name
    project['reportInfo']['paragraphs'].insert(0, '公开示例初始载入已验证结果快照；载入本身不触发在线求解。修改模型后请运行在线有限元，并使用与当前输入匹配的结果生成计算书。')
    for module in project['modules']:
        if module['type'] == 'section' and module['input'].get('cad'):
            module['input']['cad']['source'] = PureWindowsPath(module['input']['cad']['source']).name
        if module['type'] == 'original_comparison':
            module['input']['source'] = PureWindowsPath(module['input']['source']).name
    bundle = {'schemaVersion':1,'id':'second-book-original-1','kind':'verified-fem-example','project':project,'result':result}
    encoded = json.dumps(bundle, ensure_ascii=False, indent=2)+'\n'
    if re.search(r'[A-Za-z]:[\\/]|localhost|127\.0\.0\.1', encoded):
        raise ValueError('Local path or address in public example')
    return encoded


def word0920_example(source):
    project=json.loads((source / 'fixtures/word-0920-complete.stonecalc.json').read_text(encoding='utf-8-sig'))
    if len(project['modules'])!=20 or any(m['type']=='fem' for m in project['modules']):
        raise ValueError('Expected complete 20-module Word example without invented FE')
    project['reportInfo']['source']=PureWindowsPath(project['reportInfo']['source']).name
    for module in project['modules']:
        if module['type']=='section' and module['input'].get('cad'):
            module['input']['cad']['source']=PureWindowsPath(module['input']['cad']['source']).name
    bundle={'schemaVersion':1,'id':'word-0920-6mm','kind':'calculation-example','project':project}
    encoded=json.dumps(bundle,ensure_ascii=False,indent=2)+'\n'
    if re.search(r'[A-Za-z]:[\\/]|localhost|127\.0\.0\.1',encoded):
        raise ValueError('Local path or address in Word example')
    return encoded


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
        if name in files or name in ('public-runtime.mjs','example-project.mjs','online-report.mjs'):
            continue
        path = (source / name).resolve()
        if not path.is_relative_to(source) or not path.is_file():
            raise ValueError(f'Invalid client dependency: {name}')
        text = transform(name, path.read_text(encoding='utf-8-sig'))
        if re.search(r'ctower|[DE]:[\\/]|127\.0\.0\.1|localhost|fixtures/', text):
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
    example = DEST / 'examples/second-book-original-1.json'
    example.parent.mkdir(exist_ok=True)
    example.write_text(second_book_example(source),encoding='utf-8',newline='\n')
    (DEST / 'examples/word-0920-6mm.json').write_text(word0920_example(source),encoding='utf-8',newline='\n')
    (DEST / 'build-manifest.json').write_text(json.dumps({'edition':'public-v1','files':sorted(files),'examples':['examples/second-book-original-1.json','examples/word-0920-6mm.json']},ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(f'Built {len(files)} public client files in {DEST}')


if __name__ == '__main__':
    main()
