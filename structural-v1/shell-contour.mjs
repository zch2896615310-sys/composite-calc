import {esc,fmt,select} from './ui.mjs?calculix-checks=19';
const options=[['SMax','最大主应力 SMax'],['SVM','等效应力 SVM'],['S11','S11'],['S22','S22'],['S12','S12'],['S13Avg','层平均剪应力 S13Avg'],['S23Avg','层平均剪应力 S23Avg'],['SMaxAvg','层平均剪应力合值 SMaxAvg'],['UY','板法向位移 UY']];
function clip(poly,bound,greater){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ina=greater?a[2]>=bound:a[2]<=bound,inb=greater?b[2]>=bound:b[2]<=bound;if(ina)out.push(a);if(ina!==inb){const t=(bound-a[2])/(b[2]-a[2]);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),bound]);}}return out;}
export function shellControls(r,v={}){const layer=v.layer||'marb';return `<div class="panel-body"><div class="form-grid">${select('壳显示工况','view.case',v.case||r.summary.at(-1).case,r.summary.map(s=>[s.case,s.case]))}${select('壳应力分量','view.quantity',v.quantity||'SMax',options)}${select('壳材料层','view.layer',layer,r.layers.LayerName.map(l=>[l,l]))}${select('层厚积分位置','view.ip',v.ip||'1',Object.entries(r.locations[layer]).map(([ip,loc])=>[ip,`积分点 ${ip}：ξ=${fmt(loc,6)}`]))}${select('壳云图平均','view.average',v.average||'none',[['none','各单元独立（不跨单元平均）'],['joint','同层同积分位置节点平均']])}</div><p class="hint">ξ 为各层厚度归一化坐标，±0.57735 是两点高斯位置。此处不将积分点称为层顶 / 底；S13Avg、S23Avg 为同一材料层的平均横向剪应力。</p></div>`;}
export function shellContour(r,v={}){
 const c=v.case||r.summary.at(-1).case,l=v.layer||'marb',ip=v.ip||'1',q=v.quantity||'SMax',uy=q==='UY';
 const rows=r.fields[c]?.[l]?.[ip];if(!rows)return '<p>该位置没有结果。</p>';
 const col=r.columns.indexOf(q)+2,emap=new Map(),joint=new Map();
 for(const row of rows){const id=row[0],node=row[1],value=uy?r.displacements[c][node]:row[col];if(!Number.isFinite(value))continue;if(!emap.has(id))emap.set(id,new Map());emap.get(id).set(node,value);const a=joint.get(node)||[0,0];a[0]+=value;a[1]++;joint.set(node,a);}
 const vals=[...emap.values()].flatMap(m=>[...m.values()]);if(!vals.length)return '<p>当前分量没有有限数值。</p>';
 const lo=Math.min(...vals),hi=Math.max(...vals),range=hi-lo||1,points=[...joint.keys()].map(n=>r.coordinates[n]),xs=points.map(p=>p[0]),zs=points.map(p=>p[2]),xmin=Math.min(...xs),xmax=Math.max(...xs),zmin=Math.min(...zs),zmax=Math.max(...zs),scale=Math.min(380/Math.max(xmax-xmin,1),430/Math.max(zmax-zmin,1)),left=220-(xmax-xmin)*scale/2,bottom=505;
 const xy=node=>{const p=r.coordinates[node];return[left+(p[0]-xmin)*scale,bottom-(p[2]-zmin)*scale];};
 const color=t=>`hsl(${240*t} 100% 50%)`;
 let shapes='';for(const[id,values]of emap){const nodes=r.elements[id];if(!nodes?.every(n=>values.has(n)))continue;const vertices=nodes.map(n=>[...xy(n),v.average==='joint'?joint.get(n)[0]/joint.get(n)[1]:values.get(n)]);
  for(const triangle of [[vertices[0],vertices[1],vertices[2]],[vertices[0],vertices[2],vertices[3]]])for(let band=0;band<16;band++){let p=clip(triangle,lo+range*band/16,true);if(p.length)p=clip(p,lo+range*(band+1)/16,false);if(p.length>2)shapes+=`<polygon points="${p.map(a=>a.slice(0,2).join(',')).join(' ')}" fill="${color((band+.5)/16)}" stroke="${color((band+.5)/16)}" stroke-width=".25"><title>单元 ${esc(id)} · ${esc(q)}</title></polygon>`;}
 }
 const legend=Array.from({length:16},(_,j)=>`<rect x="470" y="${80+j*25}" width="22" height="25" fill="${color(1-(j+.5)/16)}"/>${j%3===0||j===15?`<text x="505" y="${90+j*25}" font-size="11">${fmt(hi-(hi-lo)*j/15,7)}</text>`:''}`).join('');
 const supports=Object.keys(r.summary[0].reactions_N).map(n=>{const p=r.coordinates[n];if(!p)return '';const[x,y]=xy(n);return `<path d="M${x} ${y}l-5 8h10Z" fill="none" stroke="#008855"/>`;}).join('');
 const title=`${c} / ${uy?'UY':`${l} · IP${ip} · ${q}`} / ${uy?'mm':'MPa'}`;
 return `<div class="cloud"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 650 570" role="img" aria-label="${esc(title)}"><rect width="650" height="570" fill="white"/><text x="20" y="26" font-size="12" font-family="Microsoft YaHei">${esc(title)}</text>${shapes}${supports}${legend}<text x="465" y="60" font-size="11">${uy?'mm':'MPa'}</text><text x="20" y="550" font-size="10" fill="#647687">${v.average==='joint'?'同层同积分位置节点平均':'单元独立角点值，三角形内线性着色'}；验算使用原始输出极值</text></svg><p class="hint">原始值范围 ${fmt(lo,8)} ～ ${fmt(hi,8)} ${uy?'mm':'MPa'}。颜色取自当前分层壳结果，显示平滑不改变验算峰值。</p></div>`;
}
