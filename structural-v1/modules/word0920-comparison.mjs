import {esc,fmt,panel,table} from '../ui.mjs?calculix-checks=19';
const refs={loadId:'loads',textLoadId:'loads',pictureBeamId:'beam',beamId:'beam',serviceBeamId:'beam',hangerId:'hanger_demand',stabilityId:'member_stability',bracketId:'bracket_strength',horizontalBeamId:'beam',anchorId:'anchor_test'};
export function wordComparison(ctx){
 const i=ctx.instance.input,r=Object.fromEntries(Object.keys(refs).map(k=>[k,ctx.getResult(i[k])]));
 return{state:'原书数值与2025复算差异已列明；稳定性及试验资料待补',rows:[
 ['合计自重标准值','人工采用0.24',r.loadId.gk,'kN/m²','经验式精算为'+fmt(r.loadId.exact,9)+'；采用值独立保留'],
 ['地震设计面荷载','0.134',r.loadId.qE,'kN/m²','网页不提前取整'],
 ['1300mm地震设计线荷载','原图0.17',r.loadId.qELine,'kN/m','另设原图0.17梁，避免与未取整设计梁混用'],
 ['1350mm文字分格线荷载','正文分格1350mm',r.textLoadId.qELine,'kN/m','原代入式1300mm与正文1350mm分别列出'],
 ['抗水平挂件单件拉力','0.065',r.hangerId.derived.N,'kN','8个抗水平挂件分配'],
 ['承重挂件单件剪力','0.6',r.hangerId.derived.V,'kN','2个承重挂件分配；试验数据未提供'],
 ['立柱最大弯矩','0.01',r.beamId.M,'kN·m','原书手填值；网页按未取整设计荷载'],
 ['立柱最大剪力','0.09',r.beamId.V,'kN','原书手填值；网页使用分析结果'],
 ['立柱最大支点反力','0.2',r.beamId.R,'kN','原书人工采用值与真实反力分别保留'],
 ['原图0.17线荷载挠度','0.13',r.pictureBeamId.u,'mm','六支点、五段，总长3110mm'],
 ['正常使用挠度','原书0.13按设计图值列示',r.serviceBeamId.u,'mm','网页标准地震荷载；900/250=3.6mm'],
 ['x向正则化长细比','0.348',r.stabilityId.derived.normalizedX,'','按原书λ/π·sqrt(fy/E)及所列输入复算，与原值不一致'],
 ['y向正则化长细比','0.244',r.stabilityId.derived.normalizedY,'','原φx=0.82、φy=0.91仅留历史；2025按适用路径查表，缺弯扭资料时不采用旧φ'],
 ['原1.1系数对照（当前截面）','33.2',r.stabilityId.derived.legacyCritical/1000,'kN','按当前未取整截面，仅对照原1.1系数；不作为2025验算参数'],
 ['2025版平面内N′E参数','原书33.2',r.stabilityId.derived.critical/1000,'kN','按5.5.2-2，以γR=1.165替代原1.1；当前截面和荷载联动'],
 ['2025版等效弯矩系数βm','原βmx=βtx=0.85',r.stabilityId.derived.betaM,'','当前梁有中间横向荷载，按5.5.3第2款取1.0'],
 ['角码正应力','34.08',r.bracketId.derived.sigma,'MPa','保留原书G=1.2、F=0.2kN及净截面取值'],
 ['角码剪应力','5.85',r.bracketId.derived.tau,'MPa','单件V=0.6kN，净面积102.5mm²'],
 ['横向角钢梁挠度','0.33',r.horizontalBeamId.u,'mm','原单向I模型对照；新增双向耦合结果见对应章节。原书未给E/I、圆角及侧向约束，无法确认原软件完整输入'],
 ['横向角钢梁最大反力','0.2',r.horizontalBeamId.R,'kN','原书人工采用值；载荷位置按原矢量图恢复'],
 ['角钢梁控制跨限值','配文1330/250=6.1',1525/250,'mm','1330/250实为5.32；原详图第一跨1525/250才是6.1'],
 ['现场拉拔需求','0.4',r.anchorId.derived.demand,'kN','原书人工采用水平力0.2×2；尚无现场报告，不能判承载力满足']
 ]};
}
function body(ctx){if(!ctx.result)return ctx.errorHtml;const i=ctx.instance.input;return `<p>原书采用值、图示与公式复算分别列示。修改模块参数后本表的网页复算列随引用自动更新，原书列保持原样。</p>`+table(['项目','原书记载','网页复算','单位','口径与差异'],ctx.result.rows.map(([n,a,b,u,t])=>[n,a,fmt(b,6),u,t]))+`<p>挂件节称5mm，全文标题和自重节为6mm；主模型采用6mm。正文“两跨连续悬臂”与图示六支点五段不符，立柱按图示160/900/900/900/250mm建模。横向角钢梁按详图1525/1300/1300mm，集中力位置875/2175/3475mm由矢量图比例恢复，可在梁模块修改。</p><p>角码等效净截面由原书A=102.5、Ix=25889.7917反推为2.5×50mm板条中部9mm缺口；该几何只用于截面性质复现，不证明实际孔径、连接构造或三维受力。角钢截面含Ixy，单轴梁采用明确的手动E/I假定，不作为空间角钢完整验算。</p><p>原书“GB 50018—2020”的标注原样记录；现行公开公告为GB/T 50018—2025，自2025-09-01实施。网页稳定性已改按2025版分流；单轴对称开口的5.5.4路径单独计算。当前材料、连接、有效截面和弯扭条件未齐，不判定稳定性满足。<a href="https://www.mohurd.gov.cn/gongkai/zc/wjk/art/2025/art_2f702dcde20548e4b3d9efb6bafbb37f.html">住建部标准公告</a></p><p>原件：${esc(i.source)}；SHA-256：${esc(i.sourceSha256)}。本示例不新增原书未提供的板有限元模型。缺失的实测、粘结和完整连接承载力资料仍待补充。</p>`;}
export default{type:'word0920_comparison',version:1,title:'0920 Word原书对照',symbol:'≡',description:'列示6mm Word计算书的采用值、复算值、模型假定和待补资料。',create:()=>({}),validate:i=>{if(!i||typeof i.source!=='string'||!/^[a-f0-9]{64}$/.test(i.sourceSha256)||Object.keys(refs).some(k=>typeof i[k]!=='string'||!i[k]))throw Error('0920原书对照来源或引用缺失');},dependencies:i=>Object.entries(refs).map(([k,t])=>({id:i[k],types:[t]})),calculate:wordComparison,render:ctx=>panel('0920计算书复现与差异',body(ctx)),report:body};
