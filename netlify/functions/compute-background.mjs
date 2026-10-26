import fs from 'node:fs/promises';
import path from 'node:path';
import {store,getJob} from '../lib/jobs.mjs';
import {prepare,pythonJob} from '../lib/runtime.mjs';
export default async req=>{
 const {id}=await req.json(),job=await getJob(id);if(!job||job.kind!=='fem'||job.status!=='queued')return;
 const db=store();await db.setJSON('jobs/'+id,{...job,status:'running',message:'在线 CalculiX 正在计算三个工况及组合…'});
 let folder,input;
 try{
  const payload=await db.get('inputs/'+id,{type:'json'});({folder,input}=await prepare(id,payload));
  await pythonJob('fem',folder,input);
  const result=JSON.parse(await fs.readFile(path.join(folder,'summary.json'),'utf8'));
  await db.setJSON('results/'+id,result);
  for(const name of ['summary.json','input.json','EQ_Y/panel.inp','EQ_Y/panel.dat','EQ_Y/solver.log','EQ_Y/precision_refinement.json']){
   try{const data=await fs.readFile(path.join(folder,name));if(data.length<4_500_000)await db.set(`files/${id}/${name}`,data);}catch{}
  }
  await db.setJSON('jobs/'+id,{...job,status:'done',message:'在线有限元计算完成'});
 }catch(e){console.error(e);await db.setJSON('jobs/'+id,{...job,status:'error',message:e.message});}
 finally{if(folder?.startsWith('/tmp/stonecalc-jobs/runs/'))await fs.rm(folder,{recursive:true,force:true});if(input)await fs.rm(input,{force:true});}
};
