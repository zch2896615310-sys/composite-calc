// Rectangle assembly follows the original transformed-section method.
// Geometry is represented once and shared by drawing, stiffness and reports.
import {cadSection} from './cad.mjs';
export function positive(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw Error(`${name}必须为正数`);
  return v;
}
export function finite(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw Error(`${name}必须为有限数值`);
  return v;
}
export function section(input) {
  if(input.shape==='cad')return cadSection(input.cad,input.E);
  const {shape, h, b, tw, tf} = input;
  const E = positive(input.E, '参考弹性模量 E');
  let rects = [];
  const rect = (x, y, w, t, e = E) => ({x, y, b:w, h:t, E:e});
  if (['h','box','channel','angle','rect'].includes(shape)) {
    positive(h,'截面高度'); positive(b,'截面宽度');
    if (shape === 'rect') rects = [rect(0,0,b,h)];
    else {
      positive(tw,'腹板厚度');
      if (tw >= b) throw Error('腹板厚度必须小于截面宽度');
      if (shape === 'angle') {
        if(tw >= h) throw Error('角钢厚度必须小于高度');
        rects = [rect(0,0,tw,h),rect(tw,0,b-tw,tw)];
      } else {
        positive(tf,'翼缘厚度');
        if(2*tf >= h || (shape === 'box' && 2*tw >= b)) throw Error('壁厚使截面内部尺寸小于或等于零');
        rects = [rect(0,0,b,tf),rect(0,h-tf,b,tf)];
        if(shape === 'box') rects.push(rect(0,tf,tw,h-2*tf),rect(b-tw,tf,tw,h-2*tf));
        else rects.push(rect(shape === 'h' ? (b-tw)/2 : 0,tf,tw,h-2*tf));
      }
    }
  } else if(shape === 'layers') {
    positive(b,'截面宽度');
    let y=0;
    if(!input.layers?.length) throw Error('至少需要一层材料');
    rects = input.layers.map((l,i) => {const t=positive(l.t,`第${i+1}层厚度`); const r=rect(0,y,b,t,positive(l.E,`第${i+1}层 E`)); y+=t; return r;});
  } else if(shape === 'custom') {
    if(!input.rects?.length || input.rects.length>100) throw Error('需要 1–100 个矩形');
    rects = input.rects.map((r,i) => rect(finite(r.x,'x'),finite(r.y,'y'),positive(r.b,'宽度'),positive(r.h,'高度'),positive(r.E,`矩形${i+1}的E`)));
    for(let i=0;i<rects.length;i++) for(let j=0;j<i;j++) {
      const a=rects[i],b=rects[j];
      if(Math.min(a.x+a.b,b.x+b.b)>Math.max(a.x,b.x)+1e-8 && Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)+1e-8) throw Error(`矩形 ${j+1} 与 ${i+1} 重叠，请拆成无重叠区域`);
    }
  } else throw Error('未知截面类型');
  const A=rects.reduce((s,r)=>s+r.b*r.h,0);
  const EA=rects.reduce((s,r)=>s+r.E*r.b*r.h,0);
  const cx=rects.reduce((s,r)=>s+r.E*r.b*r.h*(r.x+r.b/2),0)/EA;
  const cy=rects.reduce((s,r)=>s+r.E*r.b*r.h*(r.y+r.h/2),0)/EA;
  let EIx=0,EIy=0,EIxy=0;
  rects.forEach(r=> {const a=r.b*r.h;EIx+=r.E*(r.b*r.h**3/12+a*(r.y+r.h/2-cy)**2);EIy+=r.E*(r.h*r.b**3/12+a*(r.x+r.b/2-cx)**2);EIxy+=r.E*a*(r.x+r.b/2-cx)*(r.y+r.h/2-cy);});
  const xmin=Math.min(...rects.map(r=>r.x)), xmax=Math.max(...rects.map(r=>r.x+r.b)), ymin=Math.min(...rects.map(r=>r.y)), ymax=Math.max(...rects.map(r=>r.y+r.h));
  const Ix=EIx/E,Iy=EIy/E,Ixy=EIxy/E;
  return {A,Aeq:EA/E,cx,cy,Ix,Iy,Ixy,EIx,EIy,E,WxTop:Ix/(ymax-cy),WxBottom:Ix/(cy-ymin),WyLeft:Iy/(cx-xmin),WyRight:Iy/(xmax-cx),rects,bounds:{xmin,xmax,ymin,ymax},coupled:Math.abs(Ixy)>1e-9*Math.sqrt(Ix*Iy)};
}
