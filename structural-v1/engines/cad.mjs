// Green boundary integrals on lines and actual circular arcs, with nesting
// signs for holes. No screenshot dimensions and no rectangle approximation.
const GN=[.019855071751231912,.10166676129318664,.2372337950418355,.4082826787521751,.5917173212478248,.7627662049581645,.8983332387068134,.9801449282487681];
const GW=[.05061426814518853,.11119051722668721,.15685332293894352,.18134189168918088,.18134189168918088,.15685332293894352,.11119051722668721,.05061426814518853];
export function point(c,t){if(c[0]===0)return[c[1]+t*(c[3]-c[1]),c[2]+t*(c[4]-c[2]),c[3]-c[1],c[4]-c[2]];const a=c[4]+c[5]*t;return[c[1]+c[3]*Math.cos(a),c[2]+c[3]*Math.sin(a),-c[3]*c[5]*Math.sin(a),c[3]*c[5]*Math.cos(a)];}
const inside=(p,v)=>{let yes=false;for(let i=0,j=v.length-1;i<v.length;j=i++){const a=v[i],b=v[j],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));if(Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<1e-4)return false;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
function reverse(c){return c[0]===0?[0,c[3],c[4],c[1],c[2],0]:[1,c[1],c[2],c[3],c[4]+c[5],-c[5]];}
export function cadSection(data,E=206000){
 if(data.units!=='mm')throw Error('导入前请确认 CAD 轮廓单位为 mm');
 const loops=data.curve_loops;if(!Array.isArray(loops)||!loops.length||loops.length>100)throw Error('需要有效闭合轮廓');
 let count=0;
 const outlines=loops.map(loop=>{if(!Array.isArray(loop)||!loop.length)throw Error('轮廓为空');const v=[];for(let k=0;k<loop.length;k++){const c=loop[k];if(c.length!==6||!c.every(Number.isFinite)||![0,1].includes(c[0]))throw Error('轮廓段格式错误');if(c[0]===1&&(c[3]<=0||Math.abs(c[5])>2*Math.PI+1e-8))throw Error('圆弧参数错误');if(Math.hypot(...point(c,1).slice(0,2).map((x,j)=>x-point(loop[(k+1)%loop.length],0)[j]))>1e-5)throw Error('轮廓不闭合或端点未连接');const n=c[0]===1?Math.max(8,Math.ceil(Math.abs(c[5])*32)):1;for(let j=0;j<n;j++)v.push(point(c,j/n).slice(0,2));}count+=v.length;return v;});
 if(count>5000)throw Error('轮廓超过 5000 个检查采样点，请先简化 CAD');
 // Reject intersecting loops and self intersections. Shared endpoints within
 // a loop are legal only for adjacent segments.
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 for(let l=0;l<outlines.length;l++)for(let k=0;k<=l;k++){const a=outlines[l],b=outlines[k];for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){if(l===k&&(j<=i||j===i+1||i===0&&j===a.length-1))continue;const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];const dx=q[0]-p[0],dy=q[1]-p[1],ex=s[0]-r[0],ey=s[1]-r[1],den=dx*ey-dy*ex;if(Math.abs(den)<1e-12)continue;const t=((r[0]-p[0])*ey-(r[1]-p[1])*ex)/den,u=((r[0]-p[0])*dy-(r[1]-p[1])*dx)/den,et=1e-4/Math.max(1e-12,Math.hypot(dx,dy)),eu=1e-4/Math.max(1e-12,Math.hypot(ex,ey));if(t>et&&t<1-et&&u>eu&&u<1-eu)throw Error('轮廓存在自交或相交，请先清理 CAD');}}
 const totals=Array(6).fill(0),normalized=[];
 for(let il=0;il<loops.length;il++){
  const depth=outlines.reduce((s,v,j)=>s+(j!==il&&inside(outlines[il][0],v)?1:0),0),s=Array(6).fill(0);
  for(const c of loops[il]){const parts=c[0]===1?Math.max(1,Math.ceil(Math.abs(c[5])/(Math.PI/2))):1;for(let p=0;p<parts;p++)for(let j=0;j<8;j++){const[x,y,dx,dy]=point(c,(p+GN[j])/parts),w=GW[j]/parts;const term=[(x*dy-y*dx)/2,x*x*dy/2,-y*y*dx/2,-(y**3)*dx/3,x**3*dy/3,x*x*y*dy/2];for(let k=0;k<6;k++)s[k]+=w*term[k];}}
  if(Math.abs(s[0])<1e-8)throw Error('轮廓面积为零');const sign=(depth%2?-1:1)*Math.sign(s[0]);for(let k=0;k<6;k++)totals[k]+=s[k]*sign;normalized.push({curves:loops[il],sign});
 }
 const[A,sx,sy,ix0,iy0,ixy0]=totals;if(!(A>0&&E>0))throw Error('净面积及参考 E 必须为正');const cx=sx/A,cy=sy/A,Ix=ix0-A*cy**2,Iy=iy0-A*cx**2,Ixy=ixy0-A*cx*cy;
 const extrema=[];for(const loop of loops)for(const c of loop){extrema.push(point(c,0),point(c,1));if(c[0]===1)for(let k=-8;k<=8;k++){const a=k*Math.PI/2,t=(a-c[4])/c[5];if(t>0&&t<1)extrema.push(point(c,t));}}
 const xmin=Math.min(...extrema.map(p=>p[0])),xmax=Math.max(...extrema.map(p=>p[0])),ymin=Math.min(...extrema.map(p=>p[1])),ymax=Math.max(...extrema.map(p=>p[1]));
 let Sx=0;for(const{curves,sign}of normalized)for(const c of curves)for(let j=0;j<32;j++)for(let k=0;k<8;k++){const[x,y,dx]=point(c,(j+GN[k])/32);Sx-=sign*GW[k]/32*Math.max(y-cy,0)**2*dx/2;}
 return{A,Aeq:A,cx,cy,Ix,Iy,Ixy,E,EIx:E*Ix,EIy:E*Iy,WxTop:Ix/(ymax-cy),WxBottom:Ix/(cy-ymin),WyLeft:Iy/(cx-xmin),WyRight:Iy/(xmax-cx),Sx,rects:[],outlines,bounds:{xmin,xmax,ymin,ymax},coupled:Math.abs(Ixy)>1e-8*Math.sqrt(Ix*Iy),source:data.source||'导入轮廓',torsion:null};
}
function bulge(a,b,value){if(Math.abs(value)<1e-12)return[0,...a,...b,0];const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length)throw Error('重复顶点');const cx=(a[0]+b[0])/2-dy*(1-value*value)/(4*value),cy=(a[1]+b[1])/2+dx*(1-value*value)/(4*value);return[1,cx,cy,length*(1+value*value)/(4*Math.abs(value)),Math.atan2(a[1]-cy,a[0]-cx),4*Math.atan(value)];}

function readDXF(text){
 const lines=text.replace(/\r/g,'').split('\n');if(lines[0]?.includes('AutoCAD Binary'))throw Error('请导出 ASCII DXF');const pairs=[];for(let i=0;i+1<lines.length;i+=2){const code=Number(lines[i].trim());if(!Number.isFinite(code))throw Error('DXF组码无效');pairs.push([code,lines[i+1].trim()]);}
 const u=pairs.findIndex(([c,v])=>c===9&&v==='$INSUNITS'),unit=u>=0?Number(pairs[u+1]?.[1]):0;
 let section='',entity=null;const entities=[];
 for(let i=0;i<pairs.length;i++){const[c,v]=pairs[i];if(c===0&&v==='SECTION'){section=pairs[i+1]?.[1];continue;}if(section!=='ENTITIES')continue;if(c===0){if(entity)entities.push(entity);entity=v==='ENDSEC'?null:{type:v,pairs:[],key:String(entities.length)};if(v==='ENDSEC')section='';}else if(entity)entity.pairs.push([c,v]);}
 if(entities.length>2000)throw Error('图中对象超过2000个，请在CAD中仅导出所需截面');
 return{unit,entities};
}
const ignoredDXF=new Set(['TEXT','MTEXT','DIMENSION','POINT']);
function entityCurves(ent){
 const p=ent.pairs,get=(c,def=0)=>Number(p.find(a=>a[0]===c)?.[1]??def);
 if(ignoredDXF.has(ent.type))return[];
 if(!['LINE','ARC','CIRCLE','LWPOLYLINE'].includes(ent.type))throw Error(`未处理的 ${ent.type}，请炸开块或转换为二维直线、圆弧边界`);
 if([30,31,38,210,220].some(c=>Math.abs(get(c))>1e-8)||get(230,1)!==1)throw Error('仅支持 XY 平面、法向 +Z 的二维轮廓');
 if(ent.type==='LINE')return[[0,get(10),get(20),get(11),get(21),0]];
 if(ent.type==='ARC'){let a=get(50)*Math.PI/180,b=get(51)*Math.PI/180;while(b<=a)b+=2*Math.PI;return[[1,get(10),get(20),get(40),a,b-a]];}
 if(ent.type==='CIRCLE')return[[1,get(10),get(20),get(40),0,2*Math.PI]];
 const vertices=[],edges=[];for(const[c,v]of p){if(c===10)vertices.push({p:[Number(v),0],bulge:0});if(c===20&&vertices.length)vertices.at(-1).p[1]=Number(v);if(c===42&&vertices.length)vertices.at(-1).bulge=Number(v);if([40,41,43].includes(c)&&Number(v)!==0)throw Error('带线宽多段线请先转为实体边界');}
 for(let j=0;j<vertices.length-1;j++)edges.push(bulge(vertices[j].p,vertices[j+1].p,vertices[j].bulge));if(get(70)&1&&vertices.length)edges.push(bulge(vertices.at(-1).p,vertices[0].p,vertices.at(-1).bulge));return edges;
}
function curvesToLoops(edges){
 const loops=[];while(edges.length){const loop=[edges.shift()];while(Math.hypot(...point(loop.at(-1),1).slice(0,2).map((x,j)=>x-point(loop[0],0)[j]))>1e-5){const end=point(loop.at(-1),1),matches=[];edges.forEach((c,n)=>{if(Math.hypot(end[0]-point(c,0)[0],end[1]-point(c,0)[1])<1e-5)matches.push([n,c]);else if(Math.hypot(end[0]-point(c,1)[0],end[1]-point(c,1)[1])<1e-5)matches.push([n,reverse(c)]);});if(matches.length!==1)throw Error('边界不闭合或存在分叉，请先清理 CAD');const[n,c]=matches[0];edges.splice(n,1);loop.push(c);}loops.push(loop);}
 if(!loops.length)throw Error('DXF 未找到可用的截面轮廓');return loops;
}
export function parseDXF(text,options={}){
 const {unit,entities}=readDXF(text);let scale=options.unitScale;
 if(scale===undefined){if(unit!==4)throw Error('DXF 未明确设置毫米单位，请在 CAD 中确认 INSUNITS=4 并按毫米另存');scale=1;}
 if(!(Number.isFinite(scale)&&scale>0))throw Error('CAD单位换算比例无效');
 const keys=options.keys?new Set(options.keys):null,edges=[];
 for(const ent of entities){if(ent.pairs.some(([c,v])=>c===67&&v==='1')||(keys&&!keys.has(ent.key)))continue;edges.push(...entityCurves(ent));}
 if(edges.length>2000)throw Error('边界超过2000段，请简化CAD截面');
 const loops=curvesToLoops(edges);
 const all=[];for(const loop of loops)for(const c of loop){all.push(point(c,0),point(c,1));if(c[0]===1&&c[5]!==0)for(let k=-8;k<=8;k++){const t=(k*Math.PI/2-c[4])/c[5];if(t>0&&t<1)all.push(point(c,t));}}const x0=Math.min(...all.map(p=>p[0])),y0=Math.min(...all.map(p=>p[1]));for(const loop of loops)for(const c of loop){c[1]=(c[1]-x0)*scale;c[2]=(c[2]-y0)*scale;if(c[0]===0){c[3]=(c[3]-x0)*scale;c[4]=(c[4]-y0)*scale;}else c[3]*=scale;}
 return{units:'mm',curve_loops:loops,source:options.source||'ASCII DXF · XY 平面轮廓'};
}
export function inspectDXF(text){
 const{unit,entities}=readDXF(text),records=[],omitted=[];
 for(const e of entities){const layer=e.pairs.find(([c])=>c===8)?.[1]||'0',handle=e.pairs.find(([c])=>c===5)?.[1]||e.key;if(e.pairs.some(([c,v])=>c===67&&v==='1')){omitted.push({key:e.key,type:e.type,layer,handle,reason:'布局空间对象'});continue;}try{const curves=entityCurves(e);if(curves.length)records.push({key:e.key,type:e.type,layer,handle,curves});else omitted.push({key:e.key,type:e.type,layer,handle,reason:'文字、标注或点'});}catch(error){omitted.push({key:e.key,type:e.type,layer,handle,reason:error.message});}}
 if(records.reduce((n,r)=>n+r.curves.length,0)>2000)throw Error('边界超过2000段，请仅导出所需截面');
 const parent=records.map((_,n)=>n),root=n=>parent[n]===n?n:(parent[n]=root(parent[n])),bins=new Map(),tol=1e-5;
 for(let n=0;n<records.length;n++)for(const c of records[n].curves)for(const t of [0,1]){const[x,y]=point(c,t),bx=Math.floor(x/tol),by=Math.floor(y/tol);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const p of bins.get(`${bx+dx},${by+dy}`)||[])if(Math.hypot(x-p.x,y-p.y)<tol)parent[root(n)]=root(p.n);const key=`${bx},${by}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push({x,y,n});}
 const groups=new Map();records.forEach((r,n)=>{const key=root(n);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);});
 const components=[...groups.values()].map((group,n)=>{const keys=group.map(r=>r.key);let error='';try{cadSection(parseDXF(text,{keys,unitScale:1}));}catch(e){error=e.message;}return{id:n,keys,handles:group.map(r=>r.handle),layers:[...new Set(group.map(r=>r.layer))],curves:group.flatMap(r=>r.curves),valid:!error,error};});
 return{unit,components,omitted,entities:entities.length};
}
