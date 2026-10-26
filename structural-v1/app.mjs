import {services,serviceURL,reportDownloadURL} from './public-runtime.mjs';
import {onlineReport} from './online-report.mjs';
import {loadSecondBook,loadWord0920,instantiateExample,restoreExampleResults} from './example-project.mjs';
import {upgradeStabilityProject} from './modules/stability-2025.mjs';
import {analysisFor,checksFor,analysisNav,analysisChoices,analysisChecks,isAnalysis,createAnalysisCheck} from './fem-workspace.mjs?calculix-checks=19';
import {setupBeamCurveHover} from './beam-curve.mjs?calculix-checks=19';
import {fitBeamFigures} from './modules/beam.mjs?report-red=1';
import {setupBeamEditor} from './beam-editor.mjs?report-wide=2';
import {registry,newProject,addModule,validateProject,evaluate} from './model.mjs?calculix-checks=25';
import {inputKey} from './modules/fem.mjs?calculix-checks=19';
import {esc,error} from './ui.mjs?calculix-checks=19';
import {cadSection,parseDXF} from './engines/cad.mjs';
import {reportPayload} from './report-export.mjs?report-red=1';
import {moduleState} from './ui-state.mjs';
import {loadReportInput} from './modules/loads.mjs?calculix-checks=19';
import {setupCadImport} from './cad-import.mjs';
import {setupSectionLibrary} from './section-library.mjs';
import {setupFemEditor} from './fem-editor.mjs?model=10';
import {markReportFailures} from './report-status.mjs';

const $=s=>document.querySelector(s),KEY='stonecalc.public.v1';
let store,activeId,selectedId,defaultFem,reportHTML='',undoModule=null,recoveryBlocked=false;
const femResults=new Map(),jobs=new Map(),polling=new Set(),detailStates=new Map(),inputErrors=new Map(),paneViews=new Map();
const femUndo=new Map();
let renderedId=null;
try{
  const saved=localStorage.getItem(KEY);
  store=saved?JSON.parse(saved):{projects:[newProject()],activeId:null};
  if(!Array.isArray(store.projects)||!store.projects.length)throw Error('项目列表为空');
  store.projects.forEach(validateProject);
  if(store.projects.map(upgradeStabilityProject).some(Boolean)){try{localStorage.setItem(KEY,JSON.stringify(store));}catch{recoveryBlocked=true;setTimeout(()=>toast('2025稳定性已在当前会话升级；存储空间不足，自动保存暂停，请导出项目备份。'),500);}}
  activeId=store.projects.some(p=>p.id===store.activeId)?store.activeId:store.projects[0].id;
}catch(e){
  try{const previous=localStorage.getItem(KEY);if(previous)localStorage.setItem(KEY+'.recovery.'+Date.now(),previous);}catch{recoveryBlocked=true;}
  store={projects:[newProject()],activeId:null};activeId=store.projects[0].id;
  setTimeout(()=>toast(recoveryBlocked?'旧记录无法读取，且备份失败；自动保存已暂停，请导出当前项目。':'本地旧记录无法读取，已保留恢复副本，当前新建空白项目。'),500);
}
selectedId=project().modules[0]?.id;
function project(){return store.projects.find(p=>p.id===activeId);}
function selected(){return project().modules.find(m=>m.id===selectedId);}
function save(){
  store.activeId=activeId;
  if(recoveryBlocked){$('#save-state').textContent='旧记录待恢复，请导出当前项目';return;}
  try{localStorage.setItem(KEY,JSON.stringify(store));$('#save-state').textContent='已自动保存到本机';}
  catch{$('#save-state').textContent='本地保存失败，请导出项目';toast('浏览器存储不足，请使用“导出项目”保存文件。');}
}
let toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4000);}
function library(){
 const row=d=>`<div class="library-row"><div class="library-symbol">${esc(d.symbol)}</div><div><h3>${esc(d.title)}</h3><p>${esc(d.description)}</p></div><button data-action="add" data-type="${d.type}">＋ 添加</button></div>`;
 const main=['loads','section','beam'].map(type=>row(registry.get(type))).join('');
 const analysis=`<div class="library-row fem-library-entry"><div class="library-symbol">▦</div><div><h3>有限元分析</h3><p>纯石材 / 蜂窝复合石材；建模、彩色云图、板与连接验算集中在同一工作区。</p></div><button data-action="fem-choose" ${defaultFem?'':'disabled title="有限元在线服务待接入"'}>选择材料</button></div>`;
 const checks=['check','column_strength','column_deflection','hanger_demand','member_stability','bracket_strength','anchor_test'].map(type=>row(registry.get(type))).join('');
 return `<h3 class="library-category">常用计算</h3>${main}${analysis}<p class="hint">${services.solverBase?'有限元由已配置的在线服务运行。':'有限元服务待接入；当前可使用截面、连续梁、荷载与构件验算。'}</p><details class="library-more"><summary>其他构件验算</summary>${checks}</details><details class="library-more"><summary>单独添加板与连接验算（已有分析时）</summary><p class="hint">通常直接进入有限元工作区，在里面启用所需验算即可。</p>${analysisChecks.map(([type])=>row(registry.get(type))).join('')}</details>`;
}
function extra(){return {femResults,jobs,defaultFem};}
function context(instance,evaluation){return {instance,project:project(),...extra(),...evaluation,result:evaluation.results.get(instance.id),errorHtml:evaluation.errors.has(instance.id)?error(errorText(evaluation.errors.get(instance.id))):''};}
function errorText(message){const match=/Beam model (\d+)/.exec(message);if(!match)return message;return ({1:'梁模型文本格式有误，请检查字段、单位和数值。',2:'段长无效或超过 20 段。',3:'荷载或支点位置超出梁长。',4:'至少需要两个不同的竖向支点。',5:'刚度或限值参数无效。',6:'传力支点编号无效。',7:'荷载格式无效，或荷载数量超过上限。',9:'模型求解或平衡检查未通过，请检查支点及荷载。',10:'自重设置无效。'})[match[1]]||message;}
function stateFor(m,evaluation){
 let stale=false,requestError='';
 if(['fem','shell'].includes(m.type))try{const key=JSON.stringify(registry.get(m.type).request(context(m,evaluation)));stale=!!m.lastRun&&key!==m.lastRun.inputKey;}catch(e){requestError=e.message;}
 return moduleState({type:m.type,result:evaluation.results.get(m.id),error:evaluation.errors.get(m.id)||requestError,job:jobs.get(m.id),stale,inputError:inputErrors.has(m.id)});
}
function renderModules(evaluation){
 const visible=project().modules.filter(m=>!analysisFor(project(),m)||isAnalysis(m));
 $('#module-list').innerHTML=visible.map(m=>{const i=project().modules.indexOf(m),owner=analysisFor(project(),selected()),active=m.id===selectedId||owner?.id===m.id,state=stateFor(m,evaluation),children=isAnalysis(m)?checksFor(project(),m):[];return `<button class="module-item ${active?'active':''}" data-action="select" data-id="${m.id}" ${active?'aria-current="true"':''}><span class="num">${String(i+1).padStart(2,'0')}</span><span class="module-copy"><span class="module-name">${esc(m.name)}</span><span class="module-meta"><small>${isAnalysis(m)?'有限元分析':esc(registry.get(m.type).title)}</small><em class="state-pill ${state.tone}">${esc(state.label)}</em></span>${children.length?`<small class="fem-child-count">含 ${children.length} 项验算</small>`:''}</span></button>`;}).join('');
 const nav=$('#fem-workspace-slot');if(nav)nav.innerHTML=analysisNav(project(),selected(),m=>stateFor(m,evaluation));
 const badge=$('.current-module-state');if(badge&&selected()){const state=stateFor(selected(),evaluation);badge.className='state-pill current-module-state '+state.tone;badge.textContent=state.label;}
}
function rememberDetails(){if(renderedId)detailStates.set(renderedId,new Map([...$('#main').querySelectorAll('details[data-ui-key]')].map(d=>[d.dataset.uiKey,d.open])));}
function restoreDetails(){const saved=detailStates.get(selectedId);if(saved)for(const d of $('#main').querySelectorAll('details[data-ui-key]'))if(saved.has(d.dataset.uiKey))d.open=saved.get(d.dataset.uiKey);}
function render(){
  rememberDetails();inputErrors.clear();
  const p=project(),evaluation=evaluate(p,extra());
  $('#undo-empty').hidden=!(undoModule?.projectId===activeId&&p.modules.length===0);
  $('#projects').innerHTML=store.projects.map(p=>`<option value="${esc(p.id)}" ${p.id===activeId?'selected':''}>${esc(p.name)}</option>`).join('');
  $('#project-name').value=p.name;$('#module-count').textContent=p.modules.filter(m=>!analysisFor(p,m)||isAnalysis(m)).length;
  renderModules(evaluation);
  const m=selected();$('#main').dataset.moduleType=m?.type||'';
  if(!m){$('#main').innerHTML=`<div class="empty"><div class="eyebrow">YOUR STRUCTURAL WORKSPACE</div><h1>需要什么计算，<br>就添加什么模块。</h1><p>从一个截面开始，或直接建立连续梁。有限元分析需连接在线服务。每个模块独立命名、保存；需要传递参数时，再建立明确的引用关系。</p><button class="primary" data-action="catalog">＋ 添加第一个计算模块</button>${library()}<p class="hint">左侧“计算示例”提供原值1有限元分析，以及0920版6mm Word计算书两个独立项目。项目以 JSON 文件保存，可在本机继续编辑。</p></div>`;return;}
  const def=registry.get(m.type),index=p.modules.indexOf(m);
  const state=stateFor(m,evaluation);
  $('#main').innerHTML=`<div class="page-head"><div class="module-intro"><div class="eyebrow">${esc(p.name)} · 模块 ${String(index+1).padStart(2,'0')}</div><div class="module-heading"><input class="title-input" data-path="name" value="${esc(m.name)}" aria-label="模块名称"><span class="state-pill current-module-state ${state.tone}">${esc(state.label)}</span></div><p>${esc(def.description)}</p></div><div class="head-actions"><button data-action="up" ${index===0?'disabled':''}>上移</button><button data-action="down" ${index===p.modules.length-1?'disabled':''}>下移</button><details class="module-menu"><summary>更多操作</summary><div><button data-action="duplicate">复制模块</button><button class="danger-action" data-action="remove">移除模块</button>${undoModule?'<button data-action="undo">撤销移除</button>':''}</div></details></div></div><div id="fem-workspace-slot">${analysisNav(p,m,m=>stateFor(m,evaluation))}</div><div class="editor-tabs" role="tablist" aria-label="模块视图"><button role="tab" data-action="pane-input" aria-controls="module-inputs" aria-selected="true">输入参数</button><button role="tab" data-action="pane-results" aria-controls="module-results" aria-selected="false">计算结果</button></div>${def.render(context(m,evaluation))}`;
  const panes=$('#main .editor-grid');if(panes){panes.children[0].id='module-inputs';panes.children[1].id='module-results';}
  setPane(paneViews.get(m.id)||'input');renderedId=m.id;restoreDetails();layoutCurrentBeam(evaluation);mountFemEditor(evaluation);
}
function mountFemEditor(evaluation=evaluate(project(),extra())){
 const m=selected();if(m?.type!=='fem')return;let effectiveProject;try{effectiveProject=registry.get('fem').request(context(m,evaluation)).project;}catch{}
 setupFemEditor($('#main .fem-model-editor'),{...context(m,evaluation),effectiveProject},{commit(input){if(selected()?.id!==m.id)return;registry.get('fem').validate(input);const undo=femUndo.get(m.id)||[];undo.push(structuredClone(m.input));if(undo.length>20)undo.shift();femUndo.set(m.id,undo);m.input=input;inputErrors.delete(m.id);mutate();},undo(){const input=femUndo.get(m.id)?.pop();if(input){m.input=input;mutate();}},canUndo:!!femUndo.get(m.id)?.length,saveView(view){m.modelView=view;save();},onError:toast});
}
function setPane(pane){$('#main').dataset.editorPane=pane;paneViews.set(selectedId,pane);for(const button of $('#main').querySelectorAll('[role="tab"]'))button.setAttribute('aria-selected',String(button.dataset.action==='pane-'+pane));if(pane==='results')layoutCurrentBeam();}
function layoutCurrentBeam(evaluation=null){const m=selected();if(m?.type==='beam')fitBeamFigures(m.input,(evaluation||evaluate(project(),extra())).results.get(m.id));}
function mutate(){save();render();}
function showModuleStart(){$('#main').scrollIntoView({block:'start',behavior:'auto'});}
function download(name,text,type='application/json'){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function safeName(v){return v.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,90)||'计算项目';}
function snapshotInput(){const m=selected();return m?.type==='fem'?inputKey(m.input):null;}
function setPath(root,path,value){const parts=path.split('.');let obj=root;for(const p of parts.slice(0,-1)){if(['__proto__','prototype','constructor'].includes(p))throw Error('字段无效');if(obj[p]===undefined)obj[p]={};obj=obj[p];}obj[parts.at(-1)]=value;}

// Persist valid edits on input as well as change. Update only the result
// column while typing so the focused form and selection remain intact.
document.addEventListener('input',event=>{
  const el=event.target;
  if(!el.dataset.path||!selected()||el.tagName==='SELECT')return;
  try{
    let value=el.value;
    if(el.hasAttribute('data-number')){if(!value.trim()||!Number.isFinite(Number(value)))throw Error('输入尚不完整');value=Number(value);}
    if(el.hasAttribute('data-array')){const a=value.split(/[,，]/);if(a.some(v=>!v.trim()||!Number.isFinite(Number(v))))throw Error('输入尚不完整');value=a.map(Number);}
    if(el.hasAttribute('data-json'))value=JSON.parse(value);
    if(el.hasAttribute('data-rects'))value=value.trim().split(/\n/).map(line=>{const a=line.split(/[,，]/).map(v=>v.trim());if(a.length!==5||a.some(v=>!v||!Number.isFinite(Number(v))))throw Error('每行需要五个数值');const [x,y,b,h,E]=a.map(Number);return{x,y,b,h,E};});
    const draft=structuredClone(selected());setPath(draft,el.dataset.path,value);registry.get(draft.type).validate(draft.input);Object.assign(selected(),draft);inputErrors.delete(selectedId);save();el.removeAttribute('aria-invalid');
    rememberDetails();const evaluation=evaluate(project(),extra()),temp=document.createElement('div');temp.innerHTML=registry.get(draft.type).render(context(selected(),evaluation));
    const current=$('#main .editor-grid')?.lastElementChild,next=temp.querySelector('.editor-grid')?.lastElementChild;
    if(current&&next){next.id='module-results';current.replaceWith(next);}if(draft.type==='fem'){const old=$('#main .fem-model-editor'),preview=temp.querySelector('.fem-model-editor');if(old&&preview){old.replaceWith(preview);mountFemEditor(evaluation);}}restoreDetails();renderModules(evaluation);layoutCurrentBeam(evaluation);
  }catch(e){inputErrors.set(selectedId,e.message);renderModules(evaluate(project(),extra()));el.setAttribute('aria-invalid','true');const out=$('#main .editor-grid')?.lastElementChild;if(out)out.innerHTML=error('当前输入尚不完整，结果待更新。');}
});

document.addEventListener('change',event=>{
  const el=event.target;
  try{
    if(el.id==='projects'){activeId=el.value;selectedId=project().modules[0]?.id;undoModule=null;mutate();restoreRuns();return;}
    if(el.id==='project-name'){project().name=el.value.trim()||'未命名计算项目';mutate();return;}
    if(!el.dataset.path||!selected())return;
    let value=el.value;
    if(el.hasAttribute('data-number')){if(!value.trim()||!Number.isFinite(Number(value)))throw Error('请输入有效数值');value=Number(value);}
    if(el.hasAttribute('data-array')){const parts=value.split(/[,，]/);if(parts.some(v=>!v.trim()||!Number.isFinite(Number(v))))throw Error('请输入逗号分隔的有效数值');value=parts.map(Number);}
    if(el.hasAttribute('data-json'))value=JSON.parse(value);
    if(el.hasAttribute('data-rects'))value=value.trim().split(/\n/).map(line=>{const a=line.split(/[,，]/).map(v=>v.trim());if(a.length!==5||a.some(v=>!v||!Number.isFinite(Number(v))))throw Error('每行需要 x,y,宽度,高度,E 五个数值');const [x,y,b,h,E]=a.map(Number);return {x,y,b,h,E};});
    const current=el.dataset.path.split('.').reduce((obj,key)=>obj?.[key],selected());
    if(JSON.stringify(current)===JSON.stringify(value))return;
    const draft=structuredClone(selected());if(!registry.get(draft.type).changeInput?.(draft.input,el.dataset.path,value))setPath(draft,el.dataset.path,value);registry.get(draft.type).validate(draft.input);
    Object.assign(selected(),draft);mutate();
  }catch(e){toast(`未保存本次输入：${e.message}`);el.setAttribute('aria-invalid','true');}
});

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;
  const action=button.dataset.action;
  try{
    if(action==='pane-input'||action==='pane-results'){setPane(action.slice(5));return;}
    if(action==='templates'){$('#templates').showModal();return;}
    if(action==='close-templates'){$('#templates').close();return;}
    if(['word-project','mathcad-project','calculix-project','linked-demo','demo'].includes(action))$('#templates').close();
    if(action==='catalog'){$('#catalog-items').innerHTML=library();$('#catalog').showModal();return;}
    if(action==='close-catalog'){$('#catalog').close();return;}
    if(action==='close-report'){$('#report').close();return;}
    if(action==='section-save'){sectionLibrary.openSave();return;}
    if(action==='section-library'){sectionLibrary.openLibrary();return;}
    if(action==='select'){selectedId=button.dataset.id;render();showModuleStart();return;}
    if(action==='new'){const p=newProject();store.projects.push(p);activeId=p.id;selectedId=null;undoModule=null;mutate();return;}
    if(action==='fem-choose'||action==='fem-guide'){$('#catalog-items').innerHTML=`<button class="fem-back" data-action="fem-back">← 全部计算模块</button>`+analysisChoices();$('#catalog').showModal();return;}
    if(action==='fem-back'){$('#catalog-items').innerHTML=library();return;}
    if(action==='fem-create'){
      const material=button.dataset.material,type='fem';
      if(type==='fem'&&!defaultFem)throw Error('有限元在线服务待接入。');
      const m=addModule(project(),type,extra());
      if(material==='layered'){m.input.analysisKind='layered';m.input.mesh_mm=50;}
      if(material==='stone')m.input.project.layers=m.input.project.layers.filter(layer=>layer.material==='MARBLE');
      m.name=(material==='stone'?'纯石材':material==='layered'?'蜂窝复合石材 · 分层壳':'蜂窝复合石材')+' · 有限元分析';selectedId=m.id;$('#catalog').close();mutate();return;
    }
    if(action==='migrate-solid')throw Error('请新建有限元分析；旧壳记录仅供查看。');
    if(action==='fem-tab'){
      const root=project().modules.find(m=>m.id===button.dataset.root);if(!isAnalysis(root))throw Error('对应的板分析不存在');
      const m=button.dataset.id?project().modules.find(m=>m.id===button.dataset.id):createAnalysisCheck(project(),root,button.dataset.check,type=>addModule(project(),type,extra()));
      if(!m)throw Error('验算模块不存在');selectedId=m.id;mutate();showModuleStart();return;
    }
    if(action==='add'){
      if(button.dataset.type==='fem'&&!defaultFem)throw Error('有限元在线服务待接入。');
      const m=addModule(project(),button.dataset.type,extra());selectedId=m.id;$('#catalog').close();mutate();return;
    }
    if(action==='duplicate'){const m=structuredClone(selected());m.id=crypto.randomUUID();m.name+=' 副本';delete m.lastRun;project().modules.splice(project().modules.indexOf(selected())+1,0,m);selectedId=m.id;mutate();return;}
    if(action==='up'||action==='down'){const a=project().modules,j=a.indexOf(selected()),k=j+(action==='up'?-1:1);if(k>=0&&k<a.length)[a[j],a[k]]=[a[k],a[j]];mutate();return;}
    if(action==='remove'){const a=project().modules,j=a.indexOf(selected());undoModule={projectId:activeId,index:j,module:a.splice(j,1)[0]};selectedId=a[Math.min(j,a.length-1)]?.id;mutate();toast('模块已移除，可用“撤销移除”恢复。');return;}
    if(action==='undo'&&undoModule?.projectId===activeId){project().modules.splice(undoModule.index,0,undoModule.module);selectedId=undoModule.module.id;undoModule=null;mutate();return;}
    if(action==='export'){download(safeName(project().name)+'.stonecalc.json',JSON.stringify(project(),null,2));toast('项目已导出，包含所有模块输入与引用关系。');return;}
    if(action==='import'){$('#import-file').click();return;}
    if(action==='public-demo'||action==='word0920-demo'){
      button.disabled=true;
      try{
        const word=action==='word0920-demo',bundle=await(word?loadWord0920():loadSecondBook()),p=validateProject(instantiateExample(bundle));
        if(!word)restoreExampleResults(p,bundle,femResults);
        store.projects.push(p);activeId=p.id;selectedId=(word?p.modules[0]:p.modules.find(m=>m.type==='fem')).id;undoModule=null;
        $('#templates').close();mutate();toast(word?'已载入示例2：0920版6mm Word，18个模块与原文对照。':'已载入第二份计算书：原值1、18格分层壳及已验证结果快照。');
      }finally{button.disabled=false;}
      return;
    }
    if(action==='report'){
      const p=project(),evaluation=evaluate(p,extra());
      reportHTML=`<h1>${esc(p.name)}</h1><p>结构计算汇总 · ${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}（北京时间）</p><p>章节按照项目模块顺序生成。每个模块附当前输入，计算假定和未计算状态单独列明。</p>${p.modules.length?p.modules.map((m,i)=>`<section class="report-section"><h2>${i+1}. ${esc(m.name)}</h2>${registry.get(m.type).report(context(m,evaluation))}<details><summary>当前输入快照</summary><pre>${esc(JSON.stringify(m.type==='loads'?loadReportInput(m.input):m.input,null,2))}</pre></details></section>`).join(''):'<p>项目还没有计算模块。</p>'}`;
      if(p.reportInfo){const states=p.modules.map(m=>[m.name,evaluation.results.get(m.id)?.state]).filter(([,s])=>s);reportHTML=reportHTML.replace('</h1>','</h1>'+p.reportInfo.paragraphs.map(t=>t.startsWith('公开示例载入此前')?'公开示例初始载入已验证结果快照；载入本身不触发在线求解。修改模型后请运行在线有限元，并使用与当前输入匹配的结果生成计算书。':t).map(t=>`<p>${esc(t)}</p>`).join('')+`<h2>项目校核状态</h2>`+states.map(([n,s])=>`<p>${esc(n)}：${esc(s)}</p>`).join(''));}
      $('#report-download').replaceChildren();$('#report-body').innerHTML=reportHTML;markReportFailures($('#report-body'));reportHTML=$('#report-body').innerHTML;$('#report').showModal();return;
    }
    if(action==='download-report'){const style=await fetch('style.css?report-red=1').then(r=>r.text());download(safeName(project().name)+'-计算汇总.html',`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${esc(project().name)}</title><style>${style}\nbody{background:#fff;max-width:1000px;margin:40px auto;padding:25px}details{display:block}details>pre{display:block}h1{font-size:28px}</style>${reportHTML}</html>`,'text/html');return;}
    if(action==='print-report'){window.print();return;}
    if(action==='export-docx'||action==='export-pdf'){
      if(!services.reportBase)throw Error('Word/PDF 在线导出服务待接入；可先下载 HTML 计算书。');
      button.disabled=true;toast('正在生成含公式与结果图的计算书…');
      try{const p=project(),ev=evaluate(p,extra()),payload=await reportPayload(p,ev,context);payload.format=action==='export-pdf'?'pdf':'docx';const value=await onlineReport(payload);const a=document.createElement('a');a.href=reportDownloadURL(payload.format==='pdf'?value.pdf_url:value.docx_url);a.download=safeName(p.name)+'-结构计算书.'+payload.format;a.click();a.textContent='点击下载 '+(payload.format==='pdf'?'PDF':'Word')+' 计算书';$('#report-download').replaceChildren(a);toast('计算书已生成，可使用预览顶部的下载链接。');}finally{button.disabled=false;}return;
    }
    if(action.startsWith('module:')){
      if(action==='module:run'){await runFem(selected());return;}
      if(action==='module:import-cad'){$('#cad-file').click();return;}
      registry.get(selected().type).action?.(context(selected(),evaluate(project(),extra())),action.slice(7),Number(button.dataset.index));mutate();return;
    }
  }catch(e){toast(e.message);}
});

function applyCad(data,target){if(activeId!==target.projectId||selectedId!==target.moduleId||selected()?.type!=='section')throw Error('当前项目或模块已切换，请重新选择CAD文件');cadSection(data);registry.get('section').validate({...selected().input,shape:'cad',cad:data});selected().input.cad=data;selected().input.shape='cad';mutate();toast('截面轮廓已导入，原 CAD 文件未修改。');}
const importCad=setupCadImport(applyCad);
setupBeamEditor({
 getCurrent(){const m=selected();if(m?.type!=='beam')return null;return{id:m.id,input:m.input,q:evaluate(project(),extra()).results.get(m.id)?.q??m.input.q};},
 update(text,live){const m=selected();if(m?.type!=='beam')return;m.input.model=text;inputErrors.delete(m.id);save();
  if(!live){render();return;}
  rememberDetails();const evaluation=evaluate(project(),extra()),temp=document.createElement('div');temp.innerHTML=registry.get('beam').render(context(m,evaluation));
  const current=$('#main .editor-grid')?.lastElementChild,next=temp.querySelector('.editor-grid')?.lastElementChild;if(current&&next){next.id='module-results';current.replaceWith(next);}
  const nextInputs=temp.querySelector('.editor-grid')?.firstElementChild;
  if(nextInputs){for(const detail of $('#main').querySelectorAll('details[data-ui-key]')){const source=nextInputs.querySelector(`details[data-ui-key="${detail.dataset.uiKey}"]>summary`);if(source&&detail.querySelector('summary'))detail.querySelector('summary').innerHTML=source.innerHTML;}
   for(const el of $('#main').querySelectorAll('[data-beam-field]')){if(el===document.activeElement)continue;const part=el.dataset.posPart,source=nextInputs.querySelector(`[data-beam-field="${el.dataset.beamField}"]${part?'[data-pos-part="'+part+'"]':''}`);if(!source)continue;if(el.tagName==='SELECT')el.innerHTML=source.innerHTML;else if(el.type==='checkbox')el.checked=source.checked;else el.value=source.value;}
  }restoreDetails();renderModules(evaluation);layoutCurrentBeam(evaluation);
 },
 onError(message){if(selected()?.type!=='beam')return;inputErrors.set(selectedId,message);renderModules(evaluate(project(),extra()));const out=$('#main .editor-grid')?.lastElementChild;if(out)out.innerHTML=error('当前模型输入尚未应用，结果待更新：'+message);}
});

const sectionLibrary=setupSectionLibrary({getCurrent(){const m=selected();if(m?.type!=='section')throw Error('请先选择截面模块');return{name:m.name,input:structuredClone(m.input),target:{projectId:activeId,moduleId:m.id}};},apply(item,target){if(activeId!==target.projectId||selectedId!==target.moduleId||selected()?.type!=='section')throw Error('模块已切换，请重新打开截面库');registry.get('section').validate(item.input);registry.get('section').calculate({instance:{input:item.input}});selected().input=structuredClone(item.input);selected().name=item.name;mutate();toast('已载入常用截面，当前模块及其引用已更新。');},changed:render});
$('#cad-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file||selected()?.type!=='section')return;const target={projectId:activeId,moduleId:selectedId};try{if(/\.dwg$|\.dxf$/i.test(file.name))await importCad(file,target);else{if(file.size>2_000_000)throw Error('轮廓JSON超过2 MB');applyCad(JSON.parse(await file.text()),target);}}catch(err){toast('截面导入失败：'+err.message);}finally{e.target.value='';}});

$('#import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{
    if(file.size>5_000_000)throw Error('项目文件大于 5 MB');
    const p=validateProject(JSON.parse(await file.text()));upgradeStabilityProject(p);
    const ids=new Map(p.modules.map(m=>[m.id,crypto.randomUUID()]));
    for(const m of p.modules){m.id=ids.get(m.id);for(const key of Object.keys(m.input).filter(k=>k.endsWith('Id')))if(m.input[key]&&ids.has(m.input[key]))m.input[key]=ids.get(m.input[key]);}
    p.id=crypto.randomUUID();p.name+='（导入）';store.projects.push(p);activeId=p.id;selectedId=p.modules[0]?.id;undoModule=null;mutate();restoreRuns();toast('已导入为独立项目。');
  }catch(e){toast(`导入失败：${e.message}`);}finally{event.target.value='';}
});

async function runFem(m){
  if(m.type!=='fem')throw Error('已停用SAP求解，请使用CalculiX实体分析。');
  if(jobs.has(m.id)&&['queued','running'].includes(jobs.get(m.id).status))return;
  const evaluation=evaluate(project(),extra()),definition=registry.get(m.type);const payload=definition.request(context(m,evaluation)),key=JSON.stringify(payload);
  const response=await fetch(serviceURL('solver',definition.endpoint||'/api/fem'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const value=await response.json();if(!response.ok)throw Error(value.error||'计算请求失败');
  m.lastRun={jobId:value.job_id,inputKey:key};jobs.set(m.id,{status:'queued',message:'已加入计算队列'});save();render();poll(m);
}
async function poll(m){
  if(polling.has(m.id))return;polling.add(m.id);
  const run=m.lastRun;
  try{
    while(true){
      const response=await fetch(serviceURL('solver',`/api/jobs/${run.jobId}`)),j=await response.json();
      if(!response.ok)throw Error(j.error||'读取算例失败');
      if(m.lastRun?.jobId!==run.jobId)return;
      jobs.set(m.id,j);
      if(j.status==='done'){
        if(JSON.stringify(j.result.snapshot)!==run.inputKey)throw Error('算例快照与提交参数不匹配，结果未采用');
        femResults.set(m.id,j.result);if(project().modules.some(x=>x.id===m.id))render();return;
      }
      if(j.status==='error'){if(selectedId===m.id)render();return;}
      if(selectedId===m.id&&$('#fem-progress'))$('#fem-progress').textContent=j.message;
      await new Promise(resolve=>setTimeout(resolve,1200));
    }
  }catch(e){jobs.set(m.id,{status:'error',message:e.message+'；可重新运行。'});if(selectedId===m.id)render();}
  finally{polling.delete(m.id);}
}
async function restoreRuns(){
  const p=project();
  if(p.modules.some(m=>m.exampleSnapshot==='second-book-original-1')){
    try{restoreExampleResults(p,await loadSecondBook(),femResults);if(activeId===p.id)render();}
    catch(e){toast('示例结果加载失败：'+e.message);}
  }
  if(!services.solverBase)return;
  for(const m of p.modules)if(m.type==='fem'&&m.lastRun&&!femResults.has(m.id))poll(m);
}

setupBeamCurveHover();
new ResizeObserver(()=>layoutCurrentBeam()).observe($('#main'));
render();
try{
  const response=await fetch(serviceURL('solver','/api/default-fem'));if(!response.ok)throw Error();defaultFem=await response.json();defaultFem.loads.y_acceleration=3923;
  $('#service-status').textContent='在线有限元服务已连接 · CalculiX';if(!project().modules.length)render();restoreRuns();
}catch{$('#service-status').textContent=services.solverBase?'有限元服务连接失败 · 浏览器计算可用':'浏览器计算可用 · 有限元服务待接入';}
for(const action of ['export-docx','export-pdf'])if(!services.reportBase){const b=document.querySelector(`[data-action="${action}"]`);b.disabled=true;b.title='Word/PDF 在线导出服务待接入，可先下载 HTML';}
if(!services.reportBase){const note=document.createElement('p');note.className='hint public-export-note';note.textContent='Word/PDF 在线导出服务待接入。当前可预览或下载 HTML 计算书，不满足项以红色标注。';$('#report-body').before(note);}
restoreRuns();

for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d){const box=d.getBoundingClientRect();if(e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)d.close();}});
window.addEventListener('beforeunload',()=>{if(store.projects.length)save();});
