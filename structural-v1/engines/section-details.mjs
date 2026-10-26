import {point} from './cad.mjs';

const nodes=[.019855071751231912,.10166676129318664,.2372337950418355,.4082826787521751,.5917173212478248,.7627662049581645,.8983332387068134,.9801449282487681];
const weights=[.05061426814518853,.11119051722668721,.15685332293894352,.18134189168918088,.18134189168918088,.15685332293894352,.11119051722668721,.05061426814518853];
function inPolygon(p,poly){let yes=false;for(let n=0,j=poly.length-1;n<poly.length;j=n++){const a=poly[n],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
function integral(curve,fn,cuts=[]){
 const split=[0,1,...cuts.filter(t=>t>0&&t<1)];
 if(curve[0]===1)for(let n=1;n<Math.ceil(Math.abs(curve[5])/(Math.PI/2));n++)split.push(n/Math.ceil(Math.abs(curve[5])/(Math.PI/2)));
 split.sort((a,b)=>a-b);let sum=0;
 for(let n=1;n<split.length;n++){const a=split[n-1],b=split[n];for(let j=0;j<8;j++)sum+=weights[j]*(b-a)*fn(...point(curve,a+(b-a)*nodes[j]));}
 return sum;
}
function axisCrossings(c,axis,center){
 if(c[0]===0){const a=c[axis===0?1:2],b=c[axis===0?3:4];return b===a?[]:[(center-a)/(b-a)];}
 const v=(center-c[axis===0?1:2])/c[3];if(Math.abs(v)>1)return[];
 const angle=axis===0?Math.acos(v):Math.asin(v),angles=axis===0?[angle,-angle]:[angle,Math.PI-angle],cuts=[];
 for(const a of angles)for(let k=-4;k<=4;k++)cuts.push((a+2*Math.PI*k-c[4])/c[5]);
 return cuts;
}
function cadStatic(input,r){
 let Sx=0,Sy=0;
 input.cad.curve_loops.forEach((loop,n)=>{
  const depth=r.outlines.reduce((sum,p,j)=>sum+(j!==n&&inPolygon(r.outlines[n][0],p)?1:0),0);
  const area=loop.reduce((sum,c)=>sum+integral(c,(x,y,dx,dy)=>(x*dy-y*dx)/2),0),sign=(depth%2?-1:1)*Math.sign(area);
  for(const c of loop){Sx+=sign*integral(c,(x,y,dx)=>-(Math.max(y-r.cy,0)**2)*dx/2,axisCrossings(c,1,r.cy));Sy+=sign*integral(c,(x,y,dx,dy)=>Math.max(x-r.cx,0)**2*dy/2,axisCrossings(c,0,r.cx));}
 });
 return{Sx:Math.max(0,Sx),Sy:Math.max(0,Sy)};
}

// Presentation properties: the existing stiffness/beam calculation result is
// left intact. Composite radii and statical moments use the reference E.
export function sectionDetails(input,r){
 const b=r.bounds,left=r.cx-b.xmin,right=b.xmax-r.cx,top=b.ymax-r.cy,bottom=r.cy-b.ymin;
 let Sx=0,Sy=0,gx=r.cx,gy=r.cy;
 if(input.shape==='cad')({Sx,Sy}=cadStatic(input,r));
 else{
  gx=r.rects.reduce((sum,a)=>sum+a.b*a.h*(a.x+a.b/2),0)/r.A;
  gy=r.rects.reduce((sum,a)=>sum+a.b*a.h*(a.y+a.h/2),0)/r.A;
  for(const a of r.rects){const n=a.E/r.E,y0=Math.max(a.y,r.cy),y1=a.y+a.h,x0=Math.max(a.x,r.cx),x1=a.x+a.b;
   if(y1>y0)Sx+=n*a.b*((y1-r.cy)**2-(y0-r.cy)**2)/2;
   if(x1>x0)Sy+=n*a.h*((x1-r.cx)**2-(x0-r.cx)**2)/2;
  }
 }
 const radius=Math.hypot(r.Ix-r.Iy,2*r.Ixy)/2,I1=(r.Ix+r.Iy)/2+radius,I2=(r.Ix+r.Iy)/2-radius;
 const angle=radius<=1e-10*(r.Ix+r.Iy)?null:Math.atan2(-2*r.Ixy,r.Ix-r.Iy)/2;
 const multi=input.shape!=='cad'&&r.rects.some(a=>Math.abs(a.E-r.E)>1e-6);
 return{Ip:r.Ix+r.Iy,ix:Math.sqrt(r.Ix/r.Aeq),iy:Math.sqrt(r.Iy/r.Aeq),Sx,Sy,left,right,top,bottom,I1,I2,angle:angle===null?null:angle*180/Math.PI,
  axis1:angle===null?null:[Math.cos(angle),Math.sin(angle)],axis2:angle===null?null:[-Math.sin(angle),Math.cos(angle)],
  gx:gx-b.xmin,gy:gy-b.ymin,centerX:left,centerY:bottom,width:b.xmax-b.xmin,height:b.ymax-b.ymin,multi};
}
