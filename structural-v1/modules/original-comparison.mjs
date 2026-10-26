import {currentSolid} from './fem.mjs?calculix-checks=19';
import {esc,fmt,panel,table} from '../ui.mjs?calculix-checks=19';

export function originalComparison(ctx){
 const i=ctx.instance.input,l=ctx.getResult(i.loadId),b=ctx.getResult(i.beamId),bs=ctx.getResult(i.serviceBeamId),r=currentSolid(ctx,i.femId);
 const c=r.summary.find(s=>s.case==='ULS'),s=r.summary.find(s=>s.case==='SLS');
 const peak=(material,key)=>Math.max(...c.layers.filter(l=>l.material===material).map(l=>l.peaks[key].value));
 const original={gk:.2308038775,rivetPrinted:.391,...i.original},N=original.gk*1.3*1.3*3*1000;
 const sigma=N/original.A+original.M*1e6/(1.05*original.W),tau=original.V*1000*original.S/(original.I*1.5);
 const rivet=(original.hangerV/(3*2.4*3.2*.4*205*.8)+original.hangerN/(3*1.5*3.2*.4*205*.8));
 const rows=[
  ['Y向地震加速度',1,r.snapshot.project.loads.y_acceleration,'mm/s²','原模型独立输入'],
  ['原平面网格',18,r.elements,'个','原断点，不加密'],
  ['石材最大主拉应力',original.stone,peak('MARBLE','principal_plane'),'MPa','ULS正号；与原书相同工况'],
  ['双面钢板最大面内Mises',original.steel,peak('STEEL','mises_plane'),'MPa','ULS正号；两层取大值'],
  ['芯层 |S23Avg|',original.core,peak('CORE','t23_avg'),'MPa','ULS正号；原书采用的分量'],
  ['支点最大竖向反力',original.hangerV,Math.max(...Object.values(c.reactions_N).map(v=>Math.abs(v[2]))),'N','ULS正号'],
  ['立柱最大弯矩',original.M,b.M,'kN·m','原文录入值 / 按原3m简支模型重算'],
  ['立柱最大剪力',original.V,b.V,'kN','原文录入值 / 按原3m简支模型重算'],
  ['立柱挠度',original.columnU,bs.u,'mm','原文录入值 / 标准荷载重算']
 ];
 const positive=Math.max(...Object.keys(r.basic_displacements.DEAD).map(k=>Object.entries(s.factors).reduce((sum,[c,f])=>sum+r.basic_displacements[c][k]*f,0)));
 rows.splice(6,0,['板挠度（原截图正向最大值）',original.panelU,positive,'mm','SLS；正向最大值，非绝对包络'],['板挠度（全板绝对最大值）',null,s.max_abs_uy_all_mm,'mm','SLS；保留负向控制点']);
 return{state:'原值保留，差异逐项列出',rows,sourceRows:[
  ['原书立柱轴力','Gd × 1.3 × 3',N,'N'],
  ['原书立柱组合正应力','N/189.2 + 200000/(1.05×904.09)',sigma,'MPa'],
  ['原书立柱剪应力','300×660.1/(14711.1×1.5)',tau,'MPa'],
  ['原书铆钉拉剪利用率','576.13/(3Nv) + 5.67/(3Nt)',rivet,''],
  ['原书挂件剪应力','576.13/(2.5×7.5)',original.hangerV/(2.5*7.5),'MPa'],
  ['原书立柱挠度','原文手工录入',original.columnU,'mm'],
  ['原书挂件拉力N1','原文手工录入',original.hangerN,'N'],
  ['原书挂件拉力N2','原文手工录入',original.hangerN2,'N'],
  ['原书铆钉利用率配文','原文配文（与上方原式复算值分别保留）',original.rivetPrinted,'']
 ]};
}
function body(ctx){
 if(!ctx.result)return ctx.errorHtml;
 const i=ctx.instance.input,r=ctx.result,number=n=>n===null?'原书未单列':fmt(n,10);
 return `<p>本页保留第二份原书的手工数值并复核其算术；当前分析模块使用实际重算结果。原书的板位移按截图正向最大值对照，材料强度页另外保留正负组合包络。</p>`+table(['项目','原文件','网页复算','单位','取值说明'],r.rows.map(([n,a,b,u,t])=>[n,number(a),number(b),u,t]))+
 `<h3>原文输入值的公式复核</h3>`+table(['项目','原式代入','结果','单位'],r.sourceRows.map(([n,f,v,u])=>[n,f,number(v),u]))+
 `<p>原书立柱正应力 ${number(r.sourceRows[1][2])} MPa，大于205 MPa，原文“不满足”保留。原书挠度0.5 mm是录入值；梁模块按原图3m简支、原荷载和截面独立计算，不改模型来凑0.5 mm。</p>`+
 `<p>原文：Gk=${number(i.original.gk??.2308038775)} kN/m²，g=10 m/s²；SAP模型：面自重0.23465 kN/m²，g=9806.65 mm/s²。沿用两处原输入，有限元不引用基础荷载来覆盖材料密度或加速度。</p>`+
 `<p>原文正文竖龙骨3110 mm，公式及简图3000 mm；两处表述均保留，梁按原公式3000 mm计算。原文“6+12”名称与实际6/0.4/11/0.4 mm层厚同时保留。粘结检测未提供实测值时仍待补。</p>`+
 `<p>原始文件：${esc(i.source)}；SHA-256：${esc(i.sourceSha256)}。原文件只读，本项目另存。</p>`;
}
export default {type:'original_comparison',version:1,title:'原文件逐项对照',symbol:'≡',description:'保留原文手工值，与相同输入的网页复算逐项比较。',
 create:()=>({}),validate:i=>{if(!i?.original||!i.sourceSha256)throw Error('原文件对照来源缺失');},
 dependencies:i=>[{id:i.loadId,types:['loads']},{id:i.femId,types:['fem']},{id:i.beamId,types:['beam']},{id:i.serviceBeamId,types:['beam']}],
 calculate:originalComparison,render:ctx=>panel('第二份计算书原值对照',body(ctx)),report:body};
