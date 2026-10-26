import {registry} from './model.mjs?calculix-checks=25';
import {markReportFailures,isFailureText} from './report-status.mjs';
import {materialKind,loadReportInput} from './modules/loads.mjs?calculix-checks=19';
import {loadFormulaRows} from './ui.mjs?calculix-checks=19';
const text=n=>(n.textContent||'').replace(/\s+/g,' ').trim();
const labels={accelerationInput:'直接输入地震加速度 / mm/s²',tStone:'石材厚度 / mm',tCore:'蜂窝芯厚度 / mm',tSteel:'单面钢板厚度 / mm',foil:'铝箔厚度 / mm',cell:'芯格边长 / mm',psi:'蜂窝系数 / kg/m³',gammaStone:'石材重度 / kN/m³',gammaSteel:'钢板重度 / kN/m³',g:'重力加速度 / m/s²',beta:'动力放大系数 βE',alpha:'地震系数 αmax',gammaG:'恒载分项系数 γG',gammaE:'地震分项系数 γE',additional:'附加恒载 / kN/m²',width:'面板宽度 / mm',height:'面板高度 / mm',tributary:'分格宽度 / mm',nHorizontal:'水平承力挂点数',nVertical:'竖向承重挂点数',mode:'恒载取值方式',adopted:'人工恒载采用值 / kN/m²',shape:'截面类型',E:'弹性模量 / MPa',axis:'弯曲轴',ratio:'挠度限值分母',P:'参考集中力 / kN',q:'参考均布荷载 / kN/m',loadField:'引用荷载类型',kind:'验算类型',N:'轴力 / kN',V:'剪力 / kN',M:'弯矩 / kN·m',A:'面积 / mm²',W:'截面模量 / mm³',I:'惯性矩 / mm⁴',S:'静矩 / mm³',t:'厚度 / mm',gamma:'发展系数 γ',f:'正应力限值 / MPa',fv:'剪应力限值 / MPa',mesh_mm:'网格控制尺寸 / mm'};
const number=v=>typeof v==='number'?String(Number(v.toPrecision(10))):String(v);
Object.assign(labels,{lx:'x向计算长度 / mm',ly:'y向计算长度 / mm',ix:'回转半径ix / mm',iy:'回转半径iy / mm',fy:'屈服强度 / MPa',phiX:'人工稳定系数φx',phiY:'人工稳定系数φy',phiB:'人工整体稳定系数φb',betaMx:'人工等效弯矩系数βmx',betaTx:'人工等效弯矩系数βtx',criticalMode:'欧拉临界力取值方式',NEx:'人工采用欧拉临界力 / kN',qE:'地震设计面荷载 / kN/m²',gd:'重力设计面荷载 / kN/m²',testedN:'挂件抗拉实测值 / kN',testedV:'挂件抗剪实测值 / kN',G:'总竖向力 / kN',F:'总水平力 / kN',e:'偏心距 / mm',factor:'拉拔试验倍数',tested:'拉拔实测值 / kN',vertical:'竖向力记录值 / kN',B:'分格宽度 / mm',H:'立柱计算高度 / mm',fStone:'石材抗弯设计值 / MPa',fSteel:'钢板设计值 / MPa',fCore:'芯层剪切设计值 / MPa',n:'铆钉数量',d:'铆钉直径 / mm',thick:'厚构件厚度 / mm',eta:'群钉折减系数',h:'有效接触高度 / mm',peelLimit:'剥离要求值 / N·mm/mm',pullLimit:'平拉要求值 / MPa',peel:'剥离实测值 / N·mm/mm',pull:'平拉实测值 / MPa',reportNo:'检测报告编号'});
async function raster(svg){
 const copy=svg.cloneNode(true);copy.querySelectorAll('.curve-probe').forEach(node=>node.remove());copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
 const box=copy.getAttribute('viewBox')?.split(/\s+/).map(Number)||[0,0,700,300],width=box[2],height=box[3];
 copy.setAttribute('width',width);copy.setAttribute('height',height);
 const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml'}));
 try{const img=new Image();await new Promise((ok,no)=>{img.onload=ok;img.onerror=()=>no(Error('报告图像转换失败'));img.src=url;});const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return{type:'image',data:canvas.toDataURL('image/png').split(',')[1],width,height,caption:svg.getAttribute('aria-label')||'计算结果图'};}finally{URL.revokeObjectURL(url);}
}
export async function reportPayload(project,evaluation,context){
 const sections=[];
 for(const instance of project.modules){
  const ctx=context(instance,evaluation),container=document.createElement('div');container.innerHTML=registry.get(instance.type).report(ctx);markReportFailures(container);
  const blocks=[];
  async function walk(node){for(const child of node.children){const tag=child.tagName.toLowerCase();if(tag==='table'){const trs=[...child.querySelectorAll('tr')];blocks.push({type:'table',rows:trs.map(tr=>[...tr.querySelectorAll('th,td')].map(text)),failedCells:trs.map(tr=>[...tr.querySelectorAll('th,td')].map(c=>c.classList.contains('report-fail')))});}else if(tag==='svg'){blocks.push(await raster(child));}else if(['p','h1','h2','h3','li'].includes(tag)||child.classList.contains('result-notice')){if(text(child))blocks.push({type:tag.startsWith('h')?'subheading':'paragraph',text:(tag==='li'?'• ':'')+text(child),fail:child.classList.contains('report-fail')});}else await walk(child);}}
  await walk(container);
  let formulas=[];if(instance.type==='loads'&&ctx.result)formulas=loadFormulaRows(ctx.result,materialKind(instance.input)==='stone',instance.input).map(v=>v.row[1]);if(instance.type==='check'&&ctx.result)formulas=ctx.result.rows.map(r=>r[1]);if(instance.type==='section')formulas=['A = ∑Ai','yc = ∑(Ei Ai yi) / ∑(Ei Ai)','EIx = ∑Ei (Ixi + Ai (yi − yc)²)'];if(instance.type==='beam')formulas=['EI d⁴v/dx⁴ = q(x)','M(x) = −EI d²v/dx²','V(x) = dM(x) / dx'];
  const input=instance.type==='loads'?loadReportInput(instance.input):instance.input;const inputRows=[];
  const derived=new Set();
  if(instance.type==='check'){
   const active={member:['N','V','M','A','W','I','S','t','gamma','f','fv','kind','axis'],rivet:['N','V','n','d','t','f','eta','kind','femCase','support'],hanger:['V','t','h','fv','kind','femCase','support'],anchor:['N','factor','kind','femCase','support']}[input.kind];
   for(const k of Object.keys(input))if(!k.endsWith('Id')&&!active.includes(k))derived.add(k);
  }
  if(instance.type==='section'&&input.shape==='cad')formulas=['A = ∮(x dy − y dx) / 2','xc = ∮x² dy / (2A); yc = −∮y² dx / (2A)','Ix = −∮y³ dx / 3 − A yc²; Iy = ∮x³ dy / 3 − A xc²'];
  if(instance.type==='section'){
   const unused={cad:['h','b','tw','tf'],custom:['h','b','tw','tf'],layers:['h','tw','tf'],angle:['tf'],rect:['tw','tf']}[input.shape]||[];
   for(const k of unused)derived.add(k);
  }
  if(['hanger_demand','member_stability','bracket_strength','anchor_test'].includes(instance.type)){
   const type=instance.type;
   if(input.loadId)for(const k of ({hanger_demand:['qE','gd'],member_stability:['N'],bracket_strength:['G']}[type]||[]))derived.add(k);
   if(input.beamId)for(const k of ({member_stability:['M'],bracket_strength:['F'],anchor_test:['N']}[type]||[]))derived.add(k);
   if(input.sectionId)for(const k of ({member_stability:['A','W','ix','iy','E'],bracket_strength:['A','W']}[type]||[]))derived.add(k);
   if(!input.loadId&&['member_stability','bracket_strength'].includes(type))for(const k of ['B','H'])derived.add(k);
   if(type==='member_stability'&&input.criticalMode==='formula')derived.add('NEx');
  }
  if(instance.type==='beam'){if(input.sectionId)for(const k of ['E','I'])derived.add(k);if(input.loadId)derived.add('q');}
  if(instance.type==='check'){if(input.sectionId)for(const k of ['A','W','I'])derived.add(k);if(input.beamId)for(const k of ['M','V'])derived.add(k);if(input.loadId||input.femId)derived.add('N');if(input.femId)derived.add('V');}
  derived.add('basisNote');derived.add('model');if(input.mode==='exact')derived.add('adopted');if(instance.type==='loads'){derived.add('coreMode');derived.add('materialKind');if(materialKind(input)==='stone')for(const k of ['foil','cell','psi','gammaSteel'])derived.add(k);}
  for(const[k,v]of Object.entries(input)){if(!derived.has(k)&&(typeof v==='number'||typeof v==='string'&&!k.endsWith('Id')&&v.length<120))inputRows.push([labels[k]||k,number(v)]);}
  if(instance.type==='loads'){const modeRow=inputRows.find(r=>r[0]===labels.mode);if(modeRow)modeRow[1]=input.mode==='adopted'?'人工采用值':'按计算值';inputRows.unshift(['材料构成',materialKind(input)==='stone'?'纯石材':'复合材料']);if(materialKind(input)!=='stone')inputRows.push(['蜂窝芯自重口径',input.coreMode==='word-empirical'?'第一份Word经验式，芯高以mm代入':'标准单位计算（自动换算），ψ为kg/m³']);const row=inputRows.find(r=>r[0]===labels.psi);if(row&&input.coreMode==='word-empirical')row[0]='Word经验系数 Cword（芯高mm）';}
  if(instance.type==='shell'){const mode=inputRows.find(r=>r[0]===labels.mode);if(mode){mode[0]='分层壳计算口径';mode[1]=input.mode==='legacy'?'原模型已验证结果（校准参考）':'按第二份计算书荷载';}}
  if(instance.type==='shell'&&input.mode==='legacy'){const row=inputRows.find(r=>r[0]===labels.mesh_mm);if(row){row[0]='壳单元数（原网格）';row[1]='18';}}
  if(['hanger_demand','anchor_test'].includes(instance.type)){for(const k of ['testedN','testedV','tested','reportNo'])if(k in input&&!input[k]){const row=inputRows.find(r=>r[0]===labels[k]);if(row)row[1]='未提供';}}
  if(instance.type==='member_stability'){const row=inputRows.find(r=>r[0]===labels.criticalMode);if(row)row[1]=input.criticalMode==='manual'?'人工采用值':'按公式复算';}
  if(instance.type==='bracket_strength'){const row=inputRows.find(r=>r[0]===labels.n);if(row)row[0]='共同承力连接件数';}
  if(instance.type==='bonding')for(const k of ['peel','pull','reportNo'])if(!input[k]){const row=inputRows.find(r=>r[0]===labels[k]);if(row)row[1]='未提供';}
  for(const k of ['loadId','sectionId','beamId','femId'])if(input[k]&&!(instance.type==='check'&&(input.kind==='member'?k==='femId':k!=='femId')))inputRows.unshift(['引用 '+({loadId:'荷载',sectionId:'截面',beamId:'梁分析',femId:'有限元'}[k]),project.modules.find(m=>m.id===input[k])?.name||'引用缺失']);
  if(instance.type==='section'&&input.shape==='custom')input.rects.forEach((r,j)=>inputRows.push([`矩形${j+1}：x,y,b,h / mm；E / MPa`,[r.x,r.y,r.b,r.h,r.E].map(number).join(', ')]));
  if(instance.type==='section'&&input.shape==='layers')input.layers.forEach((l,j)=>inputRows.push([`材料层${j+1}：t / mm；E / MPa`,[l.t,l.E].map(number).join(', ')]));
  if(instance.type==='section'&&input.shape==='cad'&&ctx.result){const r=ctx.result;inputRows.push(['CAD实际宽×高 / mm',`${r.bounds.xmax-r.bounds.xmin} × ${r.bounds.ymax-r.bounds.ymin}`],['轮廓来源',r.source.split(/[\\/]/).at(-1)]);}
  if(instance.type==='section'&&input.cad?.importInfo){const info=input.cad.importInfo;inputRows.push(['CAD单位换算 / mm每图形单位',number(info.unitScaleToMm)],['已选CAD对象',info.selectedHandles.join(', ')],['未采用CAD对象',info.excludedHandles.join(', ')]);if(info.converter)inputRows.push(['CAD转换器',info.converter],['源文件SHA-256',info.sourceSha256]);if(info.selectionWindow){const b=info.selectionWindow;inputRows.push(['CAD框选范围 / 原图单位',`(${number(b.xmin)}, ${number(b.ymin)}) — (${number(b.xmax)}, ${number(b.ymax)})`]);}}
  if(instance.type==='beam'&&ctx.result){for(const k of ['E','I','q'])inputRows.push(['实际采用 '+(labels[k]||k),number(ctx.result[k])]);blocks.unshift({type:'paragraph',text:'梁模型 '+input.model.replace(/\n/g,'；')});}
  if(instance.type==='check'&&ctx.result)for(const[k,u]of [['N','N'],['V','N'],['M','N·mm'],['A','mm²'],['W','mm³'],['I','mm⁴']])inputRows.push(['实际采用 '+k+' / '+u,number(ctx.result[k])]);
  if(instance.type==='fem'){const p=ctx.result?.snapshot?.project||input.project;const kind=inputRows.find(r=>r[0]==='analysisKind');if(kind){kind[0]='计算模型';kind[1]=input.analysisKind==='layered'?'分层壳':'三维实体';}inputRows.push(['单元类型',input.analysisKind==='layered'?'自编投影分层壳 / CalculiX矩阵接口':'C3D8I'],['几何 X / mm',p.geometry.x_breaks.join(', ')],['几何 Z / mm',p.geometry.z_breaks.join(', ')],['重力加速度 g / mm/s²',number(p.loads.g)],['Y向地震加速度 / mm/s²',number(p.loads.y_acceleration)],['X向地震加速度 / mm/s²',number(p.loads.x_acceleration)]);for(const l of p.layers)inputRows.push([`层 ${l.name}`,`${l.thickness} mm / ${l.material}`]);}
  if(ctx.result?.rows?.[0]?.formula)formulas=ctx.result.rows.map(v=>v.formula);
  if(instance.type==='shell')formulas=input.mode==='legacy'?['∑R + ∑F = 0']:['qEk = βE × αmax × Gk','ULS± = γG × DEAD ± γE × EQY','SLS± = DEAD ± EQY'];
  if(['hanger_demand','anchor_test'].includes(instance.type)){for(const k of ['testedN','testedV','tested','reportNo'])if(k in input&&!input[k]){const row=inputRows.find(r=>r[0]===labels[k]);if(row)row[1]='未提供';}}
  if(instance.type==='member_stability'){const row=inputRows.find(r=>r[0]===labels.criticalMode);if(row)row[1]=input.criticalMode==='manual'?'人工采用值':'按公式复算';}
  if(instance.type==='bracket_strength'){const row=inputRows.find(r=>r[0]===labels.n);if(row)row[0]='共同承力连接件数';}
  if(instance.type==='bonding')formulas=[`Fpeel ≥ ${input.peelLimit} N·mm/mm`,`fpull ≥ ${input.pullLimit} MPa`];
  if(['member_stability','member_stability_legacy2020'].includes(instance.type)){formulas=ctx.result?.reportFormulas||[];const active=registry.get(instance.type).reportInputs?.(ctx);if(active)inputRows.splice(0,inputRows.length,...active);}
  sections.push({title:instance.name.replace(/^第[一二三四五六七八九十0-9]+节\s*/,''),type:instance.type,formulas,blocks,inputRows});
 }
 const findings=project.modules.filter(m=>!['shell','fem'].includes(m.type)).map(m=>({name:m.name,result:evaluation.results.get(m.id),error:evaluation.errors.get(m.id)}));
 const states=findings.filter(m=>m.result?.state||m.error).map(m=>{const text=`${m.name}：${m.error?'未计算，'+m.error:m.result.state}`;return{text,fail:isFailureText(text)};});
 return{title:project.name,sections,projectSnapshot:project,introduction:(project.reportInfo?.paragraphs||[]).map(t=>t.startsWith('公开示例载入此前')?'公开示例初始载入已验证结果快照；载入本身不触发在线求解。修改模型后请运行在线有限元，并使用与当前输入匹配的结果生成计算书。':t),overall:states};
}
