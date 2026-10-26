import {esc} from './ui.mjs?calculix-checks=19';

export const analysisTypes=['shell','fem'];
export const analysisChecks=[['panel_strength','材料强度'],['panel_deflection','板挠度'],['rivet','铆钉连接'],['hanger','挂件剪切'],['bonding','粘结检测']];
export const isAnalysis=m=>analysisTypes.includes(m?.type);
export function analysisFor(project,module){
 if(isAnalysis(module))return module;
 if(!analysisChecks.some(([type])=>type===module?.type))return null;
 const explicit=module.input.femId||module.input.analysisId;
 if(explicit)return project.modules.find(m=>m.id===explicit&&isAnalysis(m))||null;
 // Old bonding records had no reference. Group only when the owner is unambiguous.
 if(module.type==='bonding'){
  const roots=project.modules.filter(m=>isAnalysis(m)&&!(m.type==='shell'&&m.input.mode==='legacy'));
  if(roots.length===1)return roots[0];
 }
 return null;
}
export function checksFor(project,root){return project.modules.filter(m=>m.id!==root.id&&analysisFor(project,m)?.id===root.id);}
export function analysisMaterial(root){return root.type==='fem'&&root.input.project.layers.every(l=>l.material==='MARBLE')?'纯石材 · 单层板':'蜂窝复合石材 · 多层板';}
export function analysisMethod(root){return root.type==='fem'?(root.input.analysisKind==='layered'?'CalculiX · 分层壳独立求解（无需 SAP）':'CalculiX · 三维实体独立求解（无需 SAP）'):root.input.mode==='legacy'?'分层壳 · 原模型校准参考':'SAP2000 · 分层壳（运行会启动 SAP）';}
export function createAnalysisCheck(project,root,type,add){
 if(!analysisChecks.some(([t])=>t===type))throw Error('不支持的板分析验算');
 const existing=checksFor(project,root).find(m=>m.type===type);if(existing)return existing;
 if(type!=='bonding'&&root.type!=='fem')throw Error('该项验算需要CalculiX实体结果');
 const child=add(type);if(type==='bonding')child.input.analysisId=root.id;else child.input.femId=root.id;
 return child;
}
export function analysisNav(project,module,state){
 const root=analysisFor(project,module);if(!root)return '';
 const related=checksFor(project,root),canCheck=root.type==='fem';
 const tabs=[['model','建模与结果',root],...analysisChecks.filter(([type])=>canCheck||type==='bonding'||related.some(m=>m.type===type)).flatMap(([type,title])=>{
  const matches=related.filter(m=>m.type===type);return matches.length?matches.map(m=>[type,matches.length>1?m.name:title,m]):[[type,title,null]];
 })];
 return `<section class="fem-workspace-nav" aria-label="有限元工作区"><div class="fem-workspace-heading"><div><strong>有限元分析</strong><span>${esc(analysisMaterial(root))}</span></div><button data-action="fem-guide">材料与模型说明</button></div><div class="fem-workspace-tabs" role="navigation" aria-label="分析与验算">${tabs.map(([type,title,m])=>{const s=m?state(m):null;return `<button data-action="fem-tab" data-root="${esc(root.id)}" data-check="${type}" ${m?`data-id="${esc(m.id)}"`:''} ${m?.id===module.id?'aria-current="page"':''}><span>${esc(title)}</span><small class="${s?.tone||'neutral'}">${esc(s?.label||'＋ 启用')}</small></button>`;}).join('')}</div><p><span class="fem-method-caption">当前模型：${esc(analysisMethod(root))}。</span> ${root.type==='fem'?'先设置板尺寸、材料层和挂点，运行后在下方切换位移、应力云图。强度、挠度和连接验算共用本次分析结果，并保留实体或分层壳的取值口径。':'旧SAP壳记录仅保留历史参数，不再运行SAP。请另存为CalculiX实体后计算。'}${related.length?' 已有验算已自动归入本工作区。':''}</p></section>`;
}
export function analysisChoices(){return `<div class="fem-choice-intro"><h3>选择材料构成</h3><p>使用CalculiX独立求解，不调用SAP。复合板可选择分层壳；其他连接面使用三维实体。计算后可直接启用各层强度、板挠度与连接验算。</p></div><div class="fem-choice-grid"><article><h3>纯石材</h3><p>只建立石材层，输入尺寸、厚度、挂点和荷载。</p><button class="primary" data-action="fem-create" data-material="stone">新建纯石材分析</button></article><article><h3>蜂窝复合石材</h3><p>石材、钢板和蜂窝芯分层建模，完全粘结、线弹性、小变形。应力验算取原始积分点张量，不用云图平均值替代。</p><button class="primary" data-action="fem-create" data-material="composite">新建蜂窝复合石材分析</button><button data-action="fem-create" data-material="layered">新建分层壳分析</button></article></div>`;}
