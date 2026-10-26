globalThis.fetch=async()=>({ok:true,json:async()=>({solverBase:'',reportBase:'',cadBase:''})});
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
vm.runInThisContext(fs.readFileSync(new URL('../structural-v1/engines/beam-source.js',import.meta.url),'utf8'));
import {LEGACY_TYPE,legacyDefaults,calculateLegacyStability as calc,ensureLegacyWordComparison} from '../structural-v1/engines/stability-legacy2020.mjs';
const {registry,validateProject,evaluate}=await import('../structural-v1/model.mjs');
import {upgradeStabilityProject} from '../structural-v1/engines/stability-2025.mjs';
import {failureCells} from '../structural-v1/report-status.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b)),`${a} != ${b}`);
test('original steps recalculate slenderness and stress ratios without copying arithmetic errors',()=>{
 const r=calc(legacyDefaults()),d=r.derived;near(d.lx,900/8.818);near(d.ly,900/12.552);near(d.normalizedX,1.0972936430421407);near(d.normalizedY,.7708680165985974);near(d.critical,Math.PI**2*206000*189.17/(1.1*d.lx**2));near(d.used,33200);near(d.inPlane,.08101231194555256);near(d.outPlane,.07845314369504641);assert.equal(r.pass,true);assert.notEqual(d.normalizedX,.348);
});
test('manual NEx and calculated NEx remain separate as length changes',()=>{
 const i=legacyDefaults(),a=calc(i);i.lx=1800;const b=calc(i);near(b.derived.critical,a.derived.critical/4);near(b.derived.used,33200);i.criticalMode='formula';const c=calc(i);near(c.derived.used,c.derived.critical);assert.notEqual(c.derived.inPlane,b.derived.inPlane);
});
test('references override backups and axis selection follows actual section',()=>{
 const i=legacyDefaults(),refs={loads:{gd:.312},beam:{M:.02},beamInput:{axis:'x'},section:{A:200,Ix:20000,Iy:80000,WxTop:1000,WxBottom:900,WyLeft:2000,WyRight:1800,E:206000}};
 const d=calc(i,refs).derived;near(d.N,1204.632);near(d.M,20000);near(d.ix,10);near(d.iy,20);near(d.W,900);refs.beamInput.axis='y';i.axis='y';const e=calc(i,refs).derived;near(e.ix,20);near(e.iy,10);near(e.W,1800);i.axis='x';assert.throws(()=>calc(i,refs),/弯曲轴/);refs.section.coupled=true;refs.beamInput.axis='x';assert.throws(()=>calc(i,refs),/耦合/);
});
test('invalid amplification stops ratios, high moments fail, report failure cells are red',()=>{
 const r=calc({...legacyDefaults(),N:50});assert.equal(r.pass,false);assert.equal(r.derived.inPlane,null);assert.equal(r.derived.outPlane,null);assert.ok(r.rows.some(v=>v.pass===false));const a=calc({...legacyDefaults(),M:1});assert.equal(a.pass,false);assert.ok(a.derived.inPlane>1);assert.deepEqual(failureCells([['项目','计算值','限值','判断'],['平面内',String(a.derived.inPlane),'1','不满足']])[1],[true,true,false,true]);
 for(const change of [{phiX:0},{phiB:1.1},{f:0},{ix:0},{betaMx:-1},{N:-1},{M:NaN},{NEx:0}])assert.throws(()=>calc({...legacyDefaults(),...change}));
});
test('migration inserts independent legacy comparison once without modifying current checks',()=>{
 const p={reportInfo:{paragraphs:[],sourceSha256:'d085c3c08090d08035a9d4ff640201e2c408420732fd2752bd1bfcbddea5f20c'},modules:[{id:'2025',type:'member_stability',version:1,name:'2025',input:{codeEdition:'GB/T50018-2025',legacy2020:{N:1.2,phiB:.95}}},{id:'angle',type:'beam',input:{I:1,model:'UNCHANGED'}}]},before=structuredClone(p.modules);assert.equal(ensureLegacyWordComparison(p),true);assert.equal(ensureLegacyWordComparison(p),false);assert.deepEqual(p.modules.filter(m=>m.type!==LEGACY_TYPE),before);assert.equal(p.modules[1].type,LEGACY_TYPE);assert.equal(upgradeStabilityProject(p),false);assert.equal(p.modules[1].input.codeEdition,'original-2020-labelled');assert.equal(ensureLegacyWordComparison({modules:[]}),false);p.modules=p.modules.filter(m=>m.type!==LEGACY_TYPE);assert.equal(ensureLegacyWordComparison(p),false);
});
test('module round trips and report identifies manual coefficients, printed differences and equations',()=>{
 const def=registry.get(LEGACY_TYPE),i=def.create();def.validate(i);assert.throws(()=>def.validate({...i,codeEdition:'GB/T50018-2025'}));const p=validateProject({schemaVersion:1,id:'test',name:'test',modules:[{id:'legacy',name:'原书2020标注',type:LEGACY_TYPE,version:1,input:i}]}),ev=evaluate(p);assert.equal(ev.errors.size,0);const ctx={project:p,instance:p.modules[0],result:ev.results.get('legacy'),errorHtml:''};for(const x of [def.render(ctx),def.report(ctx)]){assert.match(x,/不按长细比自动查表/);assert.match(x,/0.348/);assert.match(x,/1.097294/);assert.match(x,/历史公式复算/);}assert.ok(def.reportInputs(ctx).some(r=>r[0]==='系数依据'));assert.ok(ctx.result.reportFormulas.some(s=>s.includes('0.8')));assert.equal(evaluate(validateProject(JSON.parse(JSON.stringify(p)))).errors.size,0);
});
test('example2 has parallel independent stability checks and unchanged angle beam',()=>{
 const p=JSON.parse(fs.readFileSync(new URL('../structural-v1/examples/word-0920-6mm.json',import.meta.url),'utf8')).project;assert.equal(p.modules.length,20);const a=p.modules.find(m=>m.type==='member_stability'),b=p.modules.find(m=>m.type===LEGACY_TYPE),saved=JSON.stringify(a);let ev=evaluate(p);assert.equal(ev.errors.size,0);assert.equal(ev.results.get(a.id).pending,true);near(ev.results.get(b.id).derived.inPlane,.08101231194555256);b.input.phiX=.5;assert.equal(JSON.stringify(a),saved);ev=evaluate(p);assert.equal(ev.results.get(a.id).pending,true);const angle=p.modules.find(m=>m.name.startsWith('横向角钢梁'));near(ev.results.get(angle.id).u,.2616534723680691);
});
