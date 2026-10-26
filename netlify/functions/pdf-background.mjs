import fs from 'node:fs/promises';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import {store,getJob} from '../lib/jobs.mjs';
import {reportHTML} from '../lib/report-html.mjs';
export default async req=>{
 const {id}=await req.json(),job=await getJob(id);if(!job||job.kind!=='report'||job.status!=='queued')return;
 const db=store();await db.setJSON('jobs/'+id,{...job,status:'running',message:'正在生成 PDF 计算书…'});let browser;
 try{
  const payload=await db.get('inputs/'+id,{type:'json'}),font=(await fs.readFile('backend/fonts/NotoSansCJKsc-Regular.otf')).toString('base64');
  browser=await puppeteer.launch({args:chromium.args,executablePath:await chromium.executablePath(),headless:true});
  const page=await browser.newPage();await page.setContent(reportHTML(payload,font),{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
  const pdf=await page.pdf({format:'A4',printBackground:true,margin:{top:'20mm',bottom:'20mm',left:'22mm',right:'22mm'},displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:9px;width:100%;text-align:center;color:#777"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'});
  await db.set(`files/${id}/结构计算书.pdf`,pdf);
  await db.setJSON('results/'+id,{pdf_url:`/reports/${id}/结构计算书.pdf`});await db.setJSON('jobs/'+id,{...job,status:'done',message:'PDF 计算书已生成'});
 }catch(e){console.error(e);await db.setJSON('jobs/'+id,{...job,status:'error',message:e.message});}
 finally{if(browser)await browser.close();}
};
