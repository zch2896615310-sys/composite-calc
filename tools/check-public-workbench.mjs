import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const root=new URL('../structural-v1/',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
const near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(b)),`${a} vs ${b}`);
// The module's only startup request is deployment-owned services.json.
let config=JSON.parse(read('services.json'));
const requests=[];
globalThis.fetch=async url=>{requests.push(String(url));assert.equal(new URL(url).pathname.endsWith('/services.json'),true);return{ok:true,json:async()=>config};};
const runtime=await import(new URL('public-runtime.mjs',root));
const {registry,newProject,addModule,evaluate,validateProject}=await import(new URL('model.mjs',root));
const {beam}=await import(new URL('engines/beam.mjs',root));
const {instantiateExample,restoreExampleResults}=await import(new URL('example-project.mjs',root));
vm.runInThisContext(read('engines/beam-source.js'));

test('public build contains complete dependencies and only the selected example',()=>{
  const manifest=JSON.parse(read('build-manifest.json'));
  for(const name of manifest.files){
    assert.doesNotMatch(name,/fixtures|verification|ctower|reports|runs\//);
    const text=read(name);
    assert.doesNotMatch(text,/ctower|C塔|[DE]:[\\/]|127\.0\.0\.1|localhost|fixtures\//);
    const refs=name.endsWith('.mjs')?text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g):[];
    for(const [,ref]of refs)assert.ok(fs.existsSync(new URL(ref.split('?')[0],new URL(name,root))),`${name} -> ${ref}`);
  }
  assert.equal(fs.existsSync(new URL('fixtures/',root)),false);
  assert.deepEqual(manifest.examples,['examples/second-book-original-1.json']);
  assert.doesNotMatch(read(manifest.examples[0]),/[A-Za-z]:[\\/]|127\.0\.0\.1|localhost/);
});

test('static deployment never connects to visitor localhost or starts backend jobs',()=>{
  assert.deepEqual(runtime.services,{solverBase:'',reportBase:'',cadBase:''});
  for(const kind of ['solver','report','cad'])assert.throws(()=>runtime.serviceURL(kind,'/api/test'),/待接入/);
  assert.equal(requests.length,1);
  assert.equal(registry.has('original_comparison'),true);
});

test('second-book example restores verified original-1 results and remaps every reference',()=>{
  const bundle=JSON.parse(read('examples/second-book-original-1.json'));
  const p=validateProject(instantiateExample(bundle)),p2=instantiateExample(bundle),results=new Map();
  assert.notEqual(p.id,p2.id);
  assert.ok(p.modules.every(m=>!p2.modules.some(other=>m.id===other.id)));
  restoreExampleResults(p,bundle,results);
  const fem=p.modules.find(m=>m.type==='fem'),ctx={femResults:results,jobs:new Map()},ev=evaluate(p,ctx);
  assert.equal(fem.input.analysisKind,'layered');assert.equal(fem.input.mesh_mm,0);
  assert.equal(fem.input.project.loads.y_acceleration,1);assert.equal(fem.input.project.loads.x_acceleration,1);
  assert.equal(fem.input.project.supports.length,10);
  assert.equal(results.get(fem.id).elements,18);assert.equal(results.get(fem.id).nodes,28);
  assert.equal(ev.errors.size,0,JSON.stringify([...ev.errors]));
  assert.equal(p.modules.length,bundle.project.modules.length);
  const femCtx={...ctx,...ev,instance:fem,project:p,result:ev.results.get(fem.id),errorHtml:''};
  const html=registry.get('fem').render(femCtx);
  assert.ok(html.includes('示例结果快照'));assert.ok(html.includes('分层壳彩色云图'));assert.ok(html.includes('下载示例与结果快照'));
  assert.ok(html.includes('data-action="module:run" disabled'));
  const restored=validateProject(JSON.parse(JSON.stringify(p))),after=new Map();
  restoreExampleResults(restored,bundle,after);
  assert.equal(evaluate(restored,{...ctx,femResults:after}).errors.size,0);
  fem.input.project.loads.y_acceleration=2;
  const changed=evaluate(p,ctx);
  assert.ok(changed.errors.has(p.modules.find(m=>m.type==='panel_strength').id));
  const changedCtx={...ctx,...changed,instance:fem,project:p,result:changed.results.get(fem.id),errorHtml:''};
  assert.ok(registry.get('fem').render(changedCtx).includes('原结果已失效'));
  assert.ok(!registry.get('fem').render(changedCtx).includes('分层壳彩色云图'));
  assert.ok(!registry.get('fem').report(changedCtx).includes('层平均横向剪应力'));
});

test('public sections and linked beams recalculate and survive project JSON round trip',()=>{
  const p=newProject('公开联动验证'),s=addModule(p,'section',{}),b=addModule(p,'beam',{});
  b.input.sectionId=s.id;
  const run=()=>evaluate(p,{femResults:new Map()});
  const first=run();assert.equal(first.errors.size,0);
  near(first.results.get(s.id).Ix,(60*100**3-52*92**3)/12);
  near(first.results.get(b.id).M,1*1500**2/8/1e6);
  const before=first.results.get(b.id).u;s.input.h=150;
  assert.ok(run().results.get(b.id).u<before);
  const loaded=validateProject(JSON.parse(JSON.stringify(p)));
  near(evaluate(loaded,{femResults:new Map()}).results.get(b.id).u,run().results.get(b.id).u);
});

test('public beam units match independent simply-supported closed-form solutions',()=>{
  const input={...registry.get('beam').create(),model:'横梁连续梁\n段长 = 3000mm\n支点 = N0,N1\n均布 = 0,L,q\n集中 = 无\n传力支点 = 全部\n悬挑系数 = 2'};
  const r=beam(input,null);near(r.M,input.q*3000**2/8/1e6);near(r.u,5*input.q*3000**4/(384*input.E*input.I));
  input.model=input.model.replace('均布 = 0,L,q\n集中 = 无','均布 = 无\n集中 = S1:0.5,2');input.P=99;
  const point=beam(input,null);near(point.M,2000*3000/4/1e6);near(point.u,2000*3000**3/(48*input.E*input.I));near(point.reactions[0],1000);
});

test('configured backend and downloads stay on deployment-owned HTTPS addresses',async()=>{
  config={solverBase:'https://solver.example.com',reportBase:'https://reports.example.com',cadBase:''};
  const configured=await import(new URL('public-runtime.mjs?configured',root));
  assert.equal(configured.serviceURL('solver','/api/fem'),'https://solver.example.com/api/fem');
  assert.equal(configured.reportDownloadURL('/reports/result.docx'),'https://reports.example.com/reports/result.docx');
  assert.throws(()=>configured.reportDownloadURL('https://unexpected.example/result.docx'),/不一致/);
  config={solverBase:'http://127.0.0.1:8878',reportBase:'',cadBase:''};
  await assert.rejects(import(new URL('public-runtime.mjs?invalid',root)),/HTTPS/);
});
