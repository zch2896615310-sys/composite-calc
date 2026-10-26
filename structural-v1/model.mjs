import section from './modules/section.mjs?section-modulus=1';
import beam from './modules/beam.mjs?report-red=1';
import fem from './modules/fem.mjs?calculix-checks=19';
import loads from './modules/loads.mjs?calculix-checks=19';
import check from './modules/check.mjs?report-red=1';
import shell from './modules/shell.mjs?calculix-checks=19';
import {worksheetModules} from './modules/worksheet-checks.mjs?calculix-checks=19';
import originalComparison from './modules/original-comparison.mjs?v=2';
import {connectionModules} from './modules/connection-checks.mjs';
import wordComparison from './modules/word0920-comparison.mjs';
export const registry=new Map([loads,section,beam,fem,shell,check,originalComparison,wordComparison,...worksheetModules,...connectionModules].map(m=>[m.type,m]));
export const newProject=(name='未命名计算项目')=>({schemaVersion:1,id:crypto.randomUUID(),name,modules:[]});
export function addModule(project,type,context){
  const definition=registry.get(type);if(!definition)throw Error('模块类型未注册');
  const count=project.modules.filter(m=>m.type===type).length+1;
  const instance={id:crypto.randomUUID(),type,version:definition.version,name:`${definition.title} ${count}`,input:definition.create(context)};
  project.modules.push(instance);return instance;
}
export function validateProject(p){
  if(!p||p.schemaVersion!==1||typeof p.id!=='string'||typeof p.name!=='string'||!Array.isArray(p.modules)||p.modules.length>100)throw Error('不是受支持的工作台项目（schemaVersion = 1，最多 100 模块）');
  const ids=new Set();
  for(const m of p.modules){
    const def=registry.get(m.type);
    if(!def||m.version!==def.version||typeof m.id!=='string'||!m.id||ids.has(m.id)||typeof m.name!=='string')throw Error('模块类型、版本或唯一编号无效');
    ids.add(m.id);def.validate(m.input);
    if(m.lastRun&&(!/^[0-9a-f]{32}$/.test(m.lastRun.jobId)||typeof m.lastRun.inputKey!=='string'))throw Error('算例引用格式无效');
  }
  const visit=(v,depth=0)=>{if(depth>30)throw Error('项目数据嵌套过深');if(typeof v==='number'&&!Number.isFinite(v))throw Error('项目含非有限数字');if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('项目字段无效');visit(x,depth+1);}};
  visit(p);return p;
}
export function evaluate(project,extra){
  const results=new Map(),errors=new Map(),visiting=new Set();
  function getResult(id){
    if(results.has(id))return results.get(id);
    if(errors.has(id))throw Error(errors.get(id));
    const m=project.modules.find(m=>m.id===id);if(!m)throw Error('引用的模块不存在');
    if(visiting.has(id))throw Error('模块依赖形成循环');visiting.add(id);
    try {const def=registry.get(m.type);for(const dep of def.dependencies?.(m.input)||[]){const d=typeof dep==='string'?{id:dep,types:['section']}:dep;const source=project.modules.find(m=>m.id===d.id);if(!source)throw Error('引用的模块不存在，请重新选择');if(!d.types.includes(source.type))throw Error('引用的模块类型不匹配');getResult(d.id);}const r=def.calculate({instance:m,project,getResult,...extra});results.set(id,r);return r;}
    catch(e){errors.set(id,e.message);throw e;}finally{visiting.delete(id);}
  }
  for(const m of project.modules)try{getResult(m.id);}catch{}
  return {results,errors,getResult};
}
