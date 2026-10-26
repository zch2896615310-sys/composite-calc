import {serviceURL} from './public-runtime.mjs';
import {inspectDXF,parseDXF,cadSection,point} from './engines/cad.mjs?window=1';
import {esc,fmt} from './ui.mjs?calculix-checks=19';
import {curveBounds,windowComponents} from './cad-window.mjs';

const unitScales={1:25.4,2:304.8,4:1,5:10,6:1000,13:.001};
const unitNames={0:'未声明',1:'英寸',2:'英尺',4:'毫米',5:'厘米',6:'米',13:'微米'};
export function setupCadImport(apply){
 const dialog=document.querySelector('#cad-import');let state=null,sequence=0;
 const close=()=>{sequence++;state=null;drag=null;dialog.close();};
 dialog.querySelector('#cad-close').addEventListener('click',close);
 dialog.addEventListener('cancel',()=>{sequence++;state=null;drag=null;});
 dialog.addEventListener('change',e=>{if(e.target.matches('[data-component]'))clearWindow();refresh();});
 dialog.querySelector('#cad-apply').addEventListener('click',()=>{
  try{const data=selectedData();cadSection(data);apply(data,state.target);close();}catch(e){dialog.querySelector('#cad-check').textContent=e.message;}
 });
 function selectedData(){
  if(!state)throw Error('请先选择CAD文件');
  const scale=Number(dialog.querySelector('#cad-units').value);if(!(scale>0))throw Error('请先指定CAD图形的实际单位');
  const chosen=[...dialog.querySelectorAll('[data-component]:checked')].map(el=>state.info.components[Number(el.dataset.component)]);
  if(!chosen.length)throw Error('请选择至少一个闭合轮廓');
  const data=parseDXF(state.text,{keys:chosen.flatMap(c=>c.keys),unitScale:scale,source:state.name});
  data.importInfo={file:state.name,sourceUnit:state.info.unit,unitScaleToMm:scale,selectedHandles:chosen.flatMap(c=>c.handles),excludedHandles:state.info.components.filter(c=>!chosen.includes(c)).flatMap(c=>c.handles).concat(state.info.omitted.map(r=>r.handle)),...(state.selectionWindow?{selectionWindow:state.selectionWindow}:{}),...(state.conversion?{converter:state.conversion.engine,sourceSha256:state.conversion.source_sha256,dxfSha256:state.conversion.dxf_sha256,dxfUrl:state.conversion.dxf_url}: {})};
  return data;
 }
 function refresh(){
  if(!state)return;
  for(const path of dialog.querySelectorAll('[data-preview]'))path.classList.toggle('unselected',!dialog.querySelector(`[data-component="${path.dataset.preview}"]`)?.checked);
  try{const data=selectedData(),r=cadSection(data),count=data.curve_loops.length;dialog.querySelector('#cad-check').textContent=`${count}个闭合轮廓 · ${fmt(r.bounds.xmax-r.bounds.xmin)} × ${fmt(r.bounds.ymax-r.bounds.ymin)} mm · 净面积 ${fmt(r.A,6)} mm²`;
   dialog.querySelector('#cad-apply').disabled=false;
  }catch(e){dialog.querySelector('#cad-check').textContent=e.message;dialog.querySelector('#cad-apply').disabled=true;}
 }
 const preview=dialog.querySelector('#cad-preview');let drag=null;
 const svg=()=>preview.querySelector('svg');
 const location=e=>new DOMPoint(e.clientX,e.clientY).matrixTransform(svg().getScreenCTM().inverse());
 function drawWindow(box){
  const el=preview.querySelector('.cad-window-box');if(!el)return;
  el.setAttribute('x',box.x);el.setAttribute('y',box.y);el.setAttribute('width',box.width);el.setAttribute('height',box.height);el.style.display='';
 }
 function clearWindow(){if(state){state.selectionWindow=null;state.selectionBox=null;}const box=preview.querySelector('.cad-window-box');if(box)box.style.display='none';const label=preview.querySelector('.cad-window-status');if(label)label.textContent='框选会替换当前勾选；请将截面外边界与孔洞一并框入。';}
 function camera(box){if(!state)return;state.camera=box;svg()?.setAttribute('viewBox',`${box.x} ${box.y} ${box.w} ${box.h}`);}
 function zoom(factor,anchor){
  if(!state?.camera||!svg())return;const b=state.camera,w=Math.min(5600,Math.max(14,b.w*factor)),f=w/b.w,p=anchor||{x:b.x+b.w/2,y:b.y+b.h/2};
  camera({x:p.x-(p.x-b.x)*f,y:p.y-(p.y-b.y)*f,w,h:b.h*f});
 }
 function setMode(mode){if(!state)return;state.mode=mode;preview.dataset.mode=mode;for(const b of preview.querySelectorAll('[data-cad-mode]'))b.setAttribute('aria-pressed',String(b.dataset.cadMode===mode));}
 preview.addEventListener('click',e=>{
  const b=e.target.closest('[data-cad-view]');if(!b||!state)return;
  const action=b.dataset.cadView;
  if(action==='box'||action==='pan')setMode(action);
  if(action==='in'||action==='out')zoom(action==='in'?.8:1.25);
  if(action==='reset')camera({x:0,y:0,w:560,h:400});
  if(action==='all'||action==='none'){clearWindow();for(const el of dialog.querySelectorAll('[data-component]'))el.checked=action==='all'&&!el.disabled;refresh();}
 });
 preview.addEventListener('wheel',e=>{if(!state?.camera||!e.target.closest('svg'))return;e.preventDefault();if(!drag)zoom(e.deltaY>0?1.15:1/1.15,location(e));},{passive:false});
 preview.addEventListener('pointerdown',e=>{
  if(!state?.projection||!e.target.closest('svg')||![0,1].includes(e.button))return;
  e.preventDefault();const p=location(e);drag={id:e.pointerId,start:p,last:p,mode:e.button===1?'pan':state.mode,camera:{...state.camera}};svg().setPointerCapture(e.pointerId);
  if(drag.mode==='box')drawWindow({x:p.x,y:p.y,width:0,height:0});
 });
 preview.addEventListener('pointermove',e=>{
  if(!state||!drag||drag.id!==e.pointerId)return;e.preventDefault();const p=location(e);
  if(drag.mode==='pan'){const b=state.camera;camera({...b,x:b.x+drag.last.x-p.x,y:b.y+drag.last.y-p.y});drag.last=location(e);}
  else drawWindow({x:Math.min(p.x,drag.start.x),y:Math.min(p.y,drag.start.y),width:Math.abs(p.x-drag.start.x),height:Math.abs(p.y-drag.start.y)});
 });
 function finishDrag(e,cancel=false){
  if(!state||!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;
  if(svg()?.hasPointerCapture(e.pointerId))svg().releasePointerCapture(e.pointerId);
  if(d.mode!=='box')return;
  const end=location(e);
  if(cancel||Math.abs(end.x-d.start.x)<state.camera.w/280||Math.abs(end.y-d.start.y)<state.camera.h/200){if(state.selectionBox)drawWindow(state.selectionBox);else preview.querySelector('.cad-window-box').style.display='none';return;}
  const p=state.projection,raw=a=>[(a.x-p.originX)/p.zoom+p.minX,(p.originY-a.y)/p.zoom+p.minY],start=raw(d.start),stop=raw(end),chosen=windowComponents(state.info.components,[...start,...stop]);
  state.selectionWindow=chosen.bounds;state.selectionBox={x:Math.min(end.x,d.start.x),y:Math.min(end.y,d.start.y),width:Math.abs(end.x-d.start.x),height:Math.abs(end.y-d.start.y)};drawWindow(state.selectionBox);
  for(const el of dialog.querySelectorAll('[data-component]'))el.checked=chosen.selected.includes(Number(el.dataset.component));
  preview.querySelector('.cad-window-status').textContent=chosen.selected.length?`已框选 ${chosen.selected.length} 个完整闭合轮廓（含框内孔洞）；未完整框入 ${chosen.partial.length} 个，未闭合 ${chosen.invalid.length} 个。`:'未框入完整闭合轮廓，请扩大或重新框选。';refresh();
 }
 preview.addEventListener('pointerup',e=>finishDrag(e));
 preview.addEventListener('pointercancel',e=>finishDrag(e,true));
 function review(text,name,target,conversion){
  const info=inspectDXF(text);drag=null;state={text,name,target,conversion,info,mode:'box',camera:{x:0,y:0,w:560,h:400}};
  dialog.querySelector('#cad-status').textContent=`${name}${conversion?' · '+conversion.engine+' 本地转换':''} · 图纸单位：${unitNames[info.unit]||'代码 '+info.unit}`;
  const items=info.components.map((c,n)=>`<label class="cad-component ${c.valid?'':'invalid'}"><input type="checkbox" data-component="${n}" ${c.valid?'checked':'disabled'}><span><strong>轮廓 ${n+1} · ${c.valid?'闭合':'未采用'}</strong><small>图层 ${esc(c.layers.join(' / '))} · ${c.keys.length}个对象${c.valid?'':' · '+esc(c.error)}</small><small>句柄 ${esc(c.handles.join(', '))}</small></span></label>`).join('');
  dialog.querySelector('#cad-components').innerHTML=items||'<p>没有可用的二维轮廓。</p>';
  const omitted=info.components.filter(c=>!c.valid).reduce((s,c)=>s+c.keys.length,0)+info.omitted.length;
  dialog.querySelector('#cad-excluded').innerHTML=`<p>${omitted?`有 ${omitted} 个对象未参与截面计算，可在轮廓列表中查看未采用对象。`:'请核对轮廓及孔洞，勾选本次计算需要的部分。'}</p>`+(info.omitted.length?`<details open><summary>文字、布局或暂不支持的对象（${info.omitted.length}）</summary>${info.omitted.map(r=>`<p>${esc(r.handle)} · ${esc(r.type)} · ${esc(r.layer)} · ${esc(r.reason)}</p>`).join('')}</details>`:'')+(conversion?`<p><a href="${esc(conversion.dxf_url)}" download>下载转换后的DXF</a> · <a href="${esc(conversion.log_url)}" download>转换日志${conversion.warnings?'（含提示）':''}</a></p>`:'');
  const scale=unitScales[info.unit];dialog.querySelector('#cad-units').value=scale?String(scale):'';
  if(info.components.length){const bounds=curveBounds(info.components.flatMap(c=>c.curves)),minX=bounds.xmin,minY=bounds.ymin,w=bounds.xmax-minX,h=bounds.ymax-minY,zoom=Math.min(500/(w||1),340/(h||1));const originX=30+(500-w*zoom)/2,originY=200+h*zoom/2;state.projection={minX,minY,zoom,originX,originY};
   dialog.querySelector('#cad-preview').innerHTML=`<div class="cad-view-tools" role="group" aria-label="CAD预览工具"><button type="button" data-cad-view="box" data-cad-mode="box" aria-pressed="true">框选截面</button><button type="button" data-cad-view="pan" data-cad-mode="pan" aria-pressed="false">平移</button><button type="button" data-cad-view="in" aria-label="放大CAD预览">＋</button><button type="button" data-cad-view="out" aria-label="缩小CAD预览">−</button><button type="button" data-cad-view="reset">重置视图</button><button type="button" data-cad-view="all">全选</button><button type="button" data-cad-view="none">清空</button></div><svg viewBox="0 0 560 400" aria-label="CAD导入轮廓预览，可拖动框选截面" role="img" tabindex="0">${info.components.map((c,n)=>`<path data-preview="${n}" class="${c.valid?'':'invalid'}" d="${c.curves.map(v=>Array.from({length:v[0]===1?33:2},(_,j)=>{const[x,y]=point(v,j/(v[0]===1?32:1));return `${j?'L':'M'}${originX+(x-minX)*zoom} ${originY-(y-minY)*zoom}`;}).join(' ')).join(' ')}"/>`).join('')}<rect class="cad-window-box" style="display:none" pointer-events="none"/></svg><p class="cad-preview-controls">拖框选择 · 滚轮缩放 · 中键平移</p><p class="cad-window-status" role="status">框选会替换当前勾选；请将截面外边界与孔洞一并框入。</p>`;preview.dataset.mode='box';
  }else dialog.querySelector('#cad-preview').textContent='未找到可预览的二维直线或圆弧';
  dialog.querySelector('#cad-review').hidden=false;refresh();
 }
 return async(file,target)=>{
  const token=++sequence;state=null;drag=null;
  dialog.querySelector('#cad-review').hidden=true;dialog.querySelector('#cad-apply').disabled=true;
  dialog.querySelector('#cad-status').textContent=/\.dwg$/i.test(file.name)?'正在在线将DWG转换为DXF…':'正在读取DXF…';
  if(!dialog.open)dialog.showModal();
  try{
   if(file.size>10_000_000)throw Error('CAD文件不得超过10 MB，请仅导出所需截面');
   let text,conversion=null;
   if(/\.dwg$/i.test(file.name)){
    const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const base=serviceURL('cad','');
    const response=await fetch(base+'/api/cad/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,data:btoa(binary)})});
    if(!response.headers.get('Content-Type')?.includes('application/json'))throw Error('DWG转换服务响应格式无效');
    conversion=await response.json();if(!response.ok)throw Error(conversion.error||'DWG转换失败');text=conversion.dxf;
    if(base)for(const key of ['dxf_url','log_url'])conversion[key]=base+conversion[key];
   }else text=await file.text();
   if(token!==sequence)return;
   review(text,file.name,target,conversion);
  }catch(e){if(token===sequence)dialog.querySelector('#cad-status').textContent='导入失败：'+e.message;}
 };
}
