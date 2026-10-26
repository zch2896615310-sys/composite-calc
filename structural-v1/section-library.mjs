import {emptySectionLibrary,validateSectionLibrary,saveLibrarySection,renameLibrarySection,archiveLibrarySection,loadLibrarySection} from './section-library-model.mjs';
import {section} from './engines/section.mjs';
import {esc,fmt} from './ui.mjs?calculix-checks=19';

export const SECTION_LIBRARY_KEY='stonecalc.section-library.v1';
const shapeNames={box:'矩形钢管',h:'H形截面',channel:'槽形截面',angle:'角形截面',rect:'实心矩形',layers:'多层复合截面',custom:'矩形拼合截面',cad:'CAD闭合轮廓'};
export function setupSectionLibrary({getCurrent,apply,changed}){
 const libraryDialog=document.querySelector('#section-library'),saveDialog=document.querySelector('#section-save');let editing=null,target=null;
 const read=()=>{const raw=localStorage.getItem(SECTION_LIBRARY_KEY);return raw===null?emptySectionLibrary():validateSectionLibrary(JSON.parse(raw));};
 const write=value=>{localStorage.setItem(SECTION_LIBRARY_KEY,JSON.stringify(value));changed();};
 const message=text=>libraryDialog.querySelector('#section-library-status').textContent=text;
 const download=(name,text)=>{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 function draw(){
  try{
   const value=read(),search=libraryDialog.querySelector('#section-library-search').value.trim().toLowerCase(),active=value.entries.filter(e=>!e.archived),shown=active.filter(e=>e.name.toLowerCase().includes(search));
   libraryDialog.querySelector('#section-library-list').innerHTML=shown.map(e=>{const r=section(e.input);return `<article class="section-library-item"><div><h3>${esc(e.name)}</h3><p>${esc(shapeNames[e.input.shape]||e.input.shape)} · A ${esc(fmt(r.A))} mm² · Ix ${esc(fmt(r.Ix))} mm⁴</p><small>E ${esc(fmt(e.input.E))} MPa${e.input.shape==='cad'?' · '+esc(e.input.cad.source||'导入CAD'):''}</small></div><div class="section-library-actions"><button data-lib-action="load" data-id="${esc(e.id)}">载入到当前截面</button><button data-lib-action="rename" data-id="${esc(e.id)}">重命名</button><button data-lib-action="update" data-id="${esc(e.id)}">更新为当前截面</button><button data-lib-action="archive" data-id="${esc(e.id)}">移除</button></div></article>`;}).join('')||'<p class="hint">'+(active.length?'没有匹配的截面。':'还没有保存常用截面。先在截面模块中设置参数或导入CAD，再点击“保存为常用截面”。')+'</p>';
   const archived=value.entries.filter(e=>e.archived);libraryDialog.querySelector('#section-library-archive').innerHTML=archived.length?`<details><summary>已移除的截面（${archived.length}）</summary>${archived.map(e=>`<div class="section-library-removed"><span>${esc(e.name)}</span><button data-lib-action="restore" data-id="${esc(e.id)}">恢复</button></div>`).join('')}</details>`:'';
   message(`已保存 ${active.length} 个常用截面；载入后可独立修改，不会改变库中的副本。`);
  }catch(e){message('截面库读取失败：'+e.message+'。原记录已保留，请检查备份。');libraryDialog.querySelector('#section-library-list').textContent='';}
 }
 function openSave(mode='new',id=null){
  const value=read(),entry=id?value.entries.find(e=>e.id===id&&!e.archived):null;
  if(id&&!entry)throw Error('找不到截面');
  const current=mode==='rename'?null:getCurrent();if(current)section(current.input);
  editing={mode,id,input:current?structuredClone(current.input):null};
  saveDialog.querySelector('h2').textContent=mode==='rename'?'重命名常用截面':mode==='update'?'更新常用截面':'保存为常用截面';
  saveDialog.querySelector('#section-save-name').value=entry?.name||current.name;
  saveDialog.querySelector('#section-save-status').textContent=mode==='update'?'将用当前截面的参数更新这条库记录。':mode==='rename'?'只修改名称，截面参数保持不变。':'保存完整参数、材料配置和已选CAD轮廓。';
  saveDialog.showModal();saveDialog.querySelector('#section-save-name').focus();
 }
 saveDialog.querySelector('form').addEventListener('submit',e=>{
  e.preventDefault();try{
   const name=saveDialog.querySelector('#section-save-name').value,value=read();
   const next=editing.mode==='rename'?renameLibrarySection(value,editing.id,name):saveLibrarySection(value,name,editing.input,editing.id);
   write(next);saveDialog.close();if(libraryDialog.open)draw();
  }catch(error){saveDialog.querySelector('#section-save-status').textContent='未保存：'+error.message;}
 });
 saveDialog.querySelector('#section-save-close').addEventListener('click',()=>saveDialog.close());
 libraryDialog.querySelector('#section-library-close').addEventListener('click',()=>libraryDialog.close());
 libraryDialog.querySelector('#section-library-search').addEventListener('input',draw);
 libraryDialog.addEventListener('click',e=>{
  const b=e.target.closest('[data-lib-action]');if(!b)return;
  try{const action=b.dataset.libAction,id=b.dataset.id,value=read();
   if(action==='load'){apply(loadLibrarySection(value,id),target);libraryDialog.close();return;}
   if(action==='rename'||action==='update'){openSave(action,id);return;}
   if(action==='archive'||action==='restore'){write(archiveLibrarySection(value,id,action==='archive'));draw();return;}
   if(action==='export'){download('常用截面库.sectionlib.json',JSON.stringify(value,null,2));message('截面库已导出，包含名称、参数和CAD轮廓。');return;}
   if(action==='import')libraryDialog.querySelector('#section-library-file').click();
  }catch(error){message(error.message);}
 });
 libraryDialog.querySelector('#section-library-file').addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
   if(file.size>10_000_000)throw Error('截面库文件超过10 MB');
   const incoming=validateSectionLibrary(JSON.parse(await file.text()));let next=read(),count=0;
   for(const entry of incoming.entries.filter(e=>!e.archived)){
    let name=entry.name,index=1;while(next.entries.some(e=>!e.archived&&e.name===name)){const suffix=`（导入${index++}）`;name=entry.name.slice(0,80-suffix.length)+suffix;}
    next=saveLibrarySection(next,name,entry.input);count++;
   }
   write(next);draw();message(`已导入 ${count} 个截面，同名记录已另存名称，原库保留。`);
  }catch(error){message('导入失败：'+error.message);}finally{e.target.value='';}
 });
 return{openSave:()=>openSave(),openLibrary:()=>{target=getCurrent().target;libraryDialog.querySelector('#section-library-search').value='';draw();libraryDialog.showModal();}};
}
