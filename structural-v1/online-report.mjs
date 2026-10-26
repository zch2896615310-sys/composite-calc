import {serviceURL} from './public-runtime.mjs';
export async function onlineReport(payload){
 const response=await fetch(serviceURL('report','/api/report'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),value=await response.json();
 if(!response.ok)throw Error(value.error||'计算书提交失败');
 if(!value.job_id)return value;
 for(let i=0;i<300;i++){
  await new Promise(resolve=>setTimeout(resolve,2000));
  const r=await fetch(serviceURL('report','/api/jobs/'+value.job_id)),job=await r.json();
  if(!r.ok||job.status==='error')throw Error(job.message||job.error||'计算书导出失败');
  if(job.status==='done')return job.result;
 }
 throw Error('计算书仍在后台生成，请稍后重试');
}
