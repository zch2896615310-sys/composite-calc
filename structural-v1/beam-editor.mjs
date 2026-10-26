import {esc,fmt,panel} from './ui.mjs?calculix-checks=19';
import {beamNodes,positionParts,positionValue,readBeamEditor,writeBeamEditor,directPointLoads,setBeamPosition,changePositionKind,moveBeamHandle,removeBeamSpan} from './beam-editor-model.mjs?v=4';

const option=(v,label,current)=>`<option value="${esc(v)}" ${String(v)===String(current)?'selected':''}>${esc(label)}</option>`;
const friendly=e=>({'Beam model 2':'段长必须为正数，最多20段','Beam model 3':'支点或荷载位置超出当前梁长','Beam model 4':'至少需要两个不同位置的支点，支点不能重合','Beam model 5':'悬挑系数须大于0且不超过10','Beam model 7':'均布范围须起点小于终点；最多16组均布、32个集中力'}[e.message]||e.message);
const number=(label,path,value,unit='',extra='')=>`<label class="beam-field"><span>${esc(label)}${unit?` <small>${esc(unit)}</small>`:''}</span><input type="number" step="any" data-beam-field="${path}" value="${esc(value)}" ${extra}></label>`;
function positionControl(label,path,token,s){
 const p=positionParts(token),parts=part=>`data-beam-field="${path}" data-pos-part="${part}"`,N=s.spans.length;
 let edit='';
 if(p.kind==='node')edit=`<select aria-label="${esc(label)}节点" ${parts('node')}>${Array.from({length:N+1},(_,j)=>option(j,`节点 ${j} · ${fmt(beamNodes(s)[j])} mm`,p.node)).join('')}</select>`;
 if(p.kind==='segment')edit=`<select aria-label="${esc(label)}所在段" ${parts('segment')}>${s.spans.map((l,j)=>option(j+1,`第 ${j+1} 段`,p.segment)).join('')}</select><label class="beam-inline-value"><input aria-label="${esc(label)}段内比例" type="number" step="any" min="0" max="100" value="${esc(p.fraction)}" ${parts('fraction')}><span>%</span></label>`;
 if(p.kind==='absolute'||p.kind==='percent')edit=`<label class="beam-inline-value"><input aria-label="${esc(label)}${p.kind==='absolute'?'距左端':'比例'}" type="number" step="any" min="0" ${p.kind==='percent'?'max="100"':''} value="${esc(p.kind==='absolute'?p.mm:p.percent)}" ${parts(p.kind==='absolute'?'mm':'percent')}><span>${p.kind==='absolute'?'mm':'%'}</span></label>`;
 return `<div class="beam-position"><span>${esc(label)}</span><div><select aria-label="${esc(label)}定位方式" ${parts('kind')}>${[['node','节点'],['segment','段内比例'],['absolute','距左端'],['percent','总长比例'],['end','梁右端']].map(([v,t])=>option(v,t,p.kind)).join('')}</select>${edit}</div></div>`;
}
function loadCard(l,j,type,s){
 const point=type==='points',path=`${type}.${j}`,name=point?'集中力':'均布荷载',unit=point?'kN':'kN/m';
 if(point)return `<details class="beam-load-card" data-ui-key="beam-${type}-${j}" open><summary>${name} ${j+1}<small>${fmt(l.value)} kN</small></summary><div class="beam-load-body">${number('荷载值',path+'.value',l.value,'kN')}${positionControl('作用位置',path+'.position',l.position,s)}<button class="beam-remove" data-beam-action="remove-${type}" data-index="${j}">移除此${name}</button></div></details>`;
 return `<details class="beam-load-card" data-ui-key="beam-${type}-${j}" open><summary>${name} ${j+1}<small>${l.reference?'参考'+(point?' P':' q')+' × '+fmt(l.value):fmt(l.value)+' '+unit}</small></summary><div class="beam-load-body"><label class="beam-field"><span>荷载取值</span><select data-beam-field="${path}.reference">${option('true','参考 '+(point?'P':'q')+' × 系数',l.reference)}${option('false','独立数值（'+unit+'）',l.reference)}</select></label>${number(l.reference?'倍数':'荷载值',path+'.value',l.value,l.reference?'倍':unit)}${point?positionControl('作用位置',path+'.position',l.position,s):positionControl('起点',path+'.start',l.start,s)+positionControl('终点',path+'.end',l.end,s)}<button class="beam-remove" data-beam-action="remove-${type}" data-index="${j}">移除此${name}</button></div></details>`;
}
export function beamControls(input){
 try{
  const s=directPointLoads(readBeamEditor(input.model),input.P);
  return panel('模型设置',`<div class="panel-body beam-editor"><div class="beam-editor-status" role="status"></div><div class="beam-editor-heading"><h3>跨段列表 <small>${s.spans.length}</small></h3><button data-beam-action="add-span" ${s.spans.length>=20?'disabled':''}>＋ 增加一段</button></div><div class="beam-span-list">${s.spans.map((l,j)=>`<div class="beam-span-row"><span class="beam-span-id">L${j+1}</span><label class="beam-span-value"><span class="beam-sr-only">第 ${j+1} 段 mm</span><input type="number" step="any" min="1" aria-label="第 ${j+1} 段 mm" data-beam-field="spans.${j}" value="${esc(l)}"><small>mm</small></label><button aria-label="移除第${j+1}段" data-beam-action="remove-span" data-index="${j}" ${s.spans.length===1?'disabled':''}>×</button></div>`).join('')}</div><div class="beam-editor-heading"><h3>支点 <small>${s.supports.length}</small></h3><button data-beam-action="add-support" ${s.supports.length>=32?'disabled':''}>＋ 添加支点</button></div><p class="hint">节点随分段长度移动；距左端位置保持固定。</p>${s.supports.map((a,j)=>`<details class="beam-support-card" data-ui-key="beam-support-${j}"><summary>支点 R${j+1}<small>${esc(fmt(positionValue(a.position,s)))} mm</small></summary><div class="beam-row-title"><strong>支点设置</strong><button aria-label="移除支点R${j+1}" data-beam-action="remove-supports" data-index="${j}" ${s.supports.length<=2?'disabled':''}>×</button></div>${positionControl('支点 R'+(j+1),`supports.${j}.position`,a.position,s)}<label class="beam-check"><input type="checkbox" data-beam-field="supports.${j}.transfer" ${a.transfer?'checked':''}>参与传力反力取值</label></details>`).join('')}<div class="beam-editor-heading"><h3>荷载列表 <small>${s.udl.length+s.points.length}</small></h3></div><div class="beam-add-loads"><button data-beam-action="add-udl" ${s.udl.length>=16?'disabled':''}>＋ 均布荷载</button><button data-beam-action="add-point" ${s.points.length>=32?'disabled':''}>＋ 集中力</button></div>${s.udl.map((l,j)=>loadCard(l,j,'udl',s)).join('')}${s.points.map((l,j)=>loadCard(l,j,'points',s)).join('')}${!s.udl.length&&!s.points.length?'<p class="hint">当前没有施加荷载。</p>':''}<details class="advanced-settings" data-ui-key="beam-control-options"><summary>模型控制</summary><div class="advanced-content">${number('悬挑挠度计算系数','factor',s.factor,'倍','min="0.01" max="10"')}<p class="hint">支点约束竖向平移、允许转动；悬挑端无需设置支点。自重请作为明确的均布荷载添加。</p></div></details></div>`);
 }catch(e){return panel('梁模型',`<div class="error">现有模型尚不能转换为图形编辑，请先核对原模型。原数据已保留。${esc(e.message)}</div>`);}
}
export function beamDiagram(input,result,{interactive=true,viewportWidth=null,report=false}={}){
 let s;try{s=readBeamEditor(input.model);}catch{return'';}
 const width=viewportWidth||760,left=viewportWidth?34:58,span=width-2*left,H=beamNodes(s).at(-1),nodes=beamNodes(s),X=x=>left+span*x/H,udlHeight=s.udl.length*26,top=12+udlHeight,beamY=top+64,q=result?.q??input.q,P=input.P;
 const laneEnds=[],supportLanes=s.supports.map(a=>{
  if(!report)return 0;
  const x=positionValue(a.position,s),px=X(x),half=(fmt(x)+' mm').length*3.4+5;
  let lane=laneEnds.findIndex(end=>end+8<px-half);
  if(lane<0)lane=laneEnds.length;
  laneEnds[lane]=px+half;return lane;
 }),labelExtra=report?Math.max(0,...supportLanes)*34:0,height=top+172+labelExtra+(report?18:0);
 const drag=(type,j,x,label)=>interactive?`class="beam-handle" tabindex="0" role="slider" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${H}" aria-valuenow="${x}" data-beam-drag="${type}" data-index="${j}"`:'';
 const arrow=(x,y,to,color)=>`<path d="M${x} ${y}V${to}m-4 ${to>y?-7:7}l4 ${to>y?7:-7} 4 ${to>y?-7:7}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
 let body=`<line x1="${left}" y1="${beamY}" x2="${left+span}" y2="${beamY}" stroke="#356385" stroke-width="6" stroke-linecap="round"/>`;
 s.udl.forEach((l,j)=>{const a=X(positionValue(l.start,s)),b=X(positionValue(l.end,s)),value=l.reference?l.value*q:l.value,y=14+j*26,to=beamY-10,count=Math.max(2,Math.min(12,Math.round((b-a)/60)));body+=`<g stroke="#527d9e"><path d="M${a} ${y+14}H${b}" fill="none"/>${Array.from({length:count},(_,k)=>arrow(a+(b-a)*k/(count-1),value>=0?y+14:to,value>=0?to:y+14,'#7495ae')).join('')}</g><text x="${(a+b)/2}" y="${y+6}" text-anchor="middle">q${j+1} = ${esc(fmt(value))} kN/m</text><circle ${drag('udl-start',j,positionValue(l.start,s),'均布荷载'+(j+1)+'起点')} cx="${a}" cy="${y+14}" r="6"/><circle ${drag('udl-end',j,positionValue(l.end,s),'均布荷载'+(j+1)+'终点')} cx="${b}" cy="${y+14}" r="6"/>`;});
 s.points.forEach((l,j)=>{const x=positionValue(l.position,s),px=X(x),value=l.reference?l.value*P:l.value,y=top+8+(j%3)*10,from=value>=0?y+15:beamY-9,to=value>=0?beamY-9:y+15,base=to+(value>=0?-10:10);body+=`<g ${drag('point',j,x,'集中力'+(j+1)+'位置')}><path class="point-load-arrow" d="M${px} ${from}V${base}M${px} ${to}L${px-6} ${base}H${px+6}Z" fill="#b77537" stroke="#b77537" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><text x="${px+9}" y="${y+10}" fill="#9a653e">P${j+1} = ${esc(fmt(value))} kN</text><path class="point-load-hit" d="M${px} ${from}V${to}" stroke="transparent" stroke-width="22" fill="none" pointer-events="stroke"/></g>`;});
 s.supports.forEach((a,j)=>{const x=positionValue(a.position,s),px=X(x),offset=supportLanes[j]*34;body+=`<g ${drag('support',j,x,'支点R'+(j+1)+'位置')}><path d="M${px} ${beamY+5}l-12 21h24Z" fill="#e4eff7" stroke="#527d9e"/><path d="M${px-17} ${beamY+31}h34" stroke="#7594aa"/>${offset?`<path d="M${px} ${beamY+33}V${beamY+offset+36}" stroke="#a8bac8" stroke-dasharray="2 3"/>`:''}<text x="${px}" y="${beamY+49+offset}" text-anchor="middle">R${j+1}</text><text x="${px}" y="${beamY+65+offset}" text-anchor="middle">${esc(fmt(x))} mm</text></g>`;});
 nodes.forEach((x,j)=>{const px=X(x);body+=`<g ${j?drag('node',j,x,'节点'+j+'位置'):''}><circle cx="${px}" cy="${beamY}" r="6"/><text x="${px}" y="${beamY-15}" text-anchor="middle">N${j}</text></g>`;});
 s.spans.forEach((l,j)=>{const a=X(nodes[j]),b=X(nodes[j+1]),y=beamY+90+labelExtra+(report?18:0);body+=`<path d="M${a} ${y-6}v12m0-6H${b}m0-6v12" stroke="#9aafbe"/><text x="${(a+b)/2}" y="${y-8-(report&&j%2===1?15:0)}" text-anchor="middle">L${j+1} = ${esc(fmt(l))} mm</text>`;});
 return `<div class="beam-model-visual"><svg style="height:${height}px" viewBox="0 0 ${width} ${height}" data-render-width="${viewportWidth||0}" data-beam-left="${left}" data-beam-span="${span}" role="${interactive?'group':'img'}" aria-label="可调整的连续梁模型" data-beam-length="${H}">${body}</svg>${interactive?'<p class="hint beam-model-help">拖动节点、支点或荷载标记即可调整。方向键微调，Shift 加快；正荷载向下。</p>':''}<div class="beam-model-summary"><span>总长 <strong>${esc(fmt(H))}</strong> mm</span><span><strong>${s.spans.length}</strong> 段</span><span><strong>${s.supports.length}</strong> 个支点</span><span><strong>${s.udl.length}</strong> 组均布</span><span><strong>${s.points.length}</strong> 个集中力</span></div></div>`;
}
export function setupBeamEditor({getCurrent,update,onError}){
 const status=text=>{const e=document.querySelector('.beam-editor-status');if(e)e.textContent=text;};
 const editingState=current=>directPointLoads(readBeamEditor(current.input.model),current.input.P);
 function commit(s,live=false){update(writeBeamEditor(s),live);status('');}
 function edit(event,live){const el=event.target;if(!el.dataset.beamField||!getCurrent())return;try{
  const current=getCurrent(),s=editingState(current),parts=el.dataset.beamField.split('.');let obj=s;for(const k of parts.slice(0,-1))obj=obj[k];const key=parts.at(-1);
  if(el.type==='number'&&!el.value.trim())throw Error('请输入完整数值');
  if(el.dataset.posPart)obj[key]=el.dataset.posPart==='kind'?changePositionKind(obj[key],el.value,s):setBeamPosition(obj[key],el.dataset.posPart,el.value);
  else if(el.type==='checkbox')obj[key]=el.checked;
  else if(key==='reference'){const next=el.value==='true',ref=parts[0]==='udl'?current.q:current.input.P;if(next!==obj.reference){if(next&&ref===0)throw Error('参考荷载为0，不能将独立值换算为参考倍数');obj.value=next?obj.value/ref:obj.value*ref;}obj.reference=next;}
  else{if(!el.value.trim()||!Number.isFinite(Number(el.value)))throw Error('请输入完整数值');obj[key]=Number(el.value);}
  commit(s,live);el.removeAttribute('aria-invalid');
 }catch(e){if(el.tagName==='SELECT'){const s=editingState(getCurrent()),old=el.dataset.beamField.split('.').reduce((a,k)=>a[k],s);el.value=String(el.dataset.posPart?positionParts(old)[el.dataset.posPart]:old);}el.setAttribute('aria-invalid','true');status('尚未应用：'+friendly(e));onError(friendly(e));}}
 document.addEventListener('input',e=>{if(e.target.tagName!=='SELECT'&&e.target.type!=='checkbox')edit(e,true);});
 // A number field can blur on a button's pointerdown. Keep that button in the
 // DOM until its click runs, otherwise a valid span edit can swallow the click.
 document.addEventListener('change',e=>edit(e,e.target.tagName==='INPUT'&&e.target.type!=='checkbox'));
 document.addEventListener('click',e=>{const b=e.target.closest('[data-beam-action]');if(!b||b.disabled||!getCurrent())return;try{
  let s=editingState(getCurrent());const j=Number(b.dataset.index),action=b.dataset.beamAction;
  if(action==='add-span'){if(s.spans.length>=20)throw Error('最多20段');s.spans.push(s.spans.at(-1));s.supports.push({position:'N'+s.spans.length,transfer:true});}
  if(action==='remove-span')s=removeBeamSpan(s,j);
  if(action==='add-support'){if(s.supports.length>=32)throw Error('最多32个支点');const H=beamNodes(s).at(-1),sorted=[0,...s.supports.map(a=>positionValue(a.position,s)),H].sort((a,b)=>a-b);let at=H/2,gap=-1;for(let k=1;k<sorted.length;k++)if(sorted[k]-sorted[k-1]>gap){gap=sorted[k]-sorted[k-1];at=(sorted[k]+sorted[k-1])/2;}s.supports.push({position:String(at),transfer:true});}
  if(action.startsWith('remove-')&&action!=='remove-span')s[action.slice(7)].splice(j,1);
  if(action==='add-udl')s.udl.push({start:'N0',end:'L',reference:true,value:1});
  if(action==='add-point')s.points.push({position:'50%',reference:false,value:1});
  commit(s);
  if(action==='remove-span')status('已移除该段并衔接两端；段内集中力及零长度荷载已移除，请核对模型。');
 }catch(error){status(friendly(error));}});
 let drag=null;
 document.addEventListener('pointerdown',e=>{const h=e.target.closest('[data-beam-drag]');if(!h||!getCurrent()||e.button!==0)return;const svg=h.closest('svg'),matrix=svg.getScreenCTM();if(!matrix)return;
  drag={state:editingState(getCurrent()),type:h.dataset.beamDrag,index:+h.dataset.index,matrix:matrix.inverse(),H:+svg.dataset.beamLength,left:+svg.dataset.beamLeft,span:+svg.dataset.beamSpan,id:getCurrent().id,startX:e.clientX,pointerId:e.pointerId,moved:false};document.documentElement.setPointerCapture(e.pointerId);e.preventDefault();
 });
 document.addEventListener('pointermove',e=>{if(!drag)return;if(getCurrent()?.id!==drag.id){drag=null;return;}if(Math.abs(e.clientX-drag.startX)<2&&!drag.moved)return;try{
  const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(drag.matrix),x=(p.x-drag.left)/drag.span*drag.H,s=moveBeamHandle(drag.state,drag.type,drag.index,x);drag.moved=true;commit(s,true);
 }catch(error){status('当前位置尚未应用：'+friendly(error));}});
 const finish=()=>{if(!drag)return;const moved=drag.moved,pointerId=drag.pointerId;drag=null;if(document.documentElement.hasPointerCapture(pointerId))document.documentElement.releasePointerCapture(pointerId);if(moved&&getCurrent()){update(getCurrent().input.model,false);status('模型已按拖动位置更新。');}};
 document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',finish);
 document.addEventListener('keydown',e=>{const h=e.target.closest('[data-beam-drag]');if(!h||!['ArrowLeft','ArrowRight'].includes(e.key)||!getCurrent())return;e.preventDefault();try{
  const s=editingState(getCurrent()),step=(e.shiftKey?100:10)*(e.key==='ArrowRight'?1:-1),x=Number(h.getAttribute('aria-valuenow'))+step;commit(moveBeamHandle(s,h.dataset.beamDrag,+h.dataset.index,x),true);
  document.querySelector(`[data-beam-drag="${h.dataset.beamDrag}"][data-index="${h.dataset.index}"]`)?.focus();
 }catch(error){status(friendly(error));}});
}
