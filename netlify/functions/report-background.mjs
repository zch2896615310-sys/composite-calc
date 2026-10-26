import fs from 'node:fs/promises';
import path from 'node:path';
import {store,getJob} from '../lib/jobs.mjs';
import {prepare,pythonJob} from '../lib/runtime.mjs';
export default async req=>{
 const {id}=await req.json(),job=await getJob(id);if(!job||job.kind!=='report'||job.status!=='queued')return;
 const db=store();await db.setJSON('jobs/'+id,{...job,status:'running',message:'正在生成 Word 计算书…'});let folder,input;
 try{
  const payload=await db.get('inputs/'+id,{type:'json'});({folder,input}=await prepare(id,payload));
  await pythonJob('report',folder,input);
  await db.set(`files/${id}/结构计算书.docx`,await fs.readFile(path.join(folder,'report.docx')));
  const result={docx_url:`/reports/${id}/结构计算书.docx`};
  await db.setJSON('results/'+id,result);await db.setJSON('jobs/'+id,{...job,status:'done',message:'计算书已生成'});
 }catch(e){console.error(e);await db.setJSON('jobs/'+id,{...job,status:'error',message:e.message});}
 finally{if(folder?.startsWith('/tmp/stonecalc-jobs/runs/'))await fs.rm(folder,{recursive:true,force:true});if(input)await fs.rm(input,{force:true});}
};
