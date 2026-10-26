import {esc,fmt,select} from './ui.mjs?calculix-checks=19';
const caseNames={
 DEAD:'自重工况',
 EQ_Y:'Y向地震工况（板面法向）',
 EQ_X:'X向地震工况（板内水平）',
 qe:'地震作用组合（Y向＋X向）',
 ULS:'承载能力极限状态（地震正号组合）',
 SLS:'正常使用极限状态（地震正号组合）',
 ULS_MINUS:'承载能力极限状态（地震反号组合）',
 SLS_MINUS:'正常使用极限状态（地震反号组合）'
};
export const quantities=[['uy','位移 UY / mm'],['principal3','三维最大主应力 / MPa'],['shear_transverse','横向剪应力合值 / MPa'],['smax','面内最大主应力 / MPa'],['mises','面内 Mises / MPa'],['mises3','三维 Mises / MPa'],['s11','σ11 / MPa'],['s22','σ22 / MPa'],['s33','σ33 / MPa'],['t12','τ12 / MPa'],['t13','τ13 / MPa'],['t23','τ23 / MPa']];
export function scalar(s,key){const[a,b,c,t,u,v]=s;if(key==='shear_transverse')return Math.hypot(u,v);if(key==='principal3'){const q=(a+b+c)/3,p=Math.sqrt(((a-q)**2+(b-q)**2+(c-q)**2+2*(t*t+u*u+v*v))/6);if(p<1e-30)return q;const A=(a-q)/p,B=(b-q)/p,C=(c-q)/p,T=t/p,U=u/p,V=v/p,det=A*B*C+2*T*U*V-A*V*V-B*U*U-C*T*T;return q+2*p*Math.cos(Math.acos(Math.max(-1,Math.min(1,det/2)))/3);}if(key==='smax')return(a+b)/2+Math.hypot((a-b)/2,t);if(key==='mises')return Math.sqrt(a*a+b*b-a*b+3*t*t);if(key==='mises3')return Math.sqrt(((a-b)**2+(b-c)**2+(c-a)**2)/2+3*(t*t+u*u+v*v));return s[['s11','s22','s33','t12','t13','t23'].indexOf(key)];}
export function contour(result,view={}){
 const d=result.contours;if(!d)return '<p class="hint">该旧算例没有云图场数据，请重新运行以生成彩色云图。</p>';
 const caseName=view.case||'ULS',kind=view.quantity||'smax',il=Number(view.layer||0),f=d.cases[caseName];if(!f)return '';
 const values=d.mesh.map((q,n)=>kind==='uy'?f.front_uy[n]:scalar(f.stress_mean[n],kind));
 const indices=d.mesh.map((q,n)=>n).filter(n=>d.mesh[n][0]===(kind==='uy'?0:il));const vs=indices.map(n=>values[n]),lo=Math.min(...vs),hi=Math.max(...vs),range=hi-lo||1;
 const xs=d.mesh.flatMap(q=>[q[1],q[3]]),zs=d.mesh.flatMap(q=>[q[2],q[4]]),xmin=Math.min(...xs),xmax=Math.max(...xs),zmin=Math.min(...zs),zmax=Math.max(...zs),scale=Math.min(330/(xmax-xmin),430/(zmax-zmin)),left=240-(xmax-xmin)*scale/2,bottom=505;
 const color=v=>`hsl(${240*(1-Math.max(0,Math.min(1,(v-lo)/range)))} 100% 50%)`;
 const cells=indices.map(n=>{const[,x0,z0,x1,z1]=d.mesh[n],v=values[n];return `<rect x="${left+(x0-xmin)*scale}" y="${bottom-(z1-zmin)*scale}" width="${(x1-x0)*scale+.1}" height="${(z1-z0)*scale+.1}" fill="${color(v)}" stroke="${view.mesh==='on'?'#ffffff66':'none'}" stroke-width=".4"><title>${esc(fmt(v,7))} ${kind==='uy'?'mm':'MPa'} · ${d.aggregation?'厚度汇总色块':'单元'} ${n+1}</title></rect>`;}).join('');
 const legend=Array.from({length:16},(_,j)=>`<rect x="510" y="${80+j*25}" width="20" height="25" fill="${color(hi-range*j/15)}"/>${j%3===0||j===15?`<text x="539" y="${88+j*25}" font-size="11" fill="#334">${esc(fmt(hi-(hi-lo)*j/15,6))}</text>`:''}`).join('');
 const supports=result.snapshot.project.supports.map(s=>{const x=left+(s.x-xmin)*scale,z=bottom-(s.z-zmin)*scale;return `<path d="M${x} ${z}l-6 10h12Z" fill="none" stroke="#00854d" stroke-width="1.4"/><circle cx="${x}" cy="${z}" r="2.2" fill="#2357e5"/>`;}).join('');
 const title=`${caseName} / ${kind==='uy'?'Y=0 参考面':result.snapshot.project.layers[il]?.name} / ${quantities.find(q=>q[0]===kind)?.[1]}`;
 return `<div class="cloud"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 650 570" role="img" aria-label="${esc(title)}"><rect width="650" height="570" fill="#fff"/><text x="25" y="28" font-size="13" font-family="Microsoft YaHei" fill="#233547">${esc(title)}</text>${cells}${supports}${legend}<text x="482" y="60" font-size="11">${kind==='uy'?'mm':'MPa'}</text><text x="25" y="548" font-size="10" fill="#647687">${kind==='uy'?'参考面单元角点位移均值':d.aggregation?'同材料层的积分点张量按厚度加权平均后求标量；验算仍取原始积分点峰值':'实体单元 8 积分点张量平均后求标量；不等同分层壳 S23Avg'}</text></svg><p class="hint">颜色来自本次结果。显示值 ${fmt(lo,7)} ～ ${fmt(hi,7)} ${kind==='uy'?'mm':'MPa'}；精确峰值见积分点结果表，色块平均值不代替峰值验算。</p></div>`;
}
export function controls(result,view={}){return `<div class="panel-body"><div class="form-grid">${select('显示工况','view.case',view.case||'ULS',result.summary.map(s=>[s.case,caseNames[s.case]?`${s.case} · ${caseNames[s.case]}`:s.case]))}${select('显示分量','view.quantity',view.quantity||'smax',quantities)}${select('材料层','view.layer',String(view.layer||0),result.snapshot.project.layers.map((l,n)=>[String(n),l.name]))}${select('显示网格','view.mesh',view.mesh||'off',[['off','隐藏网格线'],['on','显示单元网格']])}</div></div>`;}
