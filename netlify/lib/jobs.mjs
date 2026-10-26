import {getStore} from '@netlify/blobs';
export const jobId=()=>crypto.randomUUID().replaceAll('-','');
export const validId=id=>/^[a-f0-9]{32}$/.test(id);
export const store=()=>getStore({name:'stonecalc-jobs-v1',consistency:'strong'});
export const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function getJob(id){
  if(!validId(id))return null;
  const job=await store().get('jobs/'+id,{type:'json'});
  return job&&Date.now()-job.created<86400000?job:null;
}
export async function dispatch(req,id,kind,format){
  const worker=kind==='fem'?'compute':format==='pdf'?'pdf':'report';
  const response=await fetch(new URL(`/.netlify/functions/${worker}-background`,req.url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
  if(!response.ok)throw Error('后台任务启动失败：'+response.status);
}
