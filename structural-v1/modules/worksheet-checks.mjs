import {esc,fmt,field,select,panel,table,formSection,advanced,checkCards} from '../ui.mjs?calculix-checks=19';
import {currentSolid} from './fem.mjs?calculix-checks=19';
const specifications={
 panel_strength:{title:'各层材料强度',symbol:'σ',description:'引用CalculiX正负组合的控制应力，按实体或分层壳口径验算各材料层。',solid:true,params:[['石材抗弯设计值','fStone',1.94,'MPa'],['钢板设计值','fSteel',205,'MPa'],['芯层剪切设计值','fCore',.4,'MPa']]},
 panel_deflection:{title:'复合板挠度',symbol:'δ',description:'取正常使用正负地震工况的法向位移绝对最大值。',solid:true,params:[['计算宽度','width',1300,'mm'],['限值分母','ratio',120,'']]},
 rivet:{title:'抽芯铆钉群',symbol:'●',description:'逐工况、逐支点以同一组拉剪力计算，取拉剪组合最大值。',solid:true,params:[['铆钉数','n',3,''],['公称直径','d',3.2,'mm'],['薄构件厚度','t',.4,'mm'],['厚构件厚度','thick',2.5,'mm'],['钢板设计值','f',205,'MPa'],['群钉折减','eta',.8,'']]},
 hanger:{title:'挂件局部剪切',symbol:'∟',description:'引用各挂点竖向反力，验算接触截面局部剪应力。',solid:true,params:[['挂件厚度','t',2.5,'mm'],['有效接触高度','h',7.5,'mm'],['抗剪设计值','fv',120,'MPa']]},
 bonding:{title:'粘结检测要求',symbol:'◇',description:'记录剥离和平拉检测报告，按原计算书所列指标比较。',params:[['剥离要求值','peelLimit',40,'N·mm/mm'],['平拉要求值','pullLimit',.6,'MPa'],['剥离实测值（0为未提供）','peel',0,'N·mm/mm'],['平拉实测值（0为未提供）','pull',0,'MPa']]},
 column_strength:{title:'立柱强度',symbol:'Ⅰ',description:'引用立柱梁分析和截面，轴力按分格宽度与立柱计算高度计。',column:true,params:[['分格宽度','B',1300,'mm'],['立柱荷载计算高度','H',3000,'mm'],['静矩 S','S',660.1,'mm³'],['腹板厚度','t',1.5,'mm'],['发展系数','gamma',1.05,''],['正应力设计值','f',205,'MPa'],['剪应力设计值','fv',120,'MPa']]},
 column_deflection:{title:'立柱挠度',symbol:'⌒',description:'单独引用正常使用地震荷载梁模型，比较全跨最大挠度。',column:true,params:[['挠度计算长度','H',3000,'mm'],['限值分母','ratio',250,'']]}
};
const uls=r=>r.summary.filter(s=>['ULS','ULS_MINUS'].includes(s.case));
const sls=r=>r.summary.filter(s=>['SLS','SLS_MINUS'].includes(s.case));
export function worksheetCheck(type,i,refs){
 const rows=[],details=[];let pass=true,pending=false;const add=(name,formula,value,limit,unit,origin)=>{if(!Number.isFinite(value)||!(limit>0))throw Error('验算结果或限值无效');const ok=value<=limit;pass&&=ok;rows.push({name,formula,value,limit,unit,pass:ok,origin});};
 if(['panel_strength','panel_deflection','rivet','hanger'].includes(type)){
  const r=refs.solid;if(!r||!['solid-ip-v2','layered-shell-v1'].includes(r.postprocess))throw Error('当前验算须引用匹配的V2 CalculiX实体积分点结果；旧壳或冻结参考不用于验算');
  if(!uls(r).length||!sls(r).length)throw Error('实体正负荷载组合尚未完整计算');
  if(type==='panel_strength'){
   const shell=r.postprocess==='layered-shell-v1',names={MARBLE:'石材',STEEL:'钢板',CORE:'蜂窝芯'};
   for(const layer of r.snapshot.project.layers){
    if(!(layer.material in names))throw Error('材料 '+layer.material+' 未指定验算类型，不能自动判定通过');
    const specs=shell?(layer.material==='MARBLE'?[['面内最大主拉应力','principal_plane',i.fStone]]:layer.material==='STEEL'?[['面内Mises应力','mises_plane',i.fSteel]]:[['层平均剪应力 |τ13|','t13_avg',i.fCore],['层平均剪应力 |τ23|','t23_avg',i.fCore],['同点层平均横剪合值','shear_avg',i.fCore]]):layer.material==='MARBLE'?[['三维最大主拉应力','principal3',i.fStone]]:layer.material==='STEEL'?[['三维Mises应力','mises3',i.fSteel]]:[['横向剪应力 |τ13|','t13',i.fCore],['横向剪应力 |τ23|','t23',i.fCore],['同积分点横剪合值','shear_transverse',i.fCore]];
    for(const [name,key,limit] of specs){
     const values=uls(r).map(c=>{const l=c.layers.find(l=>l.layer===layer.name),p=l?.peaks?.[key];if(!p)throw Error('实体峰值缺失，请重新计算');return {...p,case:c.case};}),v=values.reduce((a,b)=>a.value>b.value?a:b);
     add(`${names[layer.material]} ${layer.name} · ${name}`,`${['shear_transverse','shear_avg'].includes(key)?'sqrt(τ13²+τ23²)':key==='principal_plane'?'max(SMax,0)':key==='mises_plane'?'SVM':key==='principal3'?'max(σ1,3D,0)':key==='mises3'?'σVM,3D':key} ≤ f`,v.value,limit,'MPa',`${v.case} / ${layer.name} / 单元${v.element} / GP${v.gp} / XYZ=(${v.xyz_mm.map(v=>fmt(v,3)).join(', ')}) mm`);
    }
   }
  }else if(type==='panel_deflection'){const c=sls(r).reduce((a,b)=>a.max_abs_uy_all_mm>b.max_abs_uy_all_mm?a:b),p=c.displacement_all_peak;add(r.postprocess==='layered-shell-v1'?'分层壳参考面法向最大位移':'实体全节点法向最大位移',`max|UY| ≤ B/${i.ratio}`,c.max_abs_uy_all_mm,i.width/i.ratio,'mm',`${c.case} / 节点${p?.node} / XYZ=(${p?.xyz_mm.map(v=>fmt(v,3)).join(', ')}) mm`);}
  else if(type==='rivet'){
   if(!Number.isInteger(i.n)||i.n<1||i.eta>1)throw Error('铆钉数量或折减系数无效');const nv=2.4*i.d*i.t*i.f*i.eta,nt=1.5*i.d*i.t*i.f*i.eta;
   for(const s of uls(r))for(const[id,v]of Object.entries(s.reactions_N)){const N=Math.abs(v[1]),V=Math.abs(v[2]),util=V/i.n/nv+N/i.n/nt;details.push([s.case,id,N,V,util]);}
   const w=details.reduce((a,b)=>a[4]>b[4]?a:b);add('群钉拉剪组合','|V|/(n·2.4dtfη)+|N|/(n·1.5dtfη) ≤ 1',w[4],1,'',`${w[0]} / 支点${w[1]} / 同支点N=${fmt(w[2],6)} N、V=${fmt(w[3],6)} N`);
   if(i.thick/i.t<2.5){pending=true;pass=null;}
  }else {for(const s of uls(r))for(const[id,v]of Object.entries(s.reactions_N))details.push([s.case,id,Math.abs(v[1]),Math.abs(v[2]),Math.abs(v[2])/(i.t*i.h)]);const w=details.reduce((a,b)=>a[4]>b[4]?a:b);add('挂件剪应力','|V|/(t·h) ≤ fv',w[4],i.fv,'MPa',`${w[0]} / 支点${w[1]}`);}
 }else if(type==='bonding'){
  if(!i.reportNo.trim()||i.peel<=0||i.pull<=0){pending=true;pass=null;}else {add('滚筒剥离','要求值 ≤ 实测值',i.peelLimit,i.peel,'N·mm/mm',i.reportNo);add('平拉粘结','要求值 ≤ 实测值',i.pullLimit,i.pull,'MPa',i.reportNo);}
 }else if(type==='column_strength'){
  const l=refs.loads,b=refs.beam,s=refs.section;if(!l||!b||!s)throw Error('请引用荷载、设计荷载梁分析和截面');if(s.coupled||s.rects?.some(r=>Math.abs(r.E-s.E)>1e-6))throw Error('立柱单轴强度要求同材料主轴截面');
  const N=l.gd*i.B*i.H/1e6*1000,M=b.M*1e6,V=b.V*1000,W=Math.min(s.WxTop,s.WxBottom),S=Number.isFinite(s.Sx)?s.Sx:i.S;
  add('立柱组合正应力','N/A+|M|/(γW) ≤ f',N/s.A+Math.abs(M)/(i.gamma*W),i.f,'MPa',`N=Gd·B·H=${fmt(N,6)} N；M=${fmt(M,6)} N·mm`);
  add('立柱剪应力','|V|S/(It) ≤ fv',Math.abs(V)*S/(s.Ix*i.t),i.fv,'MPa',`V=${fmt(V,6)} N；S=${fmt(S,6)} mm³；Ix=${fmt(s.Ix,6)} mm⁴`);
 }else if(type==='column_deflection'){
  const b=refs.beam;if(!b)throw Error('请引用正常使用荷载梁分析');add('立柱全跨最大挠度',`max|u| ≤ H/${i.ratio}`,Math.abs(b.u),i.H/i.ratio,'mm','正常使用荷载梁分析');
 }
 return{rows,details,pass,pending,state:pending?'待补数据 / 核定':pass?'所列项目满足':'存在不满足项目'};
}
function dependencies(type,i){const s=specifications[type];return s.solid&&i.femId?[{id:i.femId,types:['fem']}]:s.column?[...(i.beamId?[{id:i.beamId,types:['beam']}]:[]),...(type==='column_strength'?[...(i.sectionId?[{id:i.sectionId,types:['section']}]:[]),...(i.loadId?[{id:i.loadId,types:['loads']}]:[])]:[])]:[];}
const output=(r,cards=false)=>`<div class="result-notice ${r.pending?'warning':r.pass?'success':'danger'}">${esc(r.state)}${r.pending?'：数据或适用条件尚待补充，当前不判为通过。':''}</div>`+(cards?checkCards(r.rows.map(v=>({...v,...(v.formula==='要求值 ≤ 实测值'?{valueLabel:'要求值',limitLabel:'实测值'}:{})}))):table(['项目','公式','结果','限值','单位','判断'],r.rows.map(v=>[v.name,v.formula,fmt(v.value,8),fmt(v.limit,8),v.unit,v.pass?'满足':'不满足'])))+(r.rows.length?`<div class="result-precision">${advanced('控制点与取值来源',r.rows.map(v=>`<p class="hint">${esc(v.name)}：${esc(v.origin)}</p>`).join(''),'check-origins')}</div>`:'');
export const worksheetModules=Object.entries(specifications).map(([type,s])=>({type,version:1,title:s.title,symbol:s.symbol,description:s.description,
 create:()=>({...Object.fromEntries(s.params.map(([,k,v])=>[k,v])),...(s.solid?{femId:''}:{}),...(s.column?{beamId:'',sectionId:'',loadId:''}:{}),...(type==='bonding'?{reportNo:''}:{})}),
 validate:i=>{if(!i||s.params.some(([,k])=>typeof i[k]!=='number'||!Number.isFinite(i[k])||i[k]<0))throw Error('验算参数格式无效');},dependencies:i=>dependencies(type,i),
 calculate(ctx){const i=ctx.instance.input,refs={};if(s.solid){if(!i.femId)throw Error('请选择CalculiX实体来源');refs.solid=currentSolid(ctx,i.femId);}if(s.column){if(i.beamId)refs.beam=ctx.getResult(i.beamId);if(type==='column_strength'){if(i.sectionId)refs.section=ctx.getResult(i.sectionId);if(i.loadId)refs.loads=ctx.getResult(i.loadId);}}return worksheetCheck(type,i,refs);},
 render(ctx){const i=ctx.instance.input,r=ctx.result;const refs=(label,k,t)=>select(label,'input.'+k,i[k]||'',[['','请选择'],...ctx.project.modules.filter(m=>m.type===t).map(m=>[m.id,m.name])]);const params=s.params.map(([label,k,v,u])=>field(label,'input.'+k,i[k],u)).join('')+(type==='bonding'?field('检测报告编号','input.reportNo',i.reportNo,'','text'):'');let source='';if(s.solid)source=refs('CalculiX有限元结果来源','femId','fem');if(s.column)source=refs('梁分析来源','beamId','beam')+(type==='column_strength'?refs('截面来源','sectionId','section')+refs('荷载来源','loadId','loads'):'');const form=(source?formSection('结果引用',source):'')+formSection(type==='bonding'?'检测要求与实测数据':'验算参数与限值',params);return `<div class="editor-grid"><div>${panel(s.title+'输入',`<div class="panel-body">${form}<p class="hint">限值初值参考第二份计算书，由输入明确给定。根据来源分别采用实体积分点三维应力，或分层壳面内应力及层平均横剪值；控制位置随结果保存。${type==='bonding'?'原文所列JG/T328—2011：内装剥离≥40、平拉≥0.6；检测缺失不自动通过。':''}${type==='rivet'?'按原文均分模型和给定η计算，不含偏心铆钉群弯矩；厚薄比小于2.5时需要另行核定。':''}${type==='column_strength'?'该模块不包含构件整体稳定、局部屈曲或连接承载力。':''}</p></div>`)}</div><div>${r?panel('验算过程与结论',output(r,true)+(r.details.length?advanced('各工况支点明细',table(['工况','支点','同点N / N','同点V / N','利用率 / 应力'],r.details.map(a=>a.map(v=>typeof v==='number'?fmt(v,8):v))),'support-details'):'')):ctx.errorHtml}</div></div>`;},
 report:ctx=>ctx.result?`<p>${esc(s.description)}</p>`+output(ctx.result)+(type==='bonding'&&ctx.result.pending?'<p>未提供完整检测编号与实测值，本节待补充；有限元不能代替粘结检测。</p>':''):ctx.errorHtml
}));
