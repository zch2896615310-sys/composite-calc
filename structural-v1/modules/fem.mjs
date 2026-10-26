import {services,serviceURL} from '../public-runtime.mjs';
import {layeredResults,layeredReport} from '../layered-results.mjs';
import {supportY,thicknessPlanes} from '../fem-model.mjs?model=10';
import {esc,fmt,field,textarea,panel,metrics,table,select,formSection} from '../ui.mjs?calculix-checks=19';
import {contour,controls} from '../contour.mjs?calculix-checks=19';
import {renderFemEditor} from '../fem-editor.mjs?model=10';
const rowInput=(path,val,type='number')=>`<input aria-label="${esc(path)}" data-path="${esc(path)}" type="${type}" ${type==='number'?'step="any" data-number':''} value="${esc(val)}">`;
const displayY=(p,s)=>{try{return supportY(p,s);}catch{return s.y??0;}};
export const inputKey=i=>JSON.stringify({project:i.project,mesh_mm:i.mesh_mm,formulation:i.analysisKind==='layered'?'projected-layered-shell-v1':'C3D8I-body-point-v1',postprocess:i.analysisKind==='layered'?'layered-shell-v1':'solid-ip-v2'});
export function femRequest(ctx){
 const i=ctx.instance.input,p=structuredClone(i.project);
 if(i.loadId){const l=ctx.getResult(i.loadId),source=ctx.project.modules.find(m=>m.id===i.loadId).input;
  if(source.mode!=='exact'||source.additional!==0)throw Error('实体自重引用目前要求荷载模块采用精确值且附加恒载为 0；人工采用值不能自动反推材料密度');
  const counts={MARBLE:0,STEEL:0,CORE:0};for(const layer of p.layers)if(layer.material in counts)counts[layer.material]++;
  const fourLayer=counts.MARBLE===1&&counts.STEEL===2&&counts.CORE===1&&p.layers.length===4;
  const stoneOnly=counts.MARBLE===1&&p.layers.length===1&&source.tCore===0&&source.tSteel===0;
  if(!fourLayer&&!stoneOnly)throw Error('荷载直接同步适用于标准四层复合板或单层纯石材；其他分层请独立输入，单层石材须引用无蜂窝芯及钢板的荷载');
  for(const layer of p.layers)layer.thickness=layer.material==='MARBLE'?source.tStone:layer.material==='STEEL'?source.tSteel:source.tCore;
  p.layers=p.layers.filter(layer=>layer.thickness>0);
  for(const[name,gamma]of [['MARBLE',source.gammaStone],['STEEL',source.gammaSteel],['CORE',l.coreGamma]]){p.materials[name].weight_density=gamma*1e-6;p.materials[name].mass_density=gamma*1e-6/(source.g*1000);}
  p.loads.g=source.g*1000;p.loads.y_acceleration=l.acceleration;
 }
 for(const s of p.supports)if(s.surface)s.y=supportY(p,s);
 thicknessPlanes(p);
 if(i.analysisKind==='layered'){if(p.layers.map(l=>l.material).join(',')!=='MARBLE,STEEL,CORE,STEEL')throw Error('分层壳目前支持石材/钢板/蜂窝芯/钢板四层构造');if(p.supports.some(s=>Math.abs(supportY(p,s))>1e-9))throw Error('分层壳挂点须在参考面 Y=0；其他连接面请用实体模型');return{project:p,mesh_mm:i.mesh_mm,formulation:'projected-layered-shell-v1',postprocess:'layered-shell-v1'};}
 return{project:p,mesh_mm:i.mesh_mm,formulation:'C3D8I-body-point-v1',postprocess:'solid-ip-v2'};
}
export function currentSolid(ctx,id=ctx.instance.id){
 const instance=ctx.project.modules.find(m=>m.id===id);if(instance?.type!=='fem')throw Error('请选择CalculiX实体分析来源，旧SAP壳结果不用于当前验算');
 const r=ctx.femResults.get(id);if(!r)throw Error('引用的CalculiX实体尚未计算');
 if(!['solid-ip-v2','layered-shell-v1'].includes(r.postprocess)||JSON.stringify(r.snapshot)!==JSON.stringify(femRequest({...ctx,instance})))throw Error('实体输入或结果版本已改变，结果待重新计算');
 return r;
}
const layerPeakRows=(r,cases=['ULS','ULS_MINUS'])=>r.summary.filter(s=>cases.includes(s.case)).flatMap(s=>s.layers.map(l=>[s.case,l.layer,...['principal3','mises3','t13','t23','shear_transverse'].map(k=>fmt(l.peaks?.[k]?.value,7))]));
const peakOrigins=(r,all=true)=>r.summary.filter(s=>['ULS','ULS_MINUS'].includes(s.case)).flatMap(s=>s.layers.flatMap(l=>Object.entries(l.peaks||{}).filter(([k])=>all?['principal3','mises3','t13','t23','shear_transverse'].includes(k):(l.material==='MARBLE'?k==='principal3':l.material==='STEEL'?k==='mises3':['t13','t23','shear_transverse'].includes(k))).map(([k,p])=>[s.case,l.layer,({principal3:'最大主拉应力',mises3:'三维Mises',t13:'τ13',t23:'τ23',shear_transverse:'横剪合值'})[k],fmt(p.value,8),`E${p.element} / GP${p.gp}`,p.xyz_mm.map(v=>fmt(v,3)).join(', ')])));
const materialRows=p=>Object.entries(p.materials).flatMap(([name,m])=>[
 ...(m.engineering_constants?[['E1 / E2 / E3',m.engineering_constants.slice(0,3).join(' / '),'MPa'],['ν12 / ν13 / ν23（CSI输入）',m.engineering_constants.slice(3,6).join(' / '),''],['G12 / G13 / G23',m.engineering_constants.slice(6).join(' / '),'MPa']]:[['弹性模量 E',m.E,'MPa'],['泊松比 ν',m.nu,'']]),
 ['质量密度',m.mass_density,'N·s²/mm⁴'],['重量密度',m.weight_density,'N/mm³']].map(row=>[name,...row]));
const combinationText=f=>Object.entries(f).map(([k,v])=>`${v<0?'−':'+'}${Math.abs(v)}${({DEAD:'D',EQ_Y:'EY',EQ_X:'EX'})[k]}`).join(' ').replace(/^\+/, '');
function surface(result){
  const data=result.surface_EQ_Y;if(!data?.length)return '';
  const xs=data.map(p=>p[0]),zs=data.map(p=>p[1]),us=data.map(p=>p[2]),xmin=Math.min(...xs),xmax=Math.max(...xs),zmin=Math.min(...zs),zmax=Math.max(...zs),umax=Math.max(...us.map(Math.abs),1e-15);
  const scale=Math.min(300/(xmax-xmin),235/(zmax-zmin)),x0=290-(xmax-xmin)*scale/2,y0=258;
  const points=data.map(([x,z,u])=>`<circle cx="${x0+(x-xmin)*scale}" cy="${y0-(z-zmin)*scale}" r="3.8" fill="hsl(208 50% ${92-60*Math.abs(u)/umax}%)"/>`).join('');
  return `<div class="visual"><svg viewBox="0 0 580 290" role="img" aria-label="Y向惯性工况参考面节点位移"><rect x="${x0}" y="${y0-(zmax-zmin)*scale}" width="${(xmax-xmin)*scale}" height="${(zmax-zmin)*scale}" stroke="#99afbf" fill="#fff"/>${points}</svg><p class="visual-caption">EQ_Y / Y=0 参考面节点 |UY| · 颜色越深，位移越大</p></div>`;
}
export default {
  type:'fem',version:1,title:'CalculiX有限元',symbol:'▦',description:'多层复合板、挂点约束、自重与惯性荷载；实体或分层壳独立求解。',
  create:ctx=>({project:structuredClone(ctx.defaultFem),mesh_mm:200}),
  validate:i=>{const p=i?.project;if(!p?.geometry||!['x_breaks','z_breaks'].every(k=>Array.isArray(p.geometry[k])&&p.geometry[k].length>=2&&p.geometry[k].every(v=>typeof v==='number'))||!Array.isArray(p.layers)||!p.layers.length||!p.layers.every(l=>typeof l.name==='string'&&typeof l.thickness==='number'&&typeof l.material==='string')||!Array.isArray(p.supports)||!p.supports.every(s=>typeof s.sap_joint==='string'&&typeof s.x==='number'&&typeof s.z==='number'&&Array.isArray(s.dofs))||typeof i.mesh_mm!=='number'||!p.materials||Array.isArray(p.materials)||typeof p.materials!=='object'||!p.loads||!['g','x_acceleration','y_acceleration'].every(k=>typeof p.loads[k]==='number'))throw Error('有限元模块参数格式无效');for(const s of p.supports)if(s.y!==undefined&&!Number.isFinite(s.y)||s.surface!==undefined&&typeof s.surface!=='string')throw Error('挂点Y或连接面格式无效');if(!i.loadId){for(const s of p.supports)supportY(p,s);thicknessPlanes(p);}},
  calculate:ctx=>ctx.femResults.get(ctx.instance.id)||null,
  dependencies:i=>i.loadId?[{id:i.loadId,types:['loads']}]:[],request:femRequest,
  render(ctx){
    const i=ctx.instance.input,p=i.project,r=ctx.result,job0=ctx.jobs.get(ctx.instance.id);let requestError='';let request;
    try{request=femRequest(ctx);}catch(e){requestError=e.message;}
    const stale=r&&JSON.stringify(request)!==JSON.stringify(r.snapshot),current=stale?null:r;
    const job=stale&&job0?.status==='done'?{...job0,message:'参数已修改，原结果已失效，请重新计算。'}:job0;
    const layered=i.analysisKind==='layered';
    const form=select('计算模型','input.analysisKind',i.analysisKind||'solid',[['solid','三维实体（通用连接面）'],['layered','分层壳（复现第二份计算书）']])+select('材料自重与地震来源','input.loadId',i.loadId||'',[['','本模块独立输入'],...ctx.project.modules.filter(m=>m.type==='loads').map(m=>[m.id,m.name])])+field(layered?'壳网格尺寸（0=原断点分格）':'水平网格控制尺寸','input.mesh_mm',i.mesh_mm,'mm')+field('Y 向加速度（独立输入）','input.project.loads.y_acceleration',p.loads.y_acceleration,'mm/s²')+field('X 向加速度','input.project.loads.x_acceleration',p.loads.x_acceleration,'mm/s²')+field('重力加速度 g（独立输入）','input.project.loads.g',p.loads.g,'mm/s²');
    const axes=`<label class="field"><span>板宽断点 X / mm</span><input data-path="input.project.geometry.x_breaks" data-array value="${esc(p.geometry.x_breaks.join(', '))}"></label><label class="field"><span>板高断点 Z / mm</span><input data-path="input.project.geometry.z_breaks" data-array value="${esc(p.geometry.z_breaks.join(', '))}"></label>`;
    const layers=`<div class="table-scroll"><table class="compact"><thead><tr><th>层名</th><th>厚 / mm</th><th>材料</th><th></th></tr></thead><tbody>${p.layers.map((l,n)=>`<tr><td>${rowInput(`input.project.layers.${n}.name`,l.name,'text')}</td><td>${rowInput(`input.project.layers.${n}.thickness`,l.thickness)}</td><td><select aria-label="层材料" data-path="input.project.layers.${n}.material">${Object.keys(p.materials).map(k=>`<option ${l.material===k?'selected':''}>${esc(k)}</option>`).join('')}</select></td><td><button data-action="module:remove-layer" data-index="${n}">×</button></td></tr>`).join('')}</tbody></table></div><button data-action="module:add-layer">＋ 添加层</button>`;
    const supports=`<div class="table-scroll"><table class="compact"><thead><tr><th>编号</th><th>X / mm</th><th>Y / mm</th><th>Z / mm</th><th>约束</th><th></th></tr></thead><tbody>${p.supports.map((s,n)=>`<tr><td>${rowInput(`input.project.supports.${n}.sap_joint`,s.sap_joint,'text')}</td><td>${rowInput(`input.project.supports.${n}.x`,s.x)}</td><td>${rowInput(`input.project.supports.${n}.y`,displayY(request?.project||p,s)).replace('<input ',`<input ${s.surface&&s.surface!=='custom'?'readonly title="随连接面同步，在预览属性中切换为自定义后修改"':''} `)}</td><td>${rowInput(`input.project.supports.${n}.z`,s.z)}</td><td><input aria-label="支点${n+1}约束" data-array data-path="input.project.supports.${n}.dofs" value="${esc(s.dofs.join(','))}"></td><td><button data-action="module:remove-support" data-index="${n}">×</button></td></tr>`).join('')}</tbody></table></div><button data-action="module:add-support">＋ 添加挂点</button><p class="hint">约束编号 1 = X、2 = Y、3 = Z；逗号分隔。Y 为实际厚度坐标；未设置时沿用 Y=0。连接面在预览属性中选择。当前按矩形板计算，断点用于划分网格，不能用于定义孔洞。</p>`;
    const isBusy=job&&['queued','running'].includes(job.status);
    const input=panel('几何与荷载',`<div class="panel-body">${formSection('荷载与引用',form)}${formSection('平面几何',axes)}<p class="hint">N、mm、s、MPa；板面为 XZ，层厚沿 +Y 叠放。自重沿 -Z，惯性荷载分别沿 -Y、-X。材料轴 1=-X、2=Z、3=Y。</p></div>`)+panel('材料层',`<div class="panel-body">${layers}<details class="advanced-settings" data-ui-key="fem-materials"><summary>材料参数 JSON · 高级设置</summary><p class="hint">E、G 为 MPa；mass_density 为 N·s²/mm⁴，weight_density 为 N/mm³。正交异性常数顺序：E1,E2,E3,ν12,ν13,ν23,G12,G13,G23。须保留 poisson_convention；CSI 输入由适配器按柔度等效转换。</p><textarea data-json data-path="input.project.materials" rows="16">${esc(JSON.stringify(p.materials,null,2))}</textarea></details></div>`)+panel('挂点与边界',`<div class="panel-body">${supports}</div>`);
    let output=(ctx.instance.exampleSnapshot&&r?.exampleSnapshot?`<p class="result-notice">${stale?'示例参数已修改，原结果已失效。':'当前显示第二份计算书已验证的示例结果快照。'}${services.solverBase?'可运行在线有限元重新计算。':'在线有限元服务待接入，暂不能重新求解。'}</p>`:'')+`<div class="fem-runbar"><button class="primary" data-action="module:run" ${isBusy||requestError||!services.solverBase?'disabled':''}>${isBusy?'正在计算…':'运行有限元分析'}</button><span class="fem-solver-caption">CalculiX · ${layered?'分层壳':'三维实体'}</span><div role="status" id="fem-progress">${esc(requestError||job?.message||(stale?'参数已修改，请重新计算。':current?'当前参数已计算':''))}</div></div>`;
    if(current&&layered){output+=layeredResults(current,ctx.instance.view);}
    if(current&&!layered){
      const uls=current.summary.find(s=>s.case==='ULS'),balance=Math.max(...current.summary.flatMap(s=>s.balance_residual_N.map(Math.abs)));
      output+=panel('彩色结果云图',controls(current,ctx.instance.view)+contour(current,ctx.instance.view));
      output+=panel('实体积分点强度取值',table(['工况','层','最大主拉应力','三维Mises','|τ13|','|τ23|','横剪合值'],layerPeakRows(current))+`<p class="hint">MPa；各列可由不同积分点控制，合值在同一积分点计算。不是分层壳S23Avg。</p>`+`<details class="advanced-settings"><summary>峰值单元、积分点与坐标</summary>${table(['工况','层','量','MPa','控制位置','XYZ / mm'],peakOrigins(current))}</details>`);
      output+=panel('当前参数计算结果',metrics([['ULS 最大 |UY|',uls.max_abs_uy_mm,'mm'],['最大平衡残差',balance,'N'],['实体单元',current.elements,'个'],['节点',current.nodes,'个']])+table(['工况','参考面 max |UY| / mm','ΣRx / N','ΣRy / N','ΣRz / N'],current.summary.map(s=>[s.case,fmt(s.max_abs_uy_mm,7),...s.resultant_N.map(v=>fmt(v,5))]))+`<div class="result-heading">ULS 各层局部轴积分点最大绝对分量 / MPa · 各分量峰值可能位于不同位置</div>`+table(['层','|σ11|','|σ22|','|σ33|','|τ12|','|τ13|','|τ23|'],uls.layers.map(l=>[l.layer,...l.max_abs_components_MPa.map(v=>fmt(v,5))]))+`<div class="status-line">${esc(current.basis)}<br>当前参数独立重算；既有 SAP 对照验证不代表新参数已经复核。</div>${services.solverBase?`<div class="links"><a href="${esc(serviceURL('solver',`/runs/${current.job_id}/input.json`))}" download>输入快照</a><a href="${esc(serviceURL('solver',`/runs/${current.job_id}/summary.json`))}" download>完整结果</a><a href="${esc(serviceURL('solver',`/runs/${current.job_id}/EQ_Y/panel.inp`))}" download>模型 INP</a><a href="${esc(serviceURL('solver',`/runs/${current.job_id}/EQ_Y/panel.dat`))}" download>原始 DAT</a><a href="${esc(serviceURL('solver',`/runs/${current.job_id}/EQ_Y/solver.log`))}" download>求解日志</a></div>`:current.exampleSnapshot?'<div class="links"><a href="examples/second-book-original-1.json" download>下载示例与结果快照</a></div>':''}`);
    }
    const loadNotice=i.loadId?`<p class="fem-load-reference">已引用基础荷载，同步层厚、自重与 Y 向地震荷载；独立输入值保留备用。${request?`实际 g=${fmt(request.project.loads.g)} mm/s²，aY=${fmt(request.project.loads.y_acceleration)} mm/s²。`:''}</p>`:'';
    let preview;try{preview=renderFemEditor({...ctx,effectiveProject:request?.project,requestError});}catch(e){preview=panel('模型预览',`<p class="error">${esc(e.message)}。请先检查荷载来源或在下方修正挂点 Y。</p>`);}
    return preview+`<div class="editor-grid fem-analysis-layout"><div><details open class="fem-precise-settings" data-ui-key="fem-precise"><summary>模型参数</summary>${loadNotice}<div class="fem-parameter-grid">${input}</div></details></div><div class="fem-analysis-output">${output}</div></div>`;
  },
  action(ctx,action,n){const p=ctx.instance.input.project;if(action==='add-layer')p.layers.push({name:`layer_${crypto.randomUUID().slice(0,8)}`,thickness:1,material:Object.keys(p.materials)[0]});if(action==='remove-layer'&&p.layers.length>1){if(p.supports.some(s=>s.surface==='after:'+p.layers[n].name))throw Error('该层连接面仍有挂点，请先修改挂点连接面');p.layers.splice(n,1);}if(action==='add-support')p.supports.push({sap_joint:`P${crypto.randomUUID().slice(0,8)}`,x:p.geometry.x_breaks[0],z:p.geometry.z_breaks[0],dofs:[2]});if(action==='remove-support')p.supports.splice(n,1);},
  report(ctx){const r=ctx.result;let request;try{request=femRequest(ctx);}catch(e){return `<p>${esc(e.message)}</p>`;}if(r?.postprocess==='layered-shell-v1'&&JSON.stringify(r.snapshot)===JSON.stringify(request))return layeredReport(r);
   if(!r||r.postprocess!=='solid-ip-v2'||JSON.stringify(r.snapshot)!==JSON.stringify(request))return '<p>当前参数尚未得到匹配的CalculiX实体结果，未生成计算结论。</p>';
   const p=request.project;let body=`<p>CalculiX 2.23 / V2 C3D8I已验证实体核心。${esc(r.basis)} 不调用SAP2000。坐标：板面XZ，厚度+Y；材料轴1=-X、2=Z、3=Y。</p>`+table(['层名','材料','厚度 / mm'],p.layers.map(l=>[l.name,l.material,l.thickness]))+table(['材料','参数','采用值','单位'],materialRows(p))+table(['支点','X / mm','Y / mm','Z / mm','固定平移'],p.supports.map(s=>[s.sap_joint,s.x,supportY(p,s),s.z,s.dofs.join(', ')]))+table(['工况','组合系数','参考面max|UY| / mm','全节点max|UY| / mm','平衡残差 / N'],r.summary.map(s=>[s.case,combinationText(s.factors),fmt(s.max_abs_uy_mm,7),fmt(s.max_abs_uy_all_mm,7),fmt(Math.max(...s.balance_residual_N.map(Math.abs)),8)]))+table(['工况','层','最大主拉应力 / MPa','三维Mises / MPa','|τ13| / MPa','|τ23| / MPa','横剪合值 / MPa'],layerPeakRows(r))+table(['工况','层','量','峰值 / MPa','控制位置','XYZ / mm'],peakOrigins(r,false));
   for(let il=0;il<p.layers.length;il++)body+=contour(r,{case:'ULS',layer:String(il),quantity:p.layers[il].material==='STEEL'?'mises3':p.layers[il].material==='CORE'?'shear_transverse':'principal3',mesh:'off'});
   body+=contour(r,{case:'SLS',quantity:'uy'});
   return body+`<p>算例 ${esc(r.job_id)}；输入哈希 ${esc(r.input_hash)}；结果版本solid-ip-v2。图为单元平均展示，验算取原始积分点峰值。原V2验证证明同口径实体求解一致，不表示实体结果等同于原书分层壳。</p>`;
  }
};
