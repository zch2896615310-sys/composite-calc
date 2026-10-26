const exampleId='second-book-original-1';
let loaded;
export function loadSecondBook(){
  if(!loaded)loaded=fetch(new URL('./examples/second-book-original-1.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('第二份计算书示例读取失败');return r.json();}).then(bundle=>{
    if(bundle.id!==exampleId||bundle.kind!=='verified-fem-example'||!bundle.project?.modules||bundle.result?.postprocess!=='layered-shell-v1')throw Error('第二份计算书示例格式无效');
    return bundle;
  }).catch(error=>{loaded=null;throw error;});
  return loaded;
}
export function instantiateExample(bundle){
  const project=structuredClone(bundle.project),ids=new Map(project.modules.map(m=>[m.id,crypto.randomUUID()]));
  project.id=crypto.randomUUID();
  for(const m of project.modules){
    m.id=ids.get(m.id);
    for(const key of ['sectionId','loadId','beamId','serviceBeamId','femId','analysisId'])if(ids.has(m.input[key]))m.input[key]=ids.get(m.input[key]);
    if(m.type==='fem')m.exampleSnapshot=exampleId;
  }
  return project;
}
export function restoreExampleResults(project,bundle,results){
  const source=bundle.project.modules.find(m=>m.type==='fem');
  if(!source?.lastRun||JSON.stringify(JSON.parse(source.lastRun.inputKey))!==JSON.stringify(bundle.result.snapshot))throw Error('示例结果与输入快照不匹配');
  for(const m of project.modules){
    if(m.type!=='fem'||m.exampleSnapshot!==exampleId||m.lastRun?.jobId!==source.lastRun.jobId||m.lastRun?.inputKey!==source.lastRun.inputKey||results.has(m.id))continue;
    results.set(m.id,{...structuredClone(bundle.result),exampleSnapshot:exampleId});
  }
}
