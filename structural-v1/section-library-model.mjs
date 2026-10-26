import {section} from './engines/section.mjs';
import sectionModule from './modules/section.mjs?section-modulus=1';

export const emptySectionLibrary=()=>({schemaVersion:1,entries:[]});
function validInput(input){
 let count=0;function visit(v,depth=0){if(++count>100000||depth>25)throw Error('截面数据过大');if(typeof v==='number'&&!Number.isFinite(v))throw Error('截面包含无效数值');if(v&&typeof v==='object')for(const[k,x]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('截面包含无效字段');visit(x,depth+1);}}
 visit(input);sectionModule.validate(input);section(input);
}
const cleanName=name=>{if(typeof name!=='string'||!name.trim()||name.trim().length>80)throw Error('截面名称须为1–80个字符');return name.trim();};
export function validateSectionLibrary(value){
 if(!value||value.schemaVersion!==1||!Array.isArray(value.entries)||value.entries.length>200)throw Error('不是有效的常用截面库（最多200项）');
 const ids=new Set(),names=new Set();
 for(const e of value.entries){if(!e||typeof e.id!=='string'||!e.id||ids.has(e.id)||typeof e.archived!=='boolean')throw Error('常用截面记录格式无效');ids.add(e.id);const name=cleanName(e.name);if(!e.archived&&names.has(name))throw Error('常用截面名称重复');if(!e.archived)names.add(name);validInput(e.input);}
 return value;
}
export function saveLibrarySection(library,name,input,id=null){
 const value=structuredClone(library),title=cleanName(name);validInput(input);
 if(value.entries.some(e=>!e.archived&&e.id!==id&&e.name===title))throw Error('该名称已存在，请换一个名称或在库中选择“更新”');
 const now=new Date().toISOString(),existing=id?value.entries.find(e=>e.id===id&&!e.archived):null;
 if(id&&!existing)throw Error('找不到要更新的截面');
 if(existing){existing.name=title;existing.input=structuredClone(input);existing.updatedAt=now;}
 else{if(value.entries.length>=200)throw Error('常用截面库最多保存200项');value.entries.push({id:crypto.randomUUID(),name:title,input:structuredClone(input),createdAt:now,updatedAt:now,archived:false});}
 return validateSectionLibrary(value);
}
export function renameLibrarySection(library,id,name){const e=library.entries.find(e=>e.id===id&&!e.archived);if(!e)throw Error('找不到截面');return saveLibrarySection(library,name,e.input,id);}
export function archiveLibrarySection(library,id,archived){const value=structuredClone(library),e=value.entries.find(e=>e.id===id);if(!e)throw Error('找不到截面');e.archived=archived;return validateSectionLibrary(value);}
export function loadLibrarySection(library,id){const e=library.entries.find(e=>e.id===id&&!e.archived);if(!e)throw Error('找不到截面');validInput(e.input);return{name:e.name,input:structuredClone(e.input)};}
