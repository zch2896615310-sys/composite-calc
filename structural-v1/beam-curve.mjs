import {fmt} from './ui.mjs?calculix-checks=19';

const valueAt=(c,t)=>c.reduceRight((v,a)=>v*t+a,0);
export function beamCurveData(result,key,core=globalThis){
 const scale=key==='M'?1e-6:key==='V'?1e-3:-1;
 const elements=result.elements.map(e=>({a:e.a,b:e.b,c:e[key].map(v=>v*scale)}));
 const candidates=elements.flatMap(e=>[0,1,...core.roots(core.deriv(e.c),0,1)].map(t=>({x:e.a+(e.b-e.a)*t,value:valueAt(e.c,t)})));
 const max=Math.max(...candidates.map(p=>Math.abs(p.value))),tol=Math.max(1e-12,max*1e-8);
 const peaks=candidates.filter(p=>Math.abs(Math.abs(p.value)-max)<=tol).sort((a,b)=>a.x-b.x).filter((p,j,a)=>!j||Math.abs(p.x-a[j-1].x)>result.model.H*1e-9||Math.abs(p.value-a[j-1].value)>tol);
 return {elements,peaks:max<1e-12?[{x:0,value:0}]:peaks,max};
}

// Boundary values come from both adjacent elements, never interpolate a jump.
export function probeBeamCurve(elements,x){
 const H=elements.at(-1).b,tol=H*1e-9;
 const matches=elements.filter(e=>x>=e.a-tol&&x<=e.b+tol);
 const values=matches.map(e=>valueAt(e.c,Math.max(0,Math.min(1,(x-e.a)/(e.b-e.a)))));
 const same=values.length<2||Math.abs(values[0]-values.at(-1))<=Math.max(1e-10,...values.map(v=>Math.abs(v)*1e-8));
 return same?[{side:'',value:values[0]}]:[{side:'左侧',value:values[0]},{side:'右侧',value:values.at(-1)}];
}

export function setupBeamCurveHover(){
 const cache=new WeakMap();
 const hide=svg=>svg?.querySelector('.curve-probe')?.setAttribute('visibility','hidden');
 document.addEventListener('pointerout',event=>{const svg=event.target.closest?.('svg[data-curve-probe]');if(svg&&!svg.contains(event.relatedTarget))hide(svg);});
 document.addEventListener('pointermove',event=>{
  const svg=event.target.closest?.('svg[data-curve-probe]');if(!svg)return;
  let data=cache.get(svg);if(!data){data=JSON.parse(svg.dataset.curveProbe);cache.set(svg,data);}
  const matrix=svg.getScreenCTM();if(!matrix)return;
  const pt=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
  if(pt.x<data.left||pt.x>data.right||pt.y<0||pt.y>101){hide(svg);return;}
  const H=data.elements.at(-1).b;
  let x=(pt.x-data.left)/(data.right-data.left)*H;
  const boundary=data.elements.flatMap(e=>[e.a,e.b]).reduce((a,b)=>Math.abs(b-x)<Math.abs(a-x)?b:a,0);
  if(Math.abs(boundary-x)/H*(data.right-data.left)<3)x=boundary;
  const values=probeBeamCurve(data.elements,x),px=data.left+x/H*(data.right-data.left),g=svg.querySelector('.curve-probe');
  g.setAttribute('visibility','visible');
  const line=g.querySelector('line');line.setAttribute('x1',px);line.setAttribute('x2',px);
  g.querySelectorAll('circle').forEach((circle,j)=>{const p=values[j];circle.setAttribute('visibility',p?'inherit':'hidden');if(p){circle.setAttribute('cx',px);circle.setAttribute('cy',data.zero-p.value/data.max*data.amplitude);}});
  const lines=[`x = ${fmt(x,2)} mm`,...values.map(p=>`${data.key}${p.side?'（'+p.side+'）':''} = ${fmt(p.value,5)} ${data.unit}`)];
  const box=g.querySelector('.curve-probe-box'),w=Math.min(data.right-data.left,Math.max(...lines.map(s=>s.length))*7+22),bx=Math.max(data.left,Math.min(data.right-w,px+12));
  box.setAttribute('transform',`translate(${bx},${pt.y>50?3:52})`);
  const rect=box.querySelector('rect');rect.setAttribute('width',w);rect.setAttribute('height',lines.length*16+12);
  box.querySelectorAll('text').forEach((text,j)=>{text.textContent=lines[j]||'';text.setAttribute('y',19+j*16);});
 });
}
