import {positive,finite} from '../engines/section.mjs';
import {esc,fmt,field,select,panel,table,metrics,formSection,advanced,loadSteps,loadFormulaRows} from '../ui.mjs?calculix-checks=19';
const compositeKeys=['tCore','tSteel','foil','cell','psi','coreMode','gammaSteel','mode','adopted'];
export const materialKind=i=>i.materialKind||'composite';
export function loadReportInput(i){if(materialKind(i)!=='stone'&&!['accelerationInput','seismicMode'].some(k=>k in i))return i;const omitted=['accelerationInput','seismicMode',...(materialKind(i)==='stone'?['tCore','tSteel','foil','cell','psi','coreMode','gammaSteel','compositeBackup']:[])];return Object.fromEntries(Object.entries(i).filter(([k])=>!omitted.includes(k)));}
export function changeMaterialKind(i,kind){
 if(!['stone','composite'].includes(kind))throw Error('材料构成无效');
 if(kind===materialKind(i))return;
 if(kind==='stone'){
  i.compositeBackup=Object.fromEntries(compositeKeys.filter(k=>i[k]!==undefined).map(k=>[k,i[k]]));
  i.tCore=0;i.tSteel=0;i.mode='exact';
 }else if(i.compositeBackup){
  for(const k of compositeKeys)if(k in i.compositeBackup)i[k]=i.compositeBackup[k];
  delete i.compositeBackup;
 }
 i.materialKind=kind;
}
export function loads(i){
  if(!['stone','composite'].includes(materialKind(i)))throw Error('材料构成无效');
  if(materialKind(i)==='stone'&&(i.tCore!==0||i.tSteel!==0))throw Error('纯石材的蜂窝芯和钢板厚度须为0');
  for(const k of ['tStone','gammaStone','g','beta','width','height','tributary'])positive(i[k],k);
  for(const k of ['tCore','tSteel','foil','cell','psi','gammaSteel','alpha','additional'])if(finite(i[k],k)<0)throw Error('材料厚度、材料参数、地震系数及附加恒载不能为负');
  if(i.tCore>0)for(const k of ['foil','cell','psi'])positive(i[k],k);
  if(i.tSteel>0)positive(i.gammaSteel,'gammaSteel');
  for(const k of ['gammaG','gammaE','nHorizontal','nVertical'])positive(i[k],k);
  if(!Number.isInteger(i.nHorizontal)||!Number.isInteger(i.nVertical))throw Error('承力挂点数量必须为整数');
  const coreMode=i.coreMode||'si';
  if(!['si','word-empirical'].includes(coreMode))throw Error('蜂窝芯自重口径无效');
  // psi in kg/m³ requires both mm -> m and N -> kN. The first Word
  // document instead defines an empirical coefficient with H entered in mm.
  // Preserve that explicitly selected formula without relabelling it kg/m³.
  const coreDensity=i.tCore>0?i.psi*i.foil/i.cell*(coreMode==='word-empirical'?1000:1):0;
  const coreGamma=coreDensity*i.g/1000;
  const stone=i.gammaStone*i.tStone/1000,core=coreGamma*i.tCore/1000,steel=2*i.gammaSteel*i.tSteel/1000;
  const exact=stone+core+steel+i.additional;
  // The standard surface load always uses the project coefficients and Gk.
  // Legacy accelerationInput stays in saved projects, without overriding this formula.
  const gk=i.mode==='adopted'?positive(i.adopted,'采用的面恒载'):exact,gd=i.gammaG*gk,qEk=i.beta*i.alpha*gk,qE=i.gammaE*qEk,area=i.width*i.height/1e6,qELine=qE*i.tributary/1000;
  const coreDivisor=coreMode==='word-empirical'?1000:1000000;
  return{stone,core,steel,exact,gk,gd,qEk,qE,area,coreMode,coreDensity,coreGamma,gkLine:gk*i.tributary/1000,gdLine:gd*i.tributary/1000,qEkLine:qEk*i.tributary/1000,qELine:qE*i.tributary/1000,N:gd*area,Nper:qE*area/i.nHorizontal,Vper:gd*area/i.nVertical,acceleration:i.beta*i.alpha*i.g*1000,
    formulas:[['石材恒载','Gstone,k = γstone × tstone / 1000',`${i.gammaStone} × ${i.tStone} / 1000 = ${fmt(stone,7)} kN/m²`],['蜂窝芯恒载',i.tCore===0?'Gcore,k = 0':`Gcore,k = ${coreMode==='word-empirical'?'Cword':'ψ'} × tfoil / a × tcore × g / ${coreDivisor}`,i.tCore===0?'无蜂窝芯层，面自重为 0 kN/m²':`${i.psi} × ${i.foil} / ${i.cell} × ${i.tCore} × ${i.g} / ${coreDivisor} = ${String(Number(core.toPrecision(10)))} kN/m²`],['两层钢板恒载','Gsteel,k = 2 × γsteel × tsteel / 1000',`${fmt(steel,7)} kN/m²`],['恒载采用值',i.mode==='adopted'?'Gk = Gk,adopted':'Gk = Gstone,k + Gcore,k + Gsteel,k + Gadd',`${i.mode==='adopted'?'采用人工设定值':'采用未舍入计算值'} ${fmt(gk,7)} kN/m²`],['恒载设计值','Gd = γG × Gk',`${i.gammaG} × ${fmt(gk,7)} = ${fmt(gd,7)} kN/m²`],['地震面荷载','qEk = βE × αmax × Gk; qE = γE × qEk',`${fmt(qEk,7)}; ${fmt(qE,7)} kN/m²`],['分格线荷载','qline = qarea × B / 1000',`${fmt(qELine,7)} kN/m`]]};
}
export default{type:'loads',version:1,title:'基础荷载',symbol:'↓',description:'材料自重、地震面荷载、分格线荷载与挂点分配，向其他模块传递。',
 create:()=>({materialKind:'composite',tStone:6,tCore:11,tSteel:.4,foil:.03,cell:4,psi:4.7,coreMode:'si',gammaStone:28,gammaSteel:78.5,g:10,beta:5,alpha:.08,gammaG:1.3,gammaE:1.4,additional:0,width:1300,height:2905,tributary:1300,nHorizontal:10,nVertical:2,mode:'exact',adopted:.24}),
 validate:i=>{if(!i||!['stone','composite'].includes(materialKind(i))||(materialKind(i)==='stone'&&(i.tCore!==0||i.tSteel!==0))||(i.coreMode!==undefined&&!['si','word-empirical'].includes(i.coreMode))||!['exact','adopted'].includes(i.mode)||!['tStone','tCore','tSteel','foil','cell','psi','g','beta','alpha','gammaG','gammaE','gammaStone','gammaSteel','additional','width','height','tributary','nHorizontal','nVertical','adopted'].every(k=>typeof i[k]==='number'))throw Error('基础荷载参数格式无效');if(i.compositeBackup){if(typeof i.compositeBackup!=='object'||Array.isArray(i.compositeBackup)||Object.entries(i.compositeBackup).some(([k,v])=>!compositeKeys.includes(k)||(k==='coreMode'?!['si','word-empirical'].includes(v):k==='mode'?!['exact','adopted'].includes(v):typeof v!=='number'||!Number.isFinite(v)||v<0)))throw Error('复合材料备用参数格式无效');}},changeInput(i,path,value){if(path!=='input.materialKind')return false;changeMaterialKind(i,value);return true;},calculate:ctx=>loads(ctx.instance.input),
 render(ctx){
  const i=ctx.instance.input,r=ctx.result,pure=materialKind(i)==='stone';
  const f=(label,key,unit='')=>field(label,'input.'+key,i[key],unit);

  const choice=select('材料构成','input.materialKind',materialKind(i),[['stone','纯石材'],['composite','复合材料']]);
  const coreMode=select('蜂窝芯自重口径','input.coreMode',i.coreMode||'si',[['si','标准单位计算（自动换算）'],['word-empirical','第一份Word经验式：芯高以mm代入']]);
  const material=formSection('材料与自重',choice+(pure?'':coreMode)+f('石材厚度','tStone','mm')+f('石材重度','gammaStone','kN/m³')+(pure?'':f('蜂窝芯厚度（0为无芯层）','tCore','mm')+f('单面钢板厚度（0为无钢板）','tSteel','mm')+f('钢板重度','gammaSteel','kN/m³'))+f('附加面恒载','additional','kN/m²'));
  const adoption=select('恒载取值方式','input.mode',i.mode,[['exact','不逐级舍入，采用计算值'],['adopted','人工指定采用值（如原 Word 0.24）']])+(i.mode==='adopted'?f('恒载采用值','adopted','kN/m²'):'');
  const core=pure?advanced('恒载取值',adoption,'core-settings'):advanced('蜂窝芯系数与自重取值',formSection('蜂窝芯参数',f('铝箔厚度','foil','mm')+f('芯格边长','cell','mm')+f(i.coreMode==='word-empirical'?'Word经验系数 Cword':'质量密度系数 ψ','psi',i.coreMode==='word-empirical'?'芯高以mm代入':'kg/m³'))+adoption,'core-settings');
  const factors=formSection('荷载系数',f('重力加速度','g','m/s²')+f('动力放大系数 βE','beta')+f('地震系数 αmax','alpha')+f('恒载分项系数 γG','gammaG')+f('地震分项系数 γE','gammaE'));
  const geometry=formSection('几何与挂点',f('面板宽度','width','mm')+f('面板高度','height','mm')+f('分格计算宽度 B','tributary','mm')+f('水平承力挂点数','nHorizontal','个')+f('竖向承重挂点数','nVertical','个'));
  return `<div class="editor-grid"><div>${panel('基础参数',`<div class="panel-body">${material}${core}${factors}${geometry}<p class="hint">系数按项目输入，未自动选择规范参数。挂点均分结果仅用于明确的均分模型。</p></div>`)}</div><div>${r?panel('荷载结果',metrics([['自重标准值 Gk',r.gk,'kN/m²'],['地震设计值 qE',r.qE,'kN/m²'],['水平线荷载',r.qELine,'kN/m'],['总重力设计值',r.N,'kN']])+loadSteps(r,{pure,input:i})+`<div class="status-line">均分模型单挂点：水平 ${fmt(r.Nper,6)} kN；竖向 ${fmt(r.Vper,6)} kN。有限元仍按实际支点约束计算。</div>`):ctx.errorHtml}</div></div>`;
 },
 report:ctx=>ctx.result?(materialKind(ctx.instance.input)==='stone'?`<p>材料构成：纯石材。石材重度、厚度及系数按本模块输入。恒载${ctx.instance.input.mode==='adopted'?'采用人工设定值':'采用未逐级舍入值'}。</p>`:`<p>材料构成：复合材料。蜂窝芯口径：${ctx.result.coreMode==='word-empirical'?'第一份Word经验式，芯高以mm代入，经验系数不具有kg/m³标签':'标准单位计算（自动换算），质量密度系数kg/m³，已同时换算mm→m及N→kN'}。材料重度、厚度及系数按本模块输入。恒载${ctx.instance.input.mode==='adopted'?'采用人工设定值':'采用未逐级舍入值'}。</p>`)+table(['计算项','公式','代入及结果'],loadFormulaRows(ctx.result,materialKind(ctx.instance.input)==='stone',ctx.instance.input).map(v=>v.row)):ctx.errorHtml};
