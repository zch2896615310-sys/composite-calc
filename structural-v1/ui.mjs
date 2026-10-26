export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt=(n,d=3)=>Number.isFinite(n)?(Math.abs(n)>=1e7||Math.abs(n)>0&&Math.abs(n)<.001?n.toExponential(3):n.toLocaleString('en-US',{maximumFractionDigits:d})):'—';
export function field(label,path,value,unit='',type='number') {return `<label class="field"><span>${esc(label)}${unit?` <em class="field-unit">${esc(unit)}</em>`:''}</span><input data-path="${esc(path)}" ${type==='number'?'data-number step="any"':''} type="${type}" value="${esc(value)}"></label>`;}
export function select(label,path,value,options) {const current=options.find(([v])=>v===value)?.[1]||'';return `<label class="field wide"><span>${esc(label)}</span><select data-path="${esc(path)}" title="${esc(current)}">${options.map(([v,t])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(t)}</option>`).join('')}</select>${current.length>26?`<small class="selected-option">${esc(current)}</small>`:''}</label>`;}
export const textarea=(path,text,rows=8)=>`<textarea rows="${rows}" data-path="${esc(path)}" spellcheck="false">${esc(text)}</textarea>`;
export const panel=(title,body,subtitle='')=>`<section class="panel"><div class="panel-head"><h2>${esc(title)}</h2><span>${esc(subtitle)}</span></div>${body}</section>`;
export const metrics=items=>`<div class="metrics">${items.map(([name,val,unit])=>`<div class="metric"><small>${esc(name)}</small><strong>${esc(fmt(val))}</strong><em>${esc(unit)}</em></div>`).join('')}</div>`;
export const table=(heads,rows)=>`<div class="table-scroll"><table class="${heads.includes('公式')?'has-formulas':''} ${heads.length>4?'wide-data':''}"><thead><tr>${heads.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((v,j)=>`<td class="${typeof v==='number'?'numeric':''}">${heads[j]==='公式'?formula(v):esc(typeof v==='number'?fmt(v,8):v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const mathTokens={
 'Gstone,k':'G<sub>石材,k</sub>','Gcore,k':'G<sub>芯,k</sub>','Gsteel,k':'G<sub>钢板,k</sub>','Gk,adopted':'G<sub>k,采用</sub>',
 'γstone':'γ<sub>石材</sub>','γsteel':'γ<sub>钢板</sub>','tstone':'t<sub>石材</sub>','tsteel':'t<sub>钢板</sub>','tfoil':'t<sub>箔</sub>','tcore':'t<sub>芯</sub>',
 'Cword':'C<sub>Word</sub>','Gadd':'G<sub>附加</sub>','qline':'q<sub>线</sub>','qarea':'q<sub>面</sub>','qEk':'q<sub>E,k</sub>','qE':'q<sub>E</sub>',
 'αmax':'α<sub>max</sub>','βE':'β<sub>E</sub>','γG':'γ<sub>G</sub>','γE':'γ<sub>E</sub>','Gk':'G<sub>k</sub>','Gd':'G<sub>d</sub>',
 'SMaxAvg':'S<sub>Max,Avg</sub>','S23Avg':'S<sub>23,Avg</sub>','S13Avg':'S<sub>13,Avg</sub>','SMax':'S<sub>max</sub>','SVM':'S<sub>VM</sub>'
};
const mathPattern=new RegExp('('+Object.keys(mathTokens).sort((a,b)=>b.length-a.length).join('|')+')','g');
export function formula(value){return `<span class="engineering-formula">${String(value??'').split(mathPattern).map(s=>mathTokens[s]||esc(s)).join('').replace(/\/ 1000000\b/g,'/ 10<sup>6</sup>').replace(/\/ 1000\b/g,'/ 10<sup>3</sup>')}</span>`;}
export const formSection=(title,content)=>`<fieldset class="form-section"><legend>${esc(title)}</legend><div class="form-grid">${content}</div></fieldset>`;
export const advanced=(title,content,key=title)=>`<details class="advanced-settings" data-ui-key="${esc(key)}"><summary>${esc(title)}</summary><div class="advanced-content">${content}</div></details>`;
export function loadFormulaRows(r,pure=false,input=null){
 return r.formulas.flatMap((source,index)=>{
  const row=[...source];if(index===6)row[0]='水平线荷载';if(pure&&index===3)row[1]=row[1].replace('Gstone,k + Gcore,k + Gsteel,k + Gadd','Gstone,k + Gadd');
  if(index!==5)return[{row,index}];
  row[0]='地震设计值 qE';row[1]='qE = γE × qEk';row[2]=input?`${input.gammaE} × ${fmt(r.qEk,8)} = ${fmt(r.qE,8)} kN/m²`:`qE = ${fmt(r.qE,8)} kN/m²`;
  return[{index:'eq-standard',value:r.qEk,row:['地震荷载标准值 qE,k','qEk = βE × αmax × Gk',input?`${input.beta} × ${input.alpha} × ${fmt(r.gk,8)} = ${fmt(r.qEk,8)} kN/m²`:`qE,k = ${fmt(r.qEk,8)} kN/m²`]}, {row,index}];
 }).filter(v=>!pure||![1,2].includes(v.index));
}
export function loadSteps(r,{pure=false,input=null}={}){
 const values=[r.stone,r.core,r.steel,r.gk,r.gd,r.qE,r.qELine];
 return `<div class="calculation-steps">${loadFormulaRows(r,pure,input).map(({row:[name,f,substitution],index:n,value=values[n]})=>`<details class="calculation-step" data-ui-key="load-step-${n}" ${n===0?'open':''}><summary><span>${esc(name)}</span><strong>${esc(fmt(value,6))} <small>${n===6?'kN/m':'kN/m²'}</small></strong></summary><div class="step-content">${formula(f)}<p class="substitution">${esc(substitution)}</p></div></details>`).join('')}</div><div class="result-precision">${advanced('完整精度与计算明细',table(['计算项','公式','代入及结果'],loadFormulaRows(r,pure,input).map(v=>v.row)),'load-precision')}</div>`;
}
export const error=text=>`<div class="error">${esc(text)}</div>`;
export function curve(points,key,label,unit,{compact=false,color=null,labelColor=null,shade=false,model=null,plotWidth=null,probe=null}={}) {
  const max=Math.max(probe?.max??0,...points.map(p=>Math.abs(p[key])),1e-15),L=points.at(-1).x;
  const width=plotWidth||(compact?300:700),height=model?164:compact?150:120,left=compact?22:35,right=plotWidth?width-left:compact?278:665,zero=compact?68:57,amplitude=compact?43:38;
  const X=x=>left+x/L*(right-left);
  const path=points.map((p,i)=>`${i?'L':'M'}${(left+p.x/L*(right-left)).toFixed(2)},${(zero-p[key]/max*amplitude).toFixed(2)}`).join(' ');
  const stroke=color||'#316d9f',area=shade?`<path class="curve-area" d="M${left} ${zero}${path.replace(/^M/,'L')}L${right} ${zero}Z" fill="${esc(stroke)}" fill-opacity="0.1" stroke="none"/>`:'';
  let ruler='',guides='';
  if(model){
   const nodes=model.lengths.reduce((a,l)=>(a.push(a.at(-1)+l),a),[0]);
   guides=model.supports.map(x=>`<path d="M${X(x)} 16V100" stroke="#dbe4ec" stroke-dasharray="2 4"/>`).join('');
   ruler=`<g class="curve-model-ruler" aria-label="支座与分段"><path d="M${left} 118H${right}" stroke="#bac9d6"/>`+
    nodes.map(x=>`<path d="M${X(x)} 114v8" stroke="#bac9d6"/>`).join('')+
    model.lengths.map((l,j)=>`<text data-segment-label="L${j+1}" data-segment-start="${nodes[j]}" data-segment-end="${nodes[j+1]}" x="${X(nodes[j]+l/2)}" y="110" text-anchor="middle" fill="#526d83" style="font:11px Consolas,monospace">L${j+1}</text>`).join('')+
    model.supports.map((x,j)=>`<g data-support-x="${x}" aria-label="支座 R${j+1}，距左端 ${esc(fmt(x))} mm"><title>R${j+1} · ${esc(fmt(x))} mm</title><path d="M${X(x)} 118l-6 9h12Z" fill="#8da4b8" stroke="#6c859a" stroke-width="0.7"/><text x="${X(x)}" y="141" text-anchor="middle" fill="#526d83" style="font:10px Consolas,monospace">R${j+1}</text></g>`).join('')+'</g>';
  }
  const labelBoxes=[];
  const peakMarks=probe?probe.peaks.map(p=>{
   const px=X(p.x),py=zero-p.value/max*amplitude;
   const lines=[`${key} = ${p.value>0?'+':''}${fmt(p.value,5)} ${unit}`,`x = ${fmt(p.x,2)} mm`];
   const w=Math.min(right-left,Math.max(...lines.map(s=>s.length))*6.7+14),h=33;
   const y=Math.max(1,Math.min(100-h,py-h/2));
   const rightX=Math.max(left,Math.min(right-w,px+12)),leftX=Math.max(left,Math.min(right-w,px-w-12));
   const options=[{x:rightX,y},{x:leftX,y},...([1,34,67].flatMap(y=>[{x:rightX,y},{x:leftX,y}]))];
   const overlap=b=>labelBoxes.reduce((sum,a)=>sum+Math.max(0,Math.min(b.x+w,a.x+a.w)-Math.max(b.x,a.x))*Math.max(0,Math.min(b.y+h,a.y+a.h)-Math.max(b.y,a.y)),0);
   options.sort((a,b)=>overlap(a)-overlap(b));const box=options[0];labelBoxes.push({...box,w,h});
   const tipX=Math.max(box.x,Math.min(box.x+w,px)),tipY=Math.max(box.y,Math.min(box.y+h,py));
   return `<g class="curve-peak" data-peak-x="${p.x}" data-peak-value="${p.value}"><title>最大绝对值 · ${esc(lines.join(' · '))}</title><path d="M${px} ${py}L${tipX} ${tipY}" stroke="${esc(stroke)}" stroke-opacity="0.65" fill="none"/><g class="curve-peak-label" transform="translate(${box.x},${box.y})"><rect width="${w}" height="${h}" rx="3" fill="#fff" fill-opacity="0.92"/>${lines.map((text,j)=>`<text x="7" y="${13+j*14}" style="font:11px Consolas,monospace;fill:${esc(labelColor||stroke)}">${esc(text)}</text>`).join('')}</g><circle cx="${px}" cy="${py}" r="3.5" fill="${esc(stroke)}" stroke="#fff" stroke-width="1.2"/></g>`;
  }).join(''):'';
  const probeData=probe?` data-curve-probe="${esc(JSON.stringify({elements:probe.elements,left,right,zero,amplitude,max,key,unit}))}"`:'';
  const hover=probe?`<g class="curve-probe" visibility="hidden" pointer-events="none"><line y1="16" y2="100" stroke="#50697f" stroke-dasharray="3 3"/><circle r="4" fill="${esc(stroke)}" stroke="#fff"/><circle r="4" fill="${esc(stroke)}" stroke="#fff"/><g class="curve-probe-box"><rect rx="4" fill="#fff" stroke="#c6d4e0"/><text x="10" style="font:11px Consolas,monospace;fill:#264660"></text><text x="10" style="font:11px Consolas,monospace;fill:#264660"></text><text x="10" style="font:11px Consolas,monospace;fill:#264660"></text></g></g>`:'';
  return `<div class="curve"><h3 ${color?`style="color:${esc(labelColor||color)}"`:''}>${esc(label)} · ${esc(unit)}${probe?'':`　|峰值| ${esc(fmt(max))}`}</h3><svg${probeData} data-render-width="${plotWidth||0}" ${compact?'class="compact-curve"':''} viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${guides}${area}<path class="curve-zero" d="M${left} ${zero}H${right}" stroke="${shade?'#b8c4d0':'#d9e3eb'}" ${shade?'stroke-dasharray="4 4"':''}/><path class="curve-line" d="${path}" fill="none" stroke="${esc(stroke)}" stroke-width="1.6"/>${peakMarks}${ruler}<text x="${left}" y="${height-6}">0</text><text x="${compact||model?right:620}" y="${height-6}" ${compact||model?'text-anchor="end"':''}>${fmt(L)} mm</text>${hover}</svg></div>`;
}

export const checkCards=rows=>`<div class="check-cards">${rows.map(v=>`<article class="check-card"><header><h3>${esc(v.name)}</h3><span class="state-pill ${v.pass===null?'neutral':v.pass?'success':'danger'}">${v.pass===null?'需求值':v.pass?'满足':'不满足'}</span></header><div class="check-values"><div><small>${v.valueLabel||'计算值'}</small><strong>${esc(fmt(v.value,8))} <em>${esc(v.unit)}</em></strong></div>${v.limit===null?'':`<div><small>${v.limitLabel||'限值'}</small><strong>${esc(fmt(v.limit,8))} <em>${esc(v.unit)}</em></strong></div>`}</div><div class="check-formula">${formula(v.formula)}${v.substitution?`<p class="hint">代入：${esc(v.substitution)}</p>`:''}</div></article>`).join('')}</div>`;
