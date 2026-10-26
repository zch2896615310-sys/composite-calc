import {esc,fmt,field,select,panel,table,formSection,advanced} from '../ui.mjs?calculix-checks=19';
import {shellControls,shellContour} from '../shell-contour.mjs';
export const shellDefaults={tStone:6,tSteel:.4,tCore:11,gammaStone:28,gammaSteel:78.5,coreGamma:.3525,g:10,beta:5,alpha:.08,gammaG:1.3,gammaE:1.4,EStone:50000,nuStone:.2,ESteel:206000,nuSteel:.3,coreE:[5,5,2425],coreNu:[.3,.01,.01],coreG:[227.3,170.92,85.46]};
export function shellRequest(ctx){const i=ctx.instance.input;if(i.mode==='legacy')return{formulation:'SAP2000-layered-shell-v1',mode:'legacy',mesh_mm:0,project:{}};
 const p=structuredClone(i.project);if(i.loadId){const l=ctx.getResult(i.loadId),s=ctx.project.modules.find(m=>m.id===i.loadId).input;if(s.mode!=='exact'||s.additional!==0)throw Error('壳自重同步要求精确材料自重且附加恒载为0');if(s.width!==1300||s.height!==2905)throw Error('当前旧壳模板为1300×2905 mm，引用荷载尺寸不一致');for(const k of ['tStone','tSteel','tCore','gammaStone','gammaSteel','g','beta','alpha','gammaG','gammaE'])p[k]=s[k];p.coreGamma=l.coreGamma;}
 if([p.tStone,p.tSteel,p.tCore].some(t=>!(t>0)))throw Error('当前分层壳为固定四层复合板模板，各层厚度须大于0；纯石材或缺层板请使用实体有限元模块。');
 return{formulation:'SAP2000-layered-shell-v1',mode:'worksheet',mesh_mm:i.mesh_mm,project:p};}
export function currentShell(ctx,id=ctx.instance.id){const instance=ctx.project.modules.find(m=>m.id===id);if(instance?.type!=='shell')throw Error('需要引用分层壳模块');const r=ctx.femResults.get(id);if(!r)throw Error('引用的分层壳尚未计算');if(JSON.stringify(r.snapshot)!==JSON.stringify(shellRequest({...ctx,instance})))throw Error('分层壳输入已改变，结果待重新计算');const supportIds=new Set(['10','25','26','27','28','33','34','35','36','37']);return{...r,summary:r.summary.map(s=>({...s,reactions_N:Object.fromEntries(Object.entries(s.reactions_N).filter(([id])=>supportIds.has(id)))}))};}
const parameterLabels={tStone:['石材厚度','mm'],tSteel:['单面钢板厚度','mm'],tCore:['蜂窝芯厚度','mm'],gammaStone:['石材重度','kN/m³'],gammaSteel:['钢板重度','kN/m³'],coreGamma:['芯层重度','kN/m³'],g:['重力加速度','m/s²'],beta:['动力放大系数 βE',''],alpha:['地震系数 αmax',''],gammaG:['恒载分项系数 γG',''],gammaE:['地震分项系数 γE',''],EStone:['石材弹性模量','MPa'],nuStone:['石材泊松比',''],ESteel:['钢板弹性模量','MPa'],nuSteel:['钢板泊松比','']};
const resultsTable=r=>table(['工况','|UY|max / mm','石材 SMax / MPa','钢板 SVM / MPa','芯层 |S23Avg| / MPa'],r.summary.map(s=>[s.case,fmt(s.max_abs_uy_mm,8),fmt(s.layers.marb.SMax.value,8),fmt(Math.max(s.layers.stl1.SVM.value,s.layers.stl2.SVM.value),8),fmt(s.layers['al-core'].S23Avg.value,8)]));
export default{type:'shell',version:1,title:'复合板分层壳',symbol:'▤',description:'SAP2000 对照模式：运行新参数会启动本机 SAP；原模型校准读取使用已有结果。',create:()=>({mode:'worksheet',loadId:'',mesh_mm:100,project:structuredClone(shellDefaults)}),
 validate:i=>{if(!i||!['legacy','worksheet'].includes(i.mode)||typeof i.mesh_mm!=='number'||!i.project||Object.keys(shellDefaults).some(k=>!(k in i.project)))throw Error('分层壳参数格式错误');},
 dependencies:i=>i.mode==='worksheet'&&i.loadId?[{id:i.loadId,types:['loads']}]:[],request:shellRequest,endpoint:'/api/shell',
 calculate:ctx=>{try{return currentShell(ctx);}catch{return null;}},
 render(ctx){return `<div class="editor-grid"><div>${panel('旧SAP分层壳记录',`<div class="panel-body"><p>当前工作台已统一使用V2 CalculiX实体核心。该旧记录仅保留原参数及历史来源，不再调用SAP。</p><button data-action="migrate-solid" class="primary">按这些参数另存为CalculiX实体分析</button><p class="hint">原记录保留。实体与原壳口径不同，新副本须独立计算。</p></div>`)}</div><div>${panel('历史记录',`<div class="panel-body"><p>旧壳结果不参与当前实体验算。${ctx.result?'已有历史壳结果保留，可在旧项目中核对。':'当前没有可读取的历史结果。'}</p></div>`)}</div></div>`;},
 report(ctx){const r=ctx.result;if(!r)return '<p>分层壳输入尚未得到匹配结果。</p>';const layers=r.layers,request=shellRequest(ctx),p=request.project;
 let html=`<p>${esc(r.formulation)}。${esc(r.basis)} ${r.mode==='legacy'?'本节为已验证原模型校准参考，未作新输入求解。':'当前计算书荷载，等效法向面荷载 qEk=βE·αmax·Gk，取正负地震组合。'}</p>`+table(['层','中面距离 / mm','厚度 / mm','积分点'],layers.LayerName.map((n,j)=>[n,fmt(layers.Dist[j],6),fmt(layers.Thickness[j],6),layers.NumIntegrationPts[j]]));
 if(r.mode==='worksheet')html+=table(['材料参数','采用值'],[['石材 E / ν',`${p.EStone} MPa / ${p.nuStone}`],['钢板 E / ν',`${p.ESteel} MPa / ${p.nuSteel}`],['芯材 E1/E2/E3 / MPa',p.coreE.join(' / ')],['芯材 G12/G13/G23 / MPa',p.coreG.join(' / ')],['芯材 CSI U12/U13/U23',p.coreNu.join(' / ')],['石材 / 钢板 / 芯材重度 kN/m³',`${p.gammaStone} / ${p.gammaSteel} / ${p.coreGamma}`]]);
 html+=table(['挂点','X / mm','Z / mm','固定平移'],Object.keys(r.summary[0].reactions_N).map(n=>[n,r.coordinates[n][0],r.coordinates[n][2],n==='26'?'X,Y,Z':n==='37'?'Y,Z':'Y']))+resultsTable(r);
 const primary=r.summary.filter(s=>s.case.startsWith('WB_ULS_')),service=r.summary.filter(s=>s.case.startsWith('WB_SLS_'));
 if(r.mode==='worksheet')for(const[layer,quantity]of [['marb','SMax'],['stl1','SVM'],['stl2','SVM'],['al-core','S23Avg'],['marb','UY']]){
  const cases=quantity==='UY'?service:primary;let selected=null;
  for(const c of cases){if(quantity==='UY'){const v=c.max_abs_uy_mm;if(!selected||v>selected.value)selected={case:c.case,value:v,ip:'1'};}else{const v=c.layers[layer][quantity];if(!selected||v.value>selected.value)selected={case:c.case,value:v.value,ip:String(v.ip)};}}
  html+=shellContour(r,{...selected,layer,quantity,average:'none'});
 }else html+=shellContour(r,ctx.instance.view);
 html+=table(['工况','挂点','Rx / N','Ry / N','Rz / N'],r.summary.filter(s=>r.mode==='legacy'?s.case==='承载力极限状态':s.case.startsWith('WB_ULS_')).flatMap(s=>Object.entries(s.reactions_N).map(([n,v])=>[s.case,n,...v.map(a=>fmt(a,8))])));
 return html+`<p>算例 ${esc(r.job_id)}；来源 ${esc(r.provenance.kind)}；输入哈希 ${esc(r.input_hash)}。</p>`;}
};
