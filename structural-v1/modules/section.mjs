import {section} from '../engines/section.mjs';
import {sectionDetails} from '../engines/section-details.mjs';
import {esc,fmt,field,select,panel,metrics,table,textarea,formSection,advanced} from '../ui.mjs?calculix-checks=19';
export function sectionPropertyRows(input,r){
 const p=sectionDetails(input,r),direction=v=>v?v.map(n=>fmt(Math.abs(n)<1e-12?0:n,6)).join(', '):'任意正交方向';
 return [['面积 A',r.A,'mm²'],['换算面积 Aeq',r.Aeq,'mm²'],['形心 Gx（距左边缘）',p.gx,'mm'],['形心 Gy（距下边缘）',p.gy,'mm'],
 ['换算中心 cx（距左边缘）',p.centerX,'mm'],['换算中心 cy（距下边缘）',p.centerY,'mm'],['惯性矩 Ix',r.Ix,'mm⁴'],['惯性矩 Iy',r.Iy,'mm⁴'],
 ['极惯性矩 Ip = Ix + Iy',p.Ip,'mm⁴'],['回转半径 ix',p.ix,'mm'],['回转半径 iy',p.iy,'mm'],['截面模量 Wx（上）',r.WxTop,'mm³'],['截面模量 Wx（下）',r.WxBottom,'mm³'],['截面模量 Wy（左）',r.WyLeft,'mm³'],['截面模量 Wy（右）',r.WyRight,'mm³'],
 ['绕 x 轴面积矩 Sx（上半部）',p.Sx,'mm³'],['绕 y 轴面积矩 Sy（右半部）',p.Sy,'mm³'],['左边缘距换算中心',p.left,'mm'],['右边缘距换算中心',p.right,'mm'],['上边缘距换算中心',p.top,'mm'],['下边缘距换算中心',p.bottom,'mm'],['截面总宽',p.width,'mm'],['截面总高',p.height,'mm'],
 ['惯性积 Ixy',r.Ixy,'mm⁴'],['主惯性矩 I₁（大）',p.I1,'mm⁴'],['主惯性矩 I₂（小）',p.I2,'mm⁴'],['I₁轴相对x轴角度',p.angle===null?'任意方向':fmt(p.angle,6),'°'],['I₁轴方向 (x, y)',direction(p.axis1),''],['I₂轴方向 (x, y)',direction(p.axis2),''],['抗弯刚度 EIx',r.EIx,'N·mm²'],['抗弯刚度 EIy',r.EIy,'N·mm²']];
}
const properties=(input,r)=>{const rows=sectionPropertyRows(input,r);return '<div class="section-property-groups">'+[['几何信息与中心',0,6],['惯性矩与回转半径',6,11],['截面模量与静矩',11,17],['边缘距离与总尺寸',17,23],['惯性积与主轴',23,29],['抗弯刚度',29,31]].map(([title,a,b])=>`<section class="section-property-card" aria-label="${title}"><h3>${title}</h3>`+table(['参数','数值','单位'],rows.slice(a,b))+'</section>').join('')+'</div>';};
const propertyBasis='<p class="hint section-property-basis">I、W、S及回转半径按参考E换算；Sx取中心轴上半部，Sy取右半部。形心G按几何面积计算。Ip是面积极惯性矩，扭转常数J尚未计算。</p>';
function picture(r){
  const b=r.bounds,w=b.xmax-b.xmin,h=b.ymax-b.ymin,scale=Math.min(350/w,220/h),x0=300-w*scale/2,y0=255;
  const rects=r.outlines?`<path d="${r.outlines.map(loop=>loop.map((p,j)=>`${j?'L':'M'}${x0+(p[0]-b.xmin)*scale} ${y0-(p[1]-b.ymin)*scale}`).join(' ')+'Z').join(' ')}" fill="#d8e8f5" fill-rule="evenodd" stroke="#5786aa"/>`:r.rects.map((a,i)=>`<rect x="${x0+(a.x-b.xmin)*scale}" y="${y0-(a.y+a.h-b.ymin)*scale}" width="${a.b*scale}" height="${a.h*scale}" fill="${['#d8e8f5','#acc9de','#edf2f5'][i%3]}" stroke="#5786aa" stroke-width="1.2"/>`).join('');
  const cx=x0+(r.cx-b.xmin)*scale,cy=y0-(r.cy-b.ymin)*scale;
  return `<div class="visual"><svg viewBox="0 0 600 300" role="img" aria-label="截面模拟图">${rects}<path d="M${cx-100} ${cy}h200M${cx} ${cy-100}v200" stroke="#8da2b3" stroke-dasharray="5 5"/><circle cx="${cx}" cy="${cy}" r="3" fill="#2464a4"/><text x="${cx+107}" y="${cy+4}" font-size="12" fill="#647687">x</text><text x="${cx+7}" y="${cy-102}" font-size="12" fill="#647687">y</text></svg><p class="visual-caption">尺寸按比例绘制 / 虚线为刚度中心轴</p></div>`;
}
export default {
  type:'section',version:1,title:'截面模拟',symbol:'Ⅰ',description:'型钢、多层复合截面、矩形拼合截面；计算刚度与截面特性。',
  create:()=>({shape:'box',h:100,b:60,tw:4,tf:4,E:206000,layers:[{t:3,E:70000},{t:15,E:10000},{t:3,E:70000}],rects:[{x:0,y:0,b:60,h:4,E:206000},{x:28,y:4,b:4,h:92,E:206000},{x:0,y:96,b:60,h:4,E:206000}]}),
  validate:i=> {if(!i||typeof i.shape!=='string'||typeof i.E!=='number'||!Array.isArray(i.layers)||!Array.isArray(i.rects))throw Error('截面模块参数格式无效');const info=i.cad?.importInfo;if(info&&(!Number.isFinite(info.unitScaleToMm)||info.unitScaleToMm<=0||!['selectedHandles','excludedHandles'].every(k=>Array.isArray(info[k])&&info[k].length<=2000&&info[k].every(v=>typeof v==='string'&&v.length<=128))))throw Error('CAD导入来源信息格式无效');if(info?.selectionWindow){const b=info.selectionWindow;if(!['xmin','xmax','ymin','ymax'].every(k=>Number.isFinite(b[k]))||b.xmax<=b.xmin||b.ymax<=b.ymin)throw Error('CAD框选范围无效');}},
  calculate:ctx=>section(ctx.instance.input),
  render(ctx){
    const i=ctx.instance.input,r=ctx.result;
    let form=select('截面形式','input.shape',i.shape,[['box','矩形钢管'],['h','H 形截面'],['channel','槽形截面'],['angle','角形截面'],['rect','实心矩形'],['layers','多层复合截面'],['custom','矩形拼合截面'],['cad','CAD 闭合轮廓']])+field('参考弹性模量 E','input.E',i.E,'MPa');
    if(!['layers','custom','cad'].includes(i.shape))form+=field('高度 h','input.h',i.h,'mm')+field('宽度 b','input.b',i.b,'mm');
    if(!['layers','custom','rect','cad'].includes(i.shape))form+=field(i.shape==='angle'?'壁厚 t':'腹板厚度 tw','input.tw',i.tw,'mm');
    if(['h','box','channel'].includes(i.shape))form+=field('翼缘厚度 tf','input.tf',i.tf,'mm');
    if(i.shape==='layers')form+=field('统一宽度 b','input.b',i.b,'mm');
    let extra='';
    if(!['layers','custom'].includes(i.shape))extra=`<div class="actions-row"><button data-action="module:import-cad">导入 DWG / DXF / 轮廓 JSON</button></div><p class="hint">DXF / 轮廓 JSON 可直接读取；DWG 需要在线转换服务。预览后选择闭合轮廓，确认单位并应用。保留真实圆弧和孔洞，原文件不修改。扭转J、翘曲常数不由面积惯性矩代替。</p>${i.shape==='cad'&&i.cad?`<p class="hint">已导入：${esc(i.cad.source)}${i.cad.importInfo?.converter?' · '+esc(i.cad.importInfo.converter):''}</p>`:''}`;
    if(i.shape==='layers')extra=`<p class="hint">从下至上叠放，层间完全粘结。输入：厚度 t（mm）、弹性模量 E（MPa）。</p><div class="table-scroll"><table class="compact"><thead><tr><th>层</th><th>t / mm</th><th>E / MPa</th><th></th></tr></thead><tbody>${i.layers.map((l,n)=>`<tr><td>${n+1}</td><td><input aria-label="第${n+1}层厚度" type="number" step="any" data-number data-path="input.layers.${n}.t" value="${esc(l.t)}"></td><td><input aria-label="第${n+1}层弹性模量" type="number" step="any" data-number data-path="input.layers.${n}.E" value="${esc(l.E)}"></td><td><button data-action="module:remove-layer" data-index="${n}">×</button></td></tr>`).join('')}</tbody></table></div><button data-action="module:add-layer">＋ 添加材料层</button>`;
    if(i.shape==='custom')extra=`<p class="hint">每行为一个矩形：x, y, 宽度, 高度, E。x/y 为左下角，单位 mm；矩形不能重叠。不同 E 按参考材料换算。</p><textarea data-path="input.rects" data-rects rows="8">${esc(i.rects.map(r=>[r.x,r.y,r.b,r.h,r.E].join(', ')).join('\n'))}</textarea>`;
    return `<div class="editor-grid"><div>${panel('截面参数',`<div class="panel-body">${i.basisNote?`<p class="hint">${esc(i.basisNote)}</p>`:''}${formSection('截面形式与尺寸',form)}${extra}<p class="hint">型钢采用理想尖角矩形分块，不含轧制圆角。多材料截面的 I、W 是按参考 E 换算的值；EI 为实际抗弯刚度。</p></div>`)}${panel('常用截面',`<div class="panel-body"><div class="actions-row"><button data-action="section-save" ${r?'':'disabled'}>保存为常用截面</button><button data-action="section-library">打开常用截面库</button></div><p class="hint">名称可自定义，保存后可跨项目载入；当前浏览器本地保存，可导出备份。</p></div>`)}${advanced('截面引用与计算假定',`<div class="muted">此截面可以被任意数量的连续梁引用。修改尺寸后，引用它的梁将重新计算。<br><br>矩形拼合适用于角钢、组合型钢等自定义截面；Ixy ≠ 0 时，单轴梁模块会阻止直接引用。</div>`)}</div><div>${r?panel('截面模拟',picture(r)+metrics([['几何面积 A',r.A,'mm²'],['截面模量 Wx（上）',r.WxTop,'mm³'],['截面模量 Wy（左）',r.WyLeft,'mm³'],['抗弯刚度 EIx',r.EIx,'N·mm²']])+properties(i,r)+propertyBasis,'SECTION PROPERTIES'):ctx.errorHtml}</div></div>`;
  },
  action(ctx,action,index){const a=ctx.instance.input.layers;if(action==='add-layer')a.push({t:5,E:206000});else if(action==='remove-layer'&&a.length>1)a.splice(index,1);},
  report(ctx){const r=ctx.result;return r?(ctx.instance.input.basisNote?`<p>${esc(ctx.instance.input.basisNote)}</p>`:'')+picture(r)+properties(ctx.instance.input,r)+propertyBasis+`<p>${r.outlines?'按 CAD 真实直线与圆弧边界积分，孔洞按嵌套关系扣除。':'型钢按理想尖角分块，复合截面完全粘结、线弹性。'}I 和 W 按参考 E 换算。CAD 截面的扭转 J 与翘曲常数尚未计算。</p>`+(ctx.instance.input.cad?.importInfo?`<p>CAD来源：${esc(ctx.instance.input.cad.source)}；已选${ctx.instance.input.cad.importInfo.selectedHandles.length}个对象，未采用${ctx.instance.input.cad.importInfo.excludedHandles.length}个对象；每个CAD单位换算为${esc(ctx.instance.input.cad.importInfo.unitScaleToMm)} mm。${ctx.instance.input.cad.importInfo.converter?'转换器：'+esc(ctx.instance.input.cad.importInfo.converter)+'；源文件SHA-256：'+esc(ctx.instance.input.cad.importInfo.sourceSha256):''}</p>`:''):ctx.errorHtml;}
};
