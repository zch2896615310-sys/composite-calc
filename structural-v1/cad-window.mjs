import {point} from './engines/cad.mjs?window=1';

// Bounds include circular-arc extrema, not just sampled vertices/endpoints.
export function curveBounds(curves){
 const points=[];
 for(const c of curves){
  points.push(point(c,0),point(c,1));
  if(c[0]===1&&c[5]!==0)for(let k=-8;k<=8;k++){
   const t=(k*Math.PI/2-c[4])/c[5];if(t>0&&t<1)points.push(point(c,t));
  }
 }
 if(!points.length||points.some(p=>!p.slice(0,2).every(Number.isFinite)))throw Error('轮廓坐标无效');
 return {xmin:Math.min(...points.map(p=>p[0])),xmax:Math.max(...points.map(p=>p[0])),
         ymin:Math.min(...points.map(p=>p[1])),ymax:Math.max(...points.map(p=>p[1]))};
}

export function windowComponents(components,box){
 if(!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite))throw Error('框选范围无效');
 const bounds={xmin:Math.min(box[0],box[2]),ymin:Math.min(box[1],box[3]),xmax:Math.max(box[0],box[2]),ymax:Math.max(box[1],box[3])};
 if(bounds.xmin===bounds.xmax||bounds.ymin===bounds.ymax)throw Error('请拖出有宽度和高度的选框');
 const selected=[],partial=[],invalid=[];
 for(const c of components){
  let b;try{b=curveBounds(c.curves);}catch{continue;}
  const overlaps=b.xmin<=bounds.xmax&&b.xmax>=bounds.xmin&&b.ymin<=bounds.ymax&&b.ymax>=bounds.ymin;
  const contained=b.xmin>=bounds.xmin&&b.xmax<=bounds.xmax&&b.ymin>=bounds.ymin&&b.ymax<=bounds.ymax;
  if(!c.valid){if(overlaps)invalid.push(c.id);continue;}
  if(contained)selected.push(c.id);else if(overlaps)partial.push(c.id);
 }
 return{bounds,selected,partial,invalid};
}
