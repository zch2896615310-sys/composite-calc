import {serviceURL} from './public-runtime.mjs';
import {esc,fmt,panel,table,metrics} from './ui.mjs?calculix-checks=19';
import {shellControls,shellContour} from './shell-contour.mjs';
const columns=['S11','S22','S12','SMax','SMin','SVM','S13Avg','S23Avg','SMaxAvg'];
export function layeredView(r,v={}){return {...v,case:r.summary.some(s=>s.case===v.case)?v.case:'ULS',layer:r.layers.LayerName.includes(v.layer)?v.layer:r.layers.LayerName[0],quantity:[...columns,'UY'].includes(v.quantity)?v.quantity:'SMax',ip:['1','2'].includes(v.ip)?v.ip:'1'};}
export function layerDisplay(r,view={}){
 const v=layeredView(r,view),layer=r.layer_matrices.find(l=>l.name===v.layer),fac=r.summary.find(s=>s.case===v.case).factors;
 const y=(layer.y0+layer.y1)/2+(v.ip==='1'?-1:1)*(layer.y1-layer.y0)/2/Math.sqrt(3),rows=[],displacements={};
 for(const node of Object.keys(r.basic_displacements.DEAD))displacements[node]=Object.entries(fac).reduce((sum,[c,k])=>sum+k*r.basic_displacements[c][node],0);
 for(let ei=0;ei<r.elements;ei++)for(let corner=0;corner<4;corner++){
  const state=Array.from({length:8},(_,j)=>Object.entries(fac).reduce((sum,[c,k])=>sum+k*r.basic_states[c][ei][corner][j],0));
  const strain=state.slice(0,3).map((a,j)=>a+y*state[j+3]),[a,b,c]=layer.Q.map(row=>row.reduce((sum,q,j)=>sum+q*strain[j],0)),d=layer.G[0]*state[6],e=layer.G[1]*state[7],rad=Math.hypot((a-b)/2,c),node=r.shell_elements[String(ei+1)][[0,1,3,2][corner]];
  rows.push([String(ei+1),node,a,b,c,(a+b)/2+rad,(a+b)/2-rad,Math.sqrt(Math.max(0,a*a-a*b+b*b+3*c*c)),d,e,Math.hypot(d,e)]);
 }
 return {...r,elements:r.shell_elements,columns,fields:{[v.case]:{[v.layer]:{[v.ip]:rows}}},displacements:{[v.case]:displacements}};
}
const names={principal_plane:'面内最大主拉应力',mises_plane:'面内Mises',t13_avg:'层平均 |τ13|',t23_avg:'层平均 |τ23|',shear_avg:'同点层平均横剪合值'};
function peaks(r){return r.summary.filter(s=>['ULS','ULS_MINUS'].includes(s.case)).flatMap(s=>s.layers.flatMap(l=>Object.entries(l.peaks).map(([k,p])=>[s.case,l.layer,names[k],fmt(p.value,9),`E${p.element} / 角点${p.corner} / IP${p.ip}`,p.xyz_mm.map(x=>fmt(x,4)).join(', ')])));}
export function layeredResults(r,v={}){
 v=layeredView(r,v);const display=layerDisplay(r,v);
 return panel('分层壳彩色云图',shellControls(display,v)+shellContour(display,v))+panel('各层应力与控制位置',table(['工况','层','取值','MPa','控制位置','XYZ / mm'],peaks(r))+`<p class="hint">面内应力为各层厚度高斯位置的单元独立角点值；横向剪应力为层平均值。云图平滑不改变峰值。</p>`)+panel('分层壳计算结果',metrics([['壳单元',r.elements,'个'],['参考面节点',r.nodes,'个'],['ULS 最大 |UY|',r.summary.find(s=>s.case==='ULS').max_abs_uy_mm,'mm'],['最大反力平衡残差',Math.max(...r.summary.flatMap(s=>s.balance_residual_N.map(Math.abs))),'N']])+table(['工况','max |UY| / mm','ΣRx / N','ΣRy / N','ΣRz / N'],r.summary.map(s=>[s.case,fmt(s.max_abs_uy_mm,9),...s.resultant_N.map(x=>fmt(x,7))]))+`<p class="hint">${esc(r.basis)} 自编投影分层壳通过CalculiX矩阵接口求解，不是原生S4单元；不读取SAP结果。</p><div class="links"><a href="${esc(serviceURL('solver',`/runs/${r.job_id}/input.json`))}" download>输入快照</a><a href="${esc(serviceURL('solver',`/runs/${r.job_id}/summary.json`))}" download>完整结果</a><a href="${esc(serviceURL('solver',`/runs/${r.job_id}/EQ_Y/panel.inp`))}" download>CalculiX输入</a><a href="${esc(serviceURL('solver',`/runs/${r.job_id}/EQ_Y/precision_refinement.json`))}" download>数值精度记录</a></div>`);
}
export function layeredReport(r){
 const p=r.snapshot.project,materials=Object.entries(p.materials).flatMap(([name,m])=>[
  ...(m.engineering_constants?[['E1 / E2 / E3',m.engineering_constants.slice(0,3).join(' / '),'MPa'],['ν12 / ν13 / ν23',m.engineering_constants.slice(3,6).join(' / '),m.poisson_convention||''],['G12 / G13 / G23',m.engineering_constants.slice(6).join(' / '),'MPa']]:[['E',m.E,'MPa'],['ν',m.nu,'']]),['质量密度',m.mass_density,'N·s²/mm⁴'],['重量密度',m.weight_density,'N/mm³']].map(a=>[name,...a]));
 let h=`<p>${esc(r.formulation)}。${esc(r.basis)} 工程输入不含SAP位移、转角或刚度矩阵。板面XZ，厚度沿+Y，参考面Y=0；材料轴1=−X、2=Z、3=Y。自编投影分层壳由CalculiX矩阵接口独立求解。</p>`+table(['材料层','材料','厚度 / mm'],p.layers.map(l=>[l.name,l.material,l.thickness]))+table(['材料','参数','采用值','单位 / 约定'],materials)+table(['挂点','X / mm','Y / mm','Z / mm','约束平移'],p.supports.map(s=>[s.sap_joint,s.x,s.y||0,s.z,s.dofs.join(', ')]))+table(['工况','组合','max |UY| / mm'],r.summary.map(s=>[s.case,JSON.stringify(s.factors),fmt(s.max_abs_uy_mm,9)]))+`<p>面内应力取各层两点高斯厚度位置、单元独立角点值；τ13、τ23 为层平均横向剪应力。强度验算取正负组合控制峰值。以下云图明确显示ULS / IP1，未用云图平均值替代验算峰值。</p>`+table(['工况','层','应力','MPa','控制位置','XYZ / mm'],peaks(r));
 for(const l of p.layers){const quantity=l.material==='STEEL'?'SVM':l.material==='CORE'?'S23Avg':'SMax',v={case:'ULS',layer:l.name,quantity,ip:'1',average:'none'};h+=shellContour(layerDisplay(r,v),v);}
 const view={case:'SLS',quantity:'UY',layer:p.layers[0].name,ip:'1'};h+=shellContour(layerDisplay(r,view),view);
 h+=table(['工况','挂点','Rx / N','Ry / N','Rz / N'],r.summary.filter(s=>['ULS','ULS_MINUS'].includes(s.case)).flatMap(s=>Object.entries(s.reactions_N).map(([id,v])=>[s.case,id,...v.map(x=>fmt(x,9))])));
 return h+`<p>算例 ${esc(r.job_id)}；输入哈希 ${esc(r.input_hash)}。18格和50 mm对照通过仅对应已验证的原参数，变更参数后的结果由本机独立计算。</p>`;
}
