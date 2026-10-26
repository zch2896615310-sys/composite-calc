import {esc,fmt,field,select,panel,table,formSection,advanced} from '../ui.mjs?calculix-checks=19';
import {positive,finite} from '../engines/section.mjs';

const specs={
 hanger_demand:{title:'挂件荷载与试验需求',symbol:'↧',description:'按抗水平挂件及承重挂件分别分配荷载，记录拉剪试验数据。',refs:[['荷载来源','loadId','loads']],params:[['面板宽度','B',1300,'mm'],['面板高度','H',2970,'mm'],['水平承力挂件数','nHorizontal',8,'个'],['竖向承重挂件数','nVertical',2,'个'],['手动地震设计面荷载','qE',.1344,'kN/m²'],['手动重力设计面荷载','gd',.312,'kN/m²'],['试验抗拉值（0为未提供）','testedN',0,'kN'],['试验抗剪值（0为未提供）','testedV',0,'kN']],basis:'N=qE·B·H/(10⁶nH)，V=Gd·B·H/(10⁶nV)；B、H以mm输入，输出kN。引用荷载时只取其设计面荷载，尺寸及挂件数由本模块明确输入。挂件材质或厚度不能代替拉剪试验；未提供实测值及报告编号时只列需求。'},
 member_stability:{title:'压弯构件稳定性',symbol:'λ',description:'计算长细比、正则化长细比、欧拉临界力及原书平面内外稳定表达式。',refs:[['轴力荷载来源','loadId','loads'],['弯矩来源','beamId','beam'],['截面来源','sectionId','section']],params:[['手动压轴力 N','N',1.2,'kN'],['手动弯矩 M','M',.01,'kN·m'],['荷载分格宽度','B',1300,'mm'],['轴力计算高度','H',2970,'mm'],['面积 A','A',189.17,'mm²'],['截面模量 Wx','W',904.09,'mm³'],['回转半径 ix','ix',8.818,'mm'],['回转半径 iy','iy',12.552,'mm'],['x向计算长度','lx',900,'mm'],['y向计算长度','ly',900,'mm'],['弹性模量 E','E',206000,'MPa'],['屈服强度 fy','fy',235,'MPa'],['强度设计值 f','f',215,'MPa'],['稳定系数 φx','phiX',.82,''],['稳定系数 φy','phiY',.91,''],['受弯整体稳定系数 φb','phiB',.95,''],['等效弯矩系数 βmx','betaMx',.85,''],['等效弯矩系数 βtx','betaTx',.85,''],['人工采用欧拉临界力','NEx',33.2,'kN']],basis:'φx、φy、φb、βmx、βtx 均由输入指定，不按长细比自动查表。公式中的N、M先换算为N及N·mm，尺寸mm、强度MPa。所列判断仅对应下方表达式与输入系数。原书标注“GB 50018—2020”及其系数原样记录，不自动替换为其他版本或据此宣布整项规范校核完成。'},
 bracket_strength:{title:'偏心角码强度',symbol:'∟',description:'分配单个连接件拉剪力，按偏心距计算弯矩及净截面正应力、剪应力。',refs:[['重力荷载来源','loadId','loads'],['水平支座反力来源','beamId','beam'],['净截面来源','sectionId','section']],params:[['手动总竖向力 G','G',1.2,'kN'],['手动总水平力 F','F',.2,'kN'],['共同承力连接件数','n',2,'个'],['偏心距 e','e',60,'mm'],['荷载分格宽度','B',1300,'mm'],['重力计算高度','H',2970,'mm'],['净面积 A','A',102.5,'mm²'],['净截面模量 Wx','W',1035.59,'mm³'],['发展系数 γ','gamma',1.05,''],['正应力设计值 f','f',215,'MPa'],['剪应力设计值 fv','fv',125,'MPa']],basis:'V=G/n、N=F/n、M=V·e/1000（kN·m）；σ=|N|/A+|M|/(γW)，τ=|V|/A。引用梁时取最大支点反力，引用荷载时按Gd·B·H取总重力。正应力公式中的内力先换算为N及N·mm。净截面参数须与控制截面一致；本式不包含螺栓孔承压、角码屈曲或墙体承载力。'},
 anchor_test:{title:'锚栓现场拉拔需求',symbol:'↗',description:'由水平反力或人工采用值计算现场拉拔试验最低需求，可记录实测值。',refs:[['水平支座反力来源','beamId','beam']],params:[['人工采用水平力 N','N',.2,'kN'],['锚栓竖向力记录值','vertical',0,'kN'],['拉拔试验倍数','factor',2,''],['拉拔实测值（0为未提供）','tested',0,'kN']],basis:'按原书的限位模型取水平力需求；竖向力单独记录，不自动折算成拉力。拉拔需求=k·|N|。它是现场试验需求，不是锚栓、砌体或混凝土的设计承载力；未提供试验数据时不判为通过。'}
};
const row=(name,formula,value,unit,limit=null,origin='')=>({name,formula,value,unit,limit,origin,pass:limit===null?null:value<=limit});
const sameMaterial=s=>{if(s.coupled||s.rects?.some(r=>Math.abs(r.E-s.E)>1e-6))throw Error('本项要求同材料主轴截面，不能直接忽略耦合弯曲');};
export function connectionCheck(type,i,refs={}){
 const rows=[],derived={};let pending=false;
 for(const k of ['tested','testedN','testedV'])if(k in i&&(!Number.isFinite(i[k])||i[k]<0))throw Error('实测值须为非负数，0代表未提供');
 if(refs.loads&&['member_stability','bracket_strength'].includes(type)){positive(i.B,'荷载分格宽度');positive(i.H,'计算高度');}
 if(type==='hanger_demand'){
  for(const k of ['B','H','nHorizontal','nVertical'])positive(i[k],k);
  if(!Number.isInteger(i.nHorizontal)||!Number.isInteger(i.nVertical))throw Error('挂件数量必须为整数');
  const q=refs.loads?.qE??i.qE,g=refs.loads?.gd??i.gd;finite(q,'qE');finite(g,'Gd');
  const N=Math.abs(q)*i.B*i.H/1e6/i.nHorizontal,V=Math.abs(g)*i.B*i.H/1e6/i.nVertical;
  pending=!i.reportNo.trim()||i.testedN<=0||i.testedV<=0;
  rows.push(row('单个挂件抗拉需求','|qE|·B·H/(10⁶nH)',N,'kN',pending?null:i.testedN),row('单个承重挂件抗剪需求','|Gd|·B·H/(10⁶nV)',V,'kN',pending?null:i.testedV));Object.assign(derived,{qE:q,gd:g,N,V});
 }else if(type==='member_stability'){
  let N=i.N*1000,M=i.M*1e6,A=i.A,W=i.W,ix=i.ix,iy=i.iy,E=i.E;
  if(refs.loads)N=refs.loads.gd*i.B*i.H/1000;
  if(refs.beam)M=refs.beam.M*1e6;
  if(refs.section){const s=refs.section;sameMaterial(s);A=s.A;W=Math.min(s.WxTop,s.WxBottom);ix=Math.sqrt(s.Ix/A);iy=Math.sqrt(s.Iy/A);E=s.E;}
  for(const[k,v]of Object.entries({A,W,ix,iy,E,fy:i.fy,f:i.f,lx:i.lx,ly:i.ly,phiX:i.phiX,phiY:i.phiY,phiB:i.phiB,betaMx:i.betaMx,betaTx:i.betaTx}))positive(v,k);
  if(N<0)throw Error('压弯稳定性中的压轴力须为非负数');
  if([i.phiX,i.phiY,i.phiB].some(v=>v>1))throw Error('稳定系数须在0到1之间');
  const lx=i.lx/ix,ly=i.ly/iy,normalizedX=lx/Math.PI*Math.sqrt(i.fy/E),normalizedY=ly/Math.PI*Math.sqrt(i.fy/E),critical=Math.PI**2*E*A/(1.1*lx**2),used=i.criticalMode==='manual'?i.NEx*1000:critical;
  positive(used,'采用欧拉临界力');const denominator=1-.8*N/used;
  if(denominator<=0)throw Error('1−0.8N/NEx≤0，不能继续采用本稳定表达式');
  const axialX=N/(i.phiX*A*i.f),bendingX=i.betaMx*Math.abs(M)/(W*i.f*denominator),axialY=N/(i.phiY*A*i.f),bendingY=i.betaTx*Math.abs(M)/(i.phiB*W*i.f);
  rows.push(row('x向长细比','lx/ix',lx,''),row('y向长细比','ly/iy',ly,''),row('x向正则化长细比','λx/π·sqrt(fy/E)',normalizedX,''),row('y向正则化长细比','λy/π·sqrt(fy/E)',normalizedY,''),row('欧拉临界力公式复算','π²EA/(1.1λx²)',critical/1000,'kN'),row('实际采用欧拉临界力','NEx',used/1000,'kN',null,i.criticalMode==='manual'?'采用原书/人工临界力':'采用公式复算临界力'),row('平面内稳定利用率','N/(φxAf)+βmx|M|/[Wf(1−0.8N/NEx)]',axialX+bendingX,'',1,`轴力项=${fmt(axialX,9)}；弯矩项=${fmt(bendingX,9)}；分母修正=${fmt(denominator,9)}`),row('平面外稳定利用率','N/(φyAf)+βtx|M|/(φbWf)',axialY+bendingY,'',1,`轴力项=${fmt(axialY,9)}；弯矩项=${fmt(bendingY,9)}`));Object.assign(derived,{N,M,A,W,ix,iy,E,lx,ly,normalizedX,normalizedY,critical,used,denominator});
 }else if(type==='bracket_strength'){
  for(const k of ['n','gamma','f','fv'])positive(i[k],k);if(!Number.isInteger(i.n))throw Error('共同承力连接件数量须为整数');
  finite(i.e,'偏心距');let G=refs.loads?refs.loads.gd*i.B*i.H/1e6:i.G,F=refs.beam?refs.beam.R:i.F,A=i.A,W=i.W;
  if(refs.section){sameMaterial(refs.section);A=refs.section.A;W=Math.min(refs.section.WxTop,refs.section.WxBottom);}positive(A,'净面积');positive(W,'净截面模量');
  const V=G/i.n,N=F/i.n,M=V*i.e/1000,sigma=Math.abs(N)*1000/A+Math.abs(M)*1e6/(i.gamma*W),tau=Math.abs(V)*1000/A;
  rows.push(row('单件水平力','F/n',N,'kN'),row('单件竖向力','G/n',V,'kN'),row('单件偏心弯矩','V·e/1000',M,'kN·m'),row('角码组合正应力','|N|/A+|M|/(γW)',sigma,'MPa',i.f,`A=${fmt(A,8)} mm²；W=${fmt(W,8)} mm³`),row('角码平均剪应力','|V|/A',tau,'MPa',i.fv));Object.assign(derived,{G,F,N,V,M,A,W,sigma,tau});
 }else if(type==='anchor_test'){
  positive(i.factor,'试验倍数');const N=refs.beam?refs.beam.R:i.N,demand=i.factor*Math.abs(N);pending=!i.reportNo.trim()||i.tested<=0;
  rows.push(row('采用水平力','|N|',Math.abs(N),'kN'),row('竖向力记录','原书独立输入',i.vertical,'kN'),row('现场拉拔试验最低需求','k·|N|',demand,'kN',pending?null:i.tested));Object.assign(derived,{N,vertical:i.vertical,demand});
 }else throw Error('未知连接/稳定性计算类型');
 if(rows.some(r=>!Number.isFinite(r.value)))throw Error('计算出现非有限值，请检查输入');
 const checked=rows.filter(r=>r.pass!==null),pass=pending?null:checked.length?checked.every(r=>r.pass):null;
 return{rows,derived,pending,pass,state:pending?'待补试验数据':pass===true?'按输入参数，所列公式满足':pass===false?'存在不满足项目':'仅列计算需求'};
}
function resultBody(type,result){
 const s=specs[type];return `<p class="result-notice ${result.pending?'warning':result.pass===false?'danger':'success'}">${esc(result.state)}</p>`+table(['项目','公式','计算值','限值 / 实测','单位','判断'],result.rows.map(r=>[r.name,r.formula,fmt(r.value,6),r.limit===null?'—':fmt(r.limit,6),r.unit,r.pass===null?(result.pending&&/需求/.test(r.name)?'待试验':'计算值'):r.pass?'满足':'不满足']))+result.rows.filter(r=>r.origin).map(r=>`<p class="hint">${esc(r.name)}：${esc(r.origin)}</p>`).join('')+`<p class="hint">${esc(s.basis)}</p>`;
}
export const connectionModules=Object.entries(specs).map(([type,s])=>({type,version:1,title:s.title,symbol:s.symbol,description:s.description,
 create:()=>({...Object.fromEntries(s.params.map(([,k,v])=>[k,v])),...Object.fromEntries(s.refs.map(([,k])=>[k,''])),...(['hanger_demand','anchor_test'].includes(type)?{reportNo:''}:{}),...(type==='member_stability'?{criticalMode:'formula'}:{})}),
 validate:i=>{if(!i||s.params.some(([,k])=>typeof i[k]!=='number'||!Number.isFinite(i[k]))||s.refs.some(([,k])=>typeof i[k]!=='string'))throw Error('连接/稳定性参数格式无效');if(type==='member_stability'&&!['formula','manual'].includes(i.criticalMode))throw Error('临界力取值方式无效');if(['hanger_demand','anchor_test'].includes(type)&&typeof i.reportNo!=='string')throw Error('试验报告编号无效');},
 dependencies:i=>s.refs.filter(([,k])=>i[k]).map(([,k,type])=>({id:i[k],types:[type]})),
 calculate(ctx){const refs={};for(const[,key,type]of s.refs)if(ctx.instance.input[key])refs[type]=ctx.getResult(ctx.instance.input[key]);return connectionCheck(type,ctx.instance.input,refs);},
 render(ctx){const i=ctx.instance.input,source=s.refs.map(([name,key,type])=>select(name,'input.'+key,i[key],[['','人工输入'],...ctx.project.modules.filter(m=>m.type===type).map(m=>[m.id,m.name])])).join('');const inactive=key=>(!i.loadId&&['member_stability','bracket_strength'].includes(type)&&['B','H'].includes(key))||(i.loadId&&({hanger_demand:['qE','gd'],member_stability:['N'],bracket_strength:['G']}[type]||[]).includes(key))||(i.beamId&&({member_stability:['M'],bracket_strength:['F'],anchor_test:['N']}[type]||[]).includes(key))||(i.sectionId&&({member_stability:['A','W','ix','iy','E'],bracket_strength:['A','W']}[type]||[]).includes(key))||(type==='member_stability'&&i.criticalMode==='formula'&&key==='NEx');const paramsHTML=p=>p.map(([name,key,,unit])=>field(name,'input.'+key,i[key],unit)).join('');let params=paramsHTML(s.params.filter(([,key])=>!inactive(key)));const backup=paramsHTML(s.params.filter(([,key])=>inactive(key)));if(type==='member_stability')params=select('欧拉临界力取值','input.criticalMode',i.criticalMode,[['formula','按当前截面与长度计算'],['manual','人工采用值（原书复现）']])+params;if(['hanger_demand','anchor_test'].includes(type))params+=field('试验报告编号','input.reportNo',i.reportNo,'','text');return `<div class="editor-grid connection-workspace"><div>${panel(s.title+'输入',`<div class="panel-body">${formSection('参数引用',source)}${formSection('参数与取值',params)}${backup?advanced('备用手动值（当前不使用）',`<div class="form-grid">${backup}</div>`,'connection-backup'):''}<p class="hint">引用项优先于对应手动值。${esc(s.basis)}</p></div>`)}</div><div>${ctx.result?panel('计算过程与结果',resultBody(type,ctx.result)):ctx.errorHtml}</div></div>`;},
 report:ctx=>ctx.result?`<p>${esc(s.description)}</p>`+resultBody(type,ctx.result):ctx.errorHtml
}));
