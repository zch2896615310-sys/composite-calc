import {esc,field,select,fmt} from './ui.mjs?calculix-checks=19';
import {readBeamEditor,beamNodes,positionParts,setBeamPosition,changePositionKind} from './beam-editor-model.mjs?v=4';

// Editors adapt the existing persistence contracts. Rendering never rewrites inputs.
export const inputCard=(title,body,remove='')=>`<section class="input-item"><div class="input-item-head"><h4>${esc(title)}</h4>${remove}</div><div class="input-item-fields">${body}</div></section>`;
export const removeItem=(action,index,label,disabled=false)=>`<button class="input-item-remove" data-action="module:${action}" data-index="${index}" aria-label="${esc(label)}" ${disabled?'disabled':''}>移除</button>`;
export function rectangleEditor(i){return `<p class="hint">每块矩形单独填写。左下角位置从截面原点量起，宽度沿X、高度沿Y；矩形不能重叠。</p>`+i.rects.map((r,n)=>inputCard('矩形 '+(n+1),[['x','左下角 X','mm'],['y','左下角 Y','mm'],['b','宽度','mm'],['h','高度','mm'],['E','弹性模量 E','MPa']].map(([k,t,u])=>field(t,`input.rects.${n}.${k}`,r[k],u)).join(''),removeItem('remove-rect',n,'移除矩形'+(n+1),i.rects.length<=1))).join('')+'<button data-action="module:add-rect">＋ 添加矩形</button>';}
export function layerEditor(i){return '<p class="hint">材料层从下至上排列，层间完全粘结。</p>'+i.layers.map((r,n)=>inputCard('第 '+(n+1)+' 层',field('厚度',`input.layers.${n}.t`,r.t,'mm')+field('弹性模量 E',`input.layers.${n}.E`,r.E,'MPa'),removeItem('remove-layer',n,'移除第'+(n+1)+'层',i.layers.length<=1))).join('')+'<button data-action="module:add-layer">＋ 添加材料层</button>';}
export function breakpointEditor(p,key,label){const a=p.geometry[key];return `<section class="input-list"><h4>${esc(label)}分格点</h4><p class="hint">沿${key==='x_breaks'?'板宽X':'板高Z'}方向的位置；首尾两项为边界，其余项为分格线。</p>${a.map((v,n)=>`<div class="input-list-row">${field(n===0?'起点':n===a.length-1?'终点':'分格点 '+n,`input.project.geometry.${key}.${n}`,v,'mm')}${removeItem('remove-break-'+key,n,'移除'+label+'分格点'+n,n===0||n===a.length-1)}</div>`).join('')}<button data-action="module:add-break-${key}">＋ 添加${esc(label)}分格点</button></section>`;}
export const dofEditor=(s,n)=>`<fieldset class="direction-checks"><legend>固定方向</legend>${[[1,'X · 板宽'],[2,'Y · 板面法向'],[3,'Z · 竖向']].map(([d,t])=>`<label><input type="checkbox" data-boolean data-path="input.supportDof.${n}.${d}" aria-label="挂点${n+1}固定${'XYZ'[d-1]}方向" ${s.dofs.includes(d)?'checked':''}><span>${t}</span></label>`).join('')}<small>勾选为固定，未勾选为允许移动。</small></fieldset>`;
const materialName=k=>({MARBLE:'石材',STEEL:'钢板',CORE:'蜂窝芯'})[k]||k;
export function materialsEditor(p){return Object.entries(p.materials).map(([key,m],n)=>{
 const path='input.materialRows.'+n,ortho=!!m.engineering_constants;
 let body=select('材料模型',path+'.model',ortho?'orthotropic':'isotropic',[['isotropic','各向同性（E、泊松比）'],['orthotropic','正交异性（分方向参数）']]);
 if(ortho){body+=['E1','E2','E3','ν12','ν13','ν23','G12','G13','G23'].map((t,j)=>field(t,path+'.constant.'+j,m.engineering_constants[j],j<3||j>=6?'MPa':'')).join('');body+=select('泊松比定义',path+'.poisson_convention',m.poisson_convention||'',[['','未指定（请按材料来源选择）'],['CSI_uij_over_Ej','CSI 定义：νij / Ej'],['CCX_nuij_over_Ei','CalculiX 定义：νij / Ei']]);}
 else body+=field('弹性模量 E',path+'.E',m.E,'MPa')+field('泊松比 ν',path+'.nu',m.nu);
 body+=field('质量密度',path+'.mass_density',m.mass_density,'N·s²/mm⁴')+field('重量密度',path+'.weight_density',m.weight_density,'N/mm³');
 return `<details class="input-item" data-ui-key="material-${n}"><summary>${esc(materialName(key))} · ${esc(key)}</summary><div class="input-item-fields">${body}</div><div class="input-item-footer">${removeItem('remove-material',n,'移除材料'+key,p.layers.some(l=>l.material===key))}${p.layers.some(l=>l.material===key)?'<small>有材料层引用，不能移除。</small>':''}</div></details>`;
 }).join('')+'<button data-action="module:add-material">＋ 添加材料</button>';}
export function changeFemInput(i,path,value){
 let match;if((match=/^input\.supportDof\.(\d+)\.([123])$/.exec(path))){const s=i.project.supports[+match[1]],d=+match[2];if(!s)throw Error('挂点不存在');s.dofs=value?[...new Set([...s.dofs,d])].sort((a,b)=>a-b):s.dofs.filter(v=>v!==d);return true;}
 if(!(match=/^input\.materialRows\.(\d+)\.(.+)$/.exec(path)))return false;
 const m=Object.values(i.project.materials)[+match[1]],prop=match[2];if(!m)throw Error('材料不存在');
 if(prop==='model'){
  if(value==='orthotropic'&&!m.engineering_constants){m.engineering_constants=[m.E,m.E,m.E,m.nu,m.nu,m.nu,m.E/(2*(1+m.nu)),m.E/(2*(1+m.nu)),m.E/(2*(1+m.nu))];m.poisson_convention='CCX_nuij_over_Ei';delete m.E;delete m.nu;}
  else if(value==='isotropic'&&m.engineering_constants){m.E=m.engineering_constants[0];m.nu=m.engineering_constants[3];delete m.engineering_constants;delete m.poisson_convention;}
 }else if(/^constant\.[0-8]$/.test(prop)){m.engineering_constants[+prop.at(-1)]=value;}
 else if(['E','nu','mass_density','weight_density','poisson_convention'].includes(prop))m[prop]=value;
 else throw Error('材料字段无效');return true;
}
export function femListAction(i,action,n){const p=i.project;let m;
 if((m=/^(add|remove)-break-(x_breaks|z_breaks)$/.exec(action))){const a=p.geometry[m[2]];if(m[1]==='remove'){if(n<=0||n>=a.length-1)throw Error('边界点请直接修改位置，不能移除');a.splice(n,1);}else{if(a.length>=64)throw Error('分格点最多64个');let j=1;for(let k=2;k<a.length;k++)if(a[k]-a[k-1]>a[j]-a[j-1])j=k;a.splice(j,0,(a[j-1]+a[j])/2);}return true;}
 if(action==='add-material'){let n=1;while(Object.hasOwn(p.materials,'MAT'+n))n++;p.materials['MAT'+n]={E:206000,nu:.3,mass_density:7.85e-5/p.loads.g,weight_density:7.85e-5};return true;}
 if(action==='remove-material'){const key=Object.keys(p.materials)[n];if(p.layers.some(l=>l.material===key))throw Error('该材料仍被材料层引用');delete p.materials[key];return true;}return false;
}
const positionLabels={xSupports:'X向位移支点',fixedYRotations:'Y向固定转角',fixedXRotations:'X向固定转角',twistSupports:'零扭转角支点'};
const positionTokens=text=>text.trim()?text.split(/[,，]/).map(s=>s.trim()):[];
export function positionListEditor(i,key){
 const label=positionLabels[key];let s;try{s=readBeamEditor(i.model);}catch{return '<p class="hint">请先补齐下方跨段模型，再设置位置。</p>';}
 const nodes=beamNodes(s),a=positionTokens(i[key]);
 return `<section class="input-list"><h4>${label}</h4>${a.map((token,n)=>{
  const p=positionParts(token),base=`input.positionLists.${key}.${n}`,name=label+(n+1);let fields=select('定位方式',base+'.kind',p.kind,[['node','选择跨段节点'],['absolute','距梁左端'],['segment','按所在跨段比例'],['percent','按梁总长比例'],['end','梁右端']]);
  if(p.kind==='node')fields+=select('节点位置',base+'.node',String(p.node),nodes.map((v,j)=>[String(j),`节点 ${j} · ${fmt(v)} mm`]));
  if(p.kind==='absolute')fields+=field('距梁左端',base+'.mm',p.mm,'mm');
  if(p.kind==='percent')fields+=field('梁总长比例',base+'.percent',p.percent,'%');
  if(p.kind==='segment')fields+=select('所在跨段',base+'.segment',String(p.segment),s.spans.map((v,j)=>[String(j+1),`第 ${j+1} 段 · ${fmt(v)} mm`]))+field('段内比例',base+'.fraction',p.fraction,'%');
  return inputCard(name,fields,removeItem('position-remove-'+key,n,'移除'+name));
 }).join('')}${!a.length?`<p class="hint">${key.includes('Rotations')?'未设置：所有支点允许弯曲转动。':'尚未设置位置。'}</p>`:''}<button data-action="module:position-add-${key}">＋ 添加${label}</button></section>`;
}
export function changePositionInput(i,path,value){const m=/^input\.positionLists\.(\w+)\.(\d+)\.(\w+)$/.exec(path);if(!m||!Object.hasOwn(positionLabels,m[1]))return false;const[,key,n,part]=m,a=positionTokens(i[key]);if(a[n]===undefined)throw Error('位置不存在');const s=readBeamEditor(i.model);a[n]=part==='kind'?changePositionKind(a[n],value,s):setBeamPosition(a[n],part,value);i[key]=a.join(',');return true;}
export function positionListAction(i,action,n){const m=/^position-(add|remove)-(\w+)$/.exec(action);if(!m||!Object.hasOwn(positionLabels,m[2]))return false;const key=m[2],a=positionTokens(i[key]);if(m[1]==='remove')a.splice(n,1);else{if(a.length>=32)throw Error('每组最多32个位置');const s=readBeamEditor(i.model),nodes=beamNodes(s),used=a.map(v=>globalThis.position(v,nodes)),eligible=key==='fixedYRotations'||key==='fixedXRotations'&&i.xSupportMode!=='custom'?s.supports.map(v=>v.position):key==='fixedXRotations'?positionTokens(i.xSupports):nodes.map((_,j)=>'N'+j);let token=eligible.find(v=>!used.includes(globalThis.position(v,nodes)));if(token===undefined){if(key.includes('Rotations'))throw Error('该方向的所有支点均已设置固定转角');token=String(nodes.at(-1)/(a.length+2));}a.push(token);}i[key]=a.join(',');return true;}
