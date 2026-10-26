// The existing model text stays the persistence/solver contract. This adapter
// changes its editing surface without replacing the verified beam solver.
export const beamNodes=s=>s.spans.reduce((a,l)=>(a.push(a.at(-1)+l),a),[0]);
export function positionValue(token,s,core=globalThis){return core.position(String(token),beamNodes(s));}
export function positionParts(token){
 if(token==='L')return{kind:'end'};
 let m;if((m=/^N(\d+)$/.exec(token)))return{kind:'node',node:+m[1]};
 if((m=/^S(\d+):(.+)$/.exec(token)))return{kind:'segment',segment:+m[1],fraction:+m[2]*100};
 if(token.endsWith('%'))return{kind:'percent',percent:+token.slice(0,-1)};
 return{kind:'absolute',mm:+token};
}
export function readBeamEditor(text,core=globalThis){
 const parsed=core.parseModel(text),lines=text.replace(/\r/g,'').split('\n'),fields={},udl=[],points=[];
 for(const line of lines.slice(1)){if(!line.trim())continue;const at=line.indexOf('='),k=line.slice(0,at).trim(),v=line.slice(at+1).trim();if(k==='均布'||k==='集中'){
  if(v==='无')continue;const a=v.split(/[,，]/).map(s=>s.trim()),ref=k==='均布'?'q':'P',mag=core.magnitude(a.at(-1),ref,k==='均布'?1:1000);
  const load={reference:!!mag[0],value:mag[0]?mag[1]:mag[1]/(k==='均布'?1:1000)};
  if(k==='均布')udl.push({...load,start:a[0],end:a[1]});else points.push({...load,position:a[0]});
 }else fields[k]=v;}
 const s={title:lines[0].trim(),spans:[...parsed.lengths],supports:[],udl,points,factor:parsed.factor,weightOn:fields['自重']==='计入',weightFactor:Number(fields['自重系数']||1.2)};
 s.supports=fields['支点'].split(/[,，]/).map(position=>({position:position.trim()})).sort((a,b)=>positionValue(a.position,s,core)-positionValue(b.position,s,core)).map((a,j)=>({...a,transfer:!!parsed.transfer[j]}));
 return s;
}
// Resolve historical P multipliers at the editing boundary. The stored model
// remains readable by the original solver, while point-load editing uses kN.
export function directPointLoads(s,P){
 const next=structuredClone(s);
 for(const load of next.points){
  if(load.reference){
   const value=load.value*P;
   if(!Number.isFinite(value))throw Error('集中荷载数值无效');
   load.value=value;
  }
  load.reference=false;
 }
 return next;
}
export function writeBeamEditor(s,core=globalThis){
 if(s.weightOn)throw Error('请先将原模型自重改为明确的均布荷载，避免改变原有取值');
 const supports=s.supports.map(x=>({...x,x:positionValue(x.position,s,core)})).sort((a,b)=>a.x-b.x),transfers=supports.flatMap((a,j)=>a.transfer?[j+1]:[]);
 if(!transfers.length)throw Error('至少选择一个传力支点');
 const magnitude=(l,ref)=>l.reference?`${ref}*${l.value}`:String(l.value);
 const lines=[s.title,'段长 = '+s.spans.join(',')+'mm','支点 = '+supports.map(a=>a.position).join(',')];
 lines.push(...(s.udl.length?s.udl.map(l=>`均布 = ${l.start},${l.end},${magnitude(l,'q')}`):['均布 = 无']));
 lines.push(...(s.points.length?s.points.map(l=>`集中 = ${l.position},${magnitude(l,'P')}`):['集中 = 无']));
 lines.push('传力支点 = '+(transfers.length===supports.length?'全部':transfers.join(',')),'悬挑系数 = '+s.factor,'自重 = 不计','自重系数 = '+s.weightFactor);
 const text=lines.join('\n');core.parseModel(text);return text;
}
export function setBeamPosition(token,part,value){
 const p=positionParts(token);
 if(part==='kind')return({node:'N0',segment:'S1:50',absolute:'0',percent:'50%',end:'L'})[value].replace('S1:50','S1:0.5');
 p[part]=Number(value);
 return p.kind==='node'?`N${p.node}`:p.kind==='segment'?`S${p.segment}:${p.fraction/100}`:p.kind==='percent'?`${p.percent}%`:p.kind==='end'?'L':String(p.mm);
}
export function changePositionKind(token,kind,s,core=globalThis){
 const x=positionValue(token,s,core),nodes=beamNodes(s),H=nodes.at(-1);
 if(kind==='absolute')return String(x);
 if(kind==='percent')return`${x/H*100}%`;
 if(kind==='end')return'L';
 if(kind==='node'){let n=0;nodes.forEach((v,j)=>{if(Math.abs(v-x)<Math.abs(nodes[n]-x))n=j;});return'N'+n;}
 const j=Math.max(0,nodes.findIndex((v,k)=>k<nodes.length-1&&x>=v&&x<=nodes[k+1]));return`S${j+1}:${(x-nodes[j])/s.spans[j]}`;
}
export function moveBeamHandle(s,type,index,x,core=globalThis){
 const next=structuredClone(s),nodes=beamNodes(s),H=nodes.at(-1);x=Math.round(x);
 if(type==='node'){
  if(index<1||index>next.spans.length)throw Error('左端位置固定');
  x=Math.max(nodes[index-1]+1,Math.min(index<next.spans.length?nodes[index+1]-1:1e7,x));
  next.spans[index-1]=x-nodes[index-1];if(index<next.spans.length)next.spans[index]=nodes[index+1]-x;
 }else{
  x=Math.max(0,Math.min(H,x));
  if(type==='support')next.supports[index].position=String(x);
  if(type==='point')next.points[index].position=String(x);
  if(type==='udl-start')next.udl[index].start=String(x);
  if(type==='udl-end')next.udl[index].end=String(x);
 }
 writeBeamEditor(next,core);return next;
}
export function removeBeamSpan(s,index,core=globalThis){
 if(s.spans.length<=1)throw Error('至少保留一段梁');
 const next=structuredClone(s),nodes=beamNodes(s),start=nodes[index],end=nodes[index+1],delta=end-start;
 const remap=token=>{const p=positionParts(token);if(p.kind==='node')return`N${p.node>index?p.node-1:p.node}`;if(p.kind==='end')return'L';if(p.kind==='segment'&&p.segment!==index+1)return`S${p.segment>index+1?p.segment-1:p.segment}:${p.fraction/100}`;const x=positionValue(token,s,core);return String(x<=start?x:x>=end?x-delta:start);};
 next.spans.splice(index,1);next.supports=next.supports.map(a=>({...a,position:remap(a.position)}));
 const unique=new Map();for(const a of next.supports){const x=positionValue(a.position,next,core),prior=unique.get(x);if(prior)prior.transfer||=a.transfer;else unique.set(x,a);}next.supports=[...unique.values()];
 next.points=next.points.filter(a=>{const x=positionValue(a.position,s,core);return x<=start||x>=end;}).map(a=>({...a,position:remap(a.position)}));
 next.udl=next.udl.map(a=>({...a,start:remap(a.start),end:remap(a.end)})).filter(a=>positionValue(a.end,next,core)>positionValue(a.start,next,core));
 writeBeamEditor(next,core);return next;
}
