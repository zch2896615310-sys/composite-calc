import fs from 'node:fs/promises';
import path from 'node:path';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import {store,getJob} from '../lib/jobs.mjs';
import {prepare,pythonJob} from '../lib/runtime.mjs';
import {reportHTML} from '../lib/report-html.mjs';
export default async req=>{
 const {id}=await req.json(),job=await getJob(id);if(!job||job.kind!=='report'||job.status!=='queued')return;
 const db=store();await db.setJSON('jobs/'+id,{...job,status:'running',message:'正在生成计算书…'});let folder,input,browser;
 try{
  const payload=await db.get('inputs/'+id,{type:'json'});({folder,input}=await prepare(id,payload));
  await pythonJob('report',folder,input);
  await db.set(`files/${id}/结构计算书.docx`,await fs.readFile(path.join(folder,'report.docx')));
  const result={docx_url:`/reports/${id}/结构计算书.docx`};
  if(payload.format==='pdf'){
   browser=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:true});
   const page=await browser.newPage();await page.setContent(reportHTML(payload,(await fs.readFile('backend/fonts/NotoSansCJKsc-Regular.otf')).toString('base64')),{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
   const pdf=await page.pdf({format:'A4',printBackground:true,margin:{top:'20mm',bottom:'20mm',left:'22mm',right:'22mm'},displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:9px;width:100%;text-align:center;color:#777"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'});
   await db.set(`files/${id}/结构计算书.pdf`,pdf);result.pdf_url=`/reports/${id}/结构计算书.pdf`;
  }
  await db.setJSON('results/'+id,result);await db.setJSON('jobs/'+id,{...job,status:'done',message:'计算书已生成'});
 }catch(e){console.error(e);await db.setJSON('jobs/'+id,{...job,status:'error',message:e.message});}
 finally{if(browser)await browser.close();if(folder?.startsWith('/tmp/stonecalc-jobs/runs/'))await fs.rm(folder,{recursive:true,force:true});if(input)await fs.rm(input,{force:true});}
};
