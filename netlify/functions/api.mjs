import fs from 'node:fs/promises';
import {jobId,store,json,getJob,dispatch} from '../lib/jobs.mjs';
export default async(req)=>{
  try{
    const url=new URL(req.url),route=decodeURIComponent(url.pathname),origin=req.headers.get('Origin');
    if(origin&&origin!==url.origin)return json({error:'请求来源不允许'},403);
    if(req.method==='GET'&&route==='/api/health')return json({ok:true,engine:'CalculiX 2.23',features:['solid-ip-v2','layered-shell-v1','docx','pdf'],version:2});
    if(req.method==='GET'&&route==='/api/default-fem'){
      const bundle=JSON.parse(await fs.readFile('structural-v1/examples/second-book-original-1.json','utf8'));
      return json(bundle.project.modules.find(m=>m.type==='fem').input.project);
    }
    if(req.method==='POST'&&['/api/fem','/api/report'].includes(route)){
      const text=await req.text();if(text.length>5_500_000)return json({error:'请求过大，请减少计算书中的图片或模块'},413);
      const payload=JSON.parse(text),kind=route==='/api/fem'?'fem':'report';
      if(kind==='fem'){
        if(!payload.project||!Number.isFinite(payload.mesh_mm)||!['solid-ip-v2','layered-shell-v1'].includes(payload.postprocess))return json({error:'有限元参数格式无效'},400);
        if(text.length>200000)return json({error:'有限元模型输入过大'},400);
      }else if(!payload.title||!Array.isArray(payload.sections)||!['pdf','docx'].includes(payload.format))return json({error:'计算书参数无效'},400);
      const id=jobId();await store().setJSON('jobs/'+id,{id,kind,created:Date.now(),status:'queued',message:kind==='fem'?'已加入在线有限元队列':'已加入计算书导出队列'});
      await store().setJSON('inputs/'+id,payload);await dispatch(req,id,kind);
      return json({job_id:id,status:'queued'},202);
    }
    const jobMatch=/^\/api\/jobs\/([a-f0-9]{32})$/.exec(route);
    if(req.method==='GET'&&jobMatch){const job=await getJob(jobMatch[1]);if(!job)return json({error:'任务不存在或已过期'},404);if(job.status==='done')job.result=await store().get('results/'+job.id,{type:'json'});return json(job);}
    const file=/^\/(runs|reports)\/([a-f0-9]{32})\/(.+)$/.exec(route);
    if(req.method==='GET'&&file){
      if(!await getJob(file[2]))return json({error:'文件不存在或已过期'},404);
      const data=await store().get(`files/${file[2]}/${file[3]}`,{type:'arrayBuffer'});
      if(!data)return json({error:'文件未生成'},404);
      const type=file[3].endsWith('.pdf')?'application/pdf':file[3].endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':file[3].endsWith('.json')?'application/json':'text/plain; charset=utf-8';
      return new Response(data,{headers:{'Content-Type':type,'Cache-Control':'private, no-store','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file[3].split('/').at(-1))}`}});
    }
    return json({error:'未找到接口'},404);
  }catch(e){console.error(e);return json({error:e.message||'在线服务错误'},400);}
};
export const config={path:['/api/*','/runs/*','/reports/*']};
