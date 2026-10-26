import {positive,finite} from './section.mjs';
// beam-source.js is an unchanged copy of the verified Mathcad ES3 source.
// It is loaded as a classic script. The adapter exposes structured IO only.
export function beam(input, upstream, core=globalThis, loadResult=null) {
  if(input.sectionId && !upstream) throw Error('引用的截面不存在，请重新选择截面或改为手动输入');
  if(upstream?.coupled) throw Error('该截面 Ixy 不为零，当前单轴梁不支持耦合弯曲；请选择对称截面或使用手动主轴刚度');
  const E=upstream?upstream.E:input.E;
  const I=upstream?(input.axis==='y'?upstream.Iy:upstream.Ix):input.I;
  positive(E,'弹性模量');positive(I,'惯性矩');positive(input.ratio,'挠度限值分母');
  const text=input.model;
  if(typeof text!=='string' || text.length>20000) throw Error('梁模型文本无效');
  finite(input.q,'均布荷载参考值');finite(input.P,'集中力参考值');
  const model=core.decode(core.parseModel(text).values);
  if(model.weightOn)throw Error('当前模块自重请以明确的均布荷载输入，并将“自重”设为“不计”');
  // The Mathcad kernel receives reference P in N; the workbench uses kN.
  const q=loadResult?loadResult[input.loadField||'qELine']:input.q;
  finite(q,'引用均布荷载');
  const solved=core.solveBeam(model,E,I,q,input.P*1000,input.ratio,0);
  const samples=[];
  for(const el of solved.elements) for(let i=0;i<=40;i++) {const t=i/40; samples.push({x:el.a+(el.b-el.a)*t,M:core.poly(el.M,t)/1e6,V:core.poly(el.V,t)/1000,u:-core.poly(el.u,t)});}
  return {E,I,q,model,...solved,samples,M:solved.header[3]/1e6,V:solved.header[4]/1000,u:solved.header[5],R:solved.header[6]/1000,utilization:solved.header[8],forceResidual:solved.header[11],momentResidual:solved.header[12]};
}
