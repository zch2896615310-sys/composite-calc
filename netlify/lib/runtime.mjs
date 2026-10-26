import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
let ready;
export function command(exe,args,options={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(exe,args,{...options,stdio:['ignore','pipe','pipe']});let output='';
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk.toString()).slice(-12000);});
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('计算超时，请增大网格尺寸后重试'));},options.timeout||780000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error(output.slice(-3000)||'后台执行失败'));});
  });
}
export function runtime(){
  if(!ready)ready=(async()=>{
    const dir='/tmp/stonecalc-runtime';await fs.mkdir(dir,{recursive:true});
    await command('tar',['-xzf',path.join(process.cwd(),'.cloud/runtime.tar.gz'),'-C',dir]);
    return {python:path.join(dir,'bin/python'),env:{...process.env,STONECALC_CCX:path.join(dir,'bin/ccx'),LD_LIBRARY_PATH:path.join(dir,'lib'),OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'}};
  })().catch(e=>{ready=null;throw e;});return ready;
}
export async function prepare(id,payload){
  const folder=path.join('/tmp/stonecalc-jobs/runs',id);await fs.mkdir(path.dirname(folder),{recursive:true});
  const input=path.join(path.dirname(folder),id+'.json');await fs.writeFile(input,JSON.stringify(payload));
  return {folder,input};
}
export async function pythonJob(kind,folder,input){
  const rt=await runtime();return command(rt.python,[path.join(process.cwd(),'backend/cloud_worker.py'),kind,input,folder],{env:rt.env});
}
