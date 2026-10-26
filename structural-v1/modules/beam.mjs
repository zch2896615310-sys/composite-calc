import {beamCurveData} from '../beam-curve.mjs?calculix-checks=19';
import {beamControls,beamDiagram} from '../beam-editor.mjs?report-wide=2';
import {beam} from '../engines/beam.mjs?calculix-checks=19';
import {esc,fmt,field,select,panel,metrics,table,curve,formSection,advanced} from '../ui.mjs?calculix-checks=19';
const responseCurve=(result,key,label,unit,plotWidth=null)=>curve(result.samples,key,label,unit,{model:result.model,plotWidth,probe:beamCurveData(result,key),color:({M:'#f34f59',V:'#00ad83',u:'#f39512'})[key],labelColor:({M:'#bd3543',V:'#087d61',u:'#a45c04'})[key],shade:true});
// Fit drawing coordinates to the actual panel instead of stretching text.
export function fitBeamFigures(input,result,root=document.querySelector('#module-results')){
 if(!root)return;
 const preview=root.querySelector('.beam-model-visual>svg');
 const replace=(svg,markup)=>{const box=document.createElement('div');box.innerHTML=markup;const next=box.querySelector('svg');if(next)svg.replaceWith(next);};
 if(preview){const width=Math.round(preview.getBoundingClientRect().width);if(width>100&&Math.abs(width-Number(preview.dataset.renderWidth))>1)replace(preview,beamDiagram(input,result,{viewportWidth:width}));}
 if(!result)return;
 const specs=[['M','弯矩图','kN·m'],['V','剪力图','kN'],['u','挠度图（向上为正）','mm']];
 root.querySelectorAll('.beam-response-curves .curve>svg').forEach((svg,j)=>{const width=Math.round(svg.getBoundingClientRect().width);if(width>100&&Math.abs(width-Number(svg.dataset.renderWidth))>1)replace(svg,responseCurve(result,...specs[j],width));});
}
export const defaultModel='横梁连续梁\n段长 = 1500,1500mm\n支点 = N0,N1,N2\n均布 = 0,L,q\n集中 = 无\n传力支点 = 全部\n悬挑系数 = 2\n自重 = 不计\n自重系数 = 1.2';
export default {
  type:'beam',version:1,title:'连续梁分析',symbol:'⌁',description:'任意分段与支点、均布及集中荷载；内力、反力与挠度曲线。',
  create:()=>({sectionId:'',axis:'x',E:206000,I:1.6258e6,q:1,P:1,ratio:250,model:defaultModel}),
  validate:i=>{if(!i||typeof i.model!=='string'||typeof i.sectionId!=='string'||!['x','y'].includes(i.axis)||!['E','I','q','P','ratio'].every(k=>typeof i[k]==='number'))throw Error('连续梁参数格式无效');},
  dependencies:i=>[...(i.sectionId?[{id:i.sectionId,types:['section']}]:[]),...(i.loadId?[{id:i.loadId,types:['loads']}]:[])],
  calculate(ctx){return beam(ctx.instance.input,ctx.instance.input.sectionId?ctx.getResult(ctx.instance.input.sectionId):null,globalThis,ctx.instance.input.loadId?ctx.getResult(ctx.instance.input.loadId):null);},
  render(ctx){
    const i=ctx.instance.input,r=ctx.result;
    const options=[['','手动输入 E 与 I'],...ctx.project.modules.filter(m=>m.type==='section').map(m=>[m.id,m.name])];
    if(i.sectionId&&!options.some(([id])=>id===i.sectionId))options.push([i.sectionId,'引用截面已删除']);
    const refs=select('刚度来源','input.sectionId',i.sectionId,options)+select('弯曲轴','input.axis',i.axis,[['x','绕 x 轴 / Ix'],['y','绕 y 轴 / Iy']])+select('均布荷载来源','input.loadId',i.loadId||'',[['','手动输入'],...ctx.project.modules.filter(m=>m.type==='loads').map(m=>[m.id,m.name])])+(i.loadId?select('引用的荷载','input.loadField',i.loadField||'qELine',[['qELine','地震设计线荷载'],['qEkLine','地震标准线荷载'],['gdLine','重力设计线荷载'],['gkLine','重力标准线荷载']]):'');
    const manual=(!i.sectionId?field('弹性模量 E','input.E',i.E,'MPa')+field('截面惯性矩 I','input.I',i.I,'mm⁴'):'')+(!i.loadId?field('均布参考 q','input.q',i.q,'kN/m'):'')+field('挠度限值 L /','input.ratio',i.ratio);
    const backup=(i.sectionId?field('手动弹性模量 E','input.E',i.E,'MPa')+field('手动惯性矩 I','input.I',i.I,'mm⁴'):'')+(i.loadId?field('手动均布参考 q','input.q',i.q,'kN/m'):'');
    const form=formSection('参数来源',refs)+formSection('荷载与控制',manual)+(backup?advanced('备用手动参数（引用时不使用）',`<div class="form-grid">${backup}</div>`,'beam-backup'):'')+advanced('旧项目参考参数',`<div class="form-grid">${field('集中参考 P（兼容旧模型）','input.P',i.P,'kN')}</div><p class="hint">保留旧项目的参考值；下方集中荷载显示实际 kN 数值，编辑后直接按数值保存。</p>`,'beam-legacy-point-reference');
    const source=ctx.project.modules.find(m=>m.id===i.sectionId);
    const input=advanced('计算参数与引用',`<div class="panel-body">${form}${i.sectionId?`<div class="link-info">引用：${esc(source?.name||'截面已删除')}<br>当前 E = ${fmt(r?.E)} MPa，I = ${fmt(r?.I)} mm⁴<br>截面修改后本模块自动重算。</div>`:''}<p class="hint">集中荷载在下方荷载列表直接输入 kN 数值和作用位置。荷载正值向下；此模块不自动附加设计组合系数或自重。</p></div>`,'beam-parameters')+beamControls(i);
    let out=ctx.errorHtml;
    if(r){const supportRows=r.model.supports.map((x,j)=>[`R${j+1}`,fmt(x),fmt(r.reactions[j]/1000)]);
      out=panel('分析结果',metrics([['最大 |M|',r.M,'kN·m'],['最大 |V|',r.V,'kN'],['最大 |位移|',r.u,'mm'],['最大 |支点反力|',r.R,'kN']])+`<div class="beam-response-curves">`+responseCurve(r,'M','弯矩图','kN·m')+responseCurve(r,'V','剪力图','kN')+responseCurve(r,'u','挠度图（向上为正）','mm')+`</div>`+table(['支点','x / mm','反力 / kN'],supportRows)+`<div class="status-line">力平衡残差 ${fmt(r.forceResidual,8)} N · 力矩平衡残差 ${fmt(r.momentResidual,6)} N·mm<br>挠度限值利用率 ${fmt(r.utilization*100,2)}% · ${r.utilization<=1?'当前挠度不超过所设限值':'当前挠度超过所设限值'}</div>`).replace('class="panel"','class="panel beam-results-panel"');
    }
    return `<div class="editor-grid beam-workspace"><div>${input}</div><div>${panel('梁模型',beamDiagram(i,r),'实时更新').replace('class="panel"','class="panel beam-preview-panel"')}${out}</div></div>`;
  },
  report(ctx){const r=ctx.result;return r?'<div class="beam-report">'+beamDiagram(ctx.instance.input,r,{interactive:false,viewportWidth:760,report:true})+responseCurve(r,'M','弯矩图','kN·m',760)+responseCurve(r,'V','剪力图','kN',760)+responseCurve(r,'u','挠度图','mm',760)+'</div>'+`<p>挠度校核：${r.utilization<=1?'满足':'不满足'}；限值利用率 ${fmt(r.utilization*100,2)}%。</p>`+table(['结果','数值','单位'],[['|M|max',fmt(r.M),'kN·m'],['|V|max',fmt(r.V),'kN'],['|位移|max',fmt(r.u),'mm'],['|R|max',fmt(r.R),'kN'],['挠度限值利用率',fmt(r.utilization*100),'%'],['力平衡残差',fmt(r.forceResidual,8),'N']])+`<p>刚度来源：${esc(ctx.project.modules.find(m=>m.id===ctx.instance.input.sectionId)?.name||'手动输入')}；E=${fmt(r.E)} MPa，I=${fmt(r.I)} mm⁴。线弹性 Euler–Bernoulli 梁，未自动附加荷载组合或自重。</p>`+table(['支点位置 / mm','反力 / kN'],r.model.supports.map((x,j)=>[fmt(x),fmt(r.reactions[j]/1000)])):ctx.errorHtml;}
};
