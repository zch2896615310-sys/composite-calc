import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
globalThis.fetch=async()=>({ok:true,json:async()=>({solverBase:'',reportBase:'',cadBase:''})});
const {registry,evaluate,validateProject}=await import('../structural-v1/model.mjs');
import {instantiateExample} from '../structural-v1/example-project.mjs';
import {calculateStability2025} from '../structural-v1/engines/stability-2025.mjs';
import {connectionCheck} from '../structural-v1/modules/connection-checks.mjs';
import {failureCells} from '../structural-v1/report-status.mjs';
const read=s=>JSON.parse(fs.readFileSync(new URL('../structural-v1/'+s,import.meta.url),'utf8'));
const bundle=read('examples/word-0920-6mm.json'),snapshot=JSON.stringify(bundle);
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol*Math.max(1,Math.abs(b)),`${a} vs ${b}`);
vm.runInThisContext(fs.readFileSync(new URL('../structural-v1/engines/beam-source.js',import.meta.url),'utf8'));
const fresh=()=>validateProject(instantiateExample(bundle));
const byType=(p,t)=>p.modules.find(m=>m.type===t);
test('20-module Word example is separate, fully evaluable, round-trippable and remaps every reference',()=>{
 const p=fresh(),q=fresh(),ids=new Set(p.modules.map(m=>m.id));
 assert.equal(p.modules.length,20);assert.ok(!byType(p,'fem'));assert.notEqual(p.id,q.id);
 for(const m of p.modules){assert.ok(!q.modules.some(n=>m.id===n.id));for(const[k,v]of Object.entries(m.input))if(k.endsWith('Id')&&v)assert.ok(ids.has(v),k);}
 assert.equal(evaluate(p).errors.size,0);assert.equal(evaluate(validateProject(JSON.parse(JSON.stringify(p)))).errors.size,0);assert.equal(JSON.stringify(bundle),snapshot);
});
test('adopted selfweight and unrounded design/service line loads retain distinct source bases',()=>{
 const p=fresh(),ev=evaluate(p),l=byType(p,'loads'),r=ev.results.get(l.id);near(r.exact,.2346775);near(r.gk,.24);near(r.gd,.312);near(r.qEk,.096);near(r.qE,.1344);near(r.qELine,.17472);near(r.qEkLine,.1248);
 const h=ev.results.get(byType(p,'hanger_demand').id);near(h.derived.N,.0648648);near(h.derived.V,.602316);assert.equal(h.pass,null);assert.equal(h.pending,true);
 l.input.adopted=.48;const changed=evaluate(p);near(changed.results.get(byType(p,'hanger_demand').id).derived.N,h.derived.N*2);const originalBeam=p.modules.find(m=>m.name==='原图0.17kN/m复现');near(changed.results.get(originalBeam.id).u,ev.results.get(originalBeam.id).u);
});
test('trial demands remain pending until report and measured values exist, then can fail',()=>{
 for(const type of ['hanger_demand','anchor_test']){const i=registry.get(type).create();assert.equal(connectionCheck(type,i).pass,null);i.reportNo='QA-REPORT';if(type==='hanger_demand'){i.testedN=.1;i.testedV=.7;}else i.tested=.5;assert.equal(connectionCheck(type,i).pass,true);if(type==='hanger_demand')i.testedV=.1;else i.tested=.1;assert.equal(connectionCheck(type,i).pass,false);i.reportNo='';assert.equal(connectionCheck(type,i).pass,null);}
});
test('stability uses2025 paths and remains pending without material and warping evidence',()=>{
 const i=registry.get('member_stability').create(),r=calculateStability2025(i),d=r.derived;
 near(d.normalizedX,(900/Math.sqrt(i.Ix/i.A))/Math.PI*Math.sqrt(235/206000));near(d.critical,Math.PI**2*i.E*i.A/(1.165*d.lx**2));near(d.betaM,1);assert.equal(r.pass,null);assert.equal(r.pending,true);assert.equal(d.phiOut,null);assert.equal(d.sigmaIn,null);assert.ok(r.missing.some(s=>s.includes('1.5mm')));
});
test('optional stability and bracket references use actual section/beam/load results',()=>{
 const p=fresh(),s=p.modules.find(m=>m.input.shape==='cad'),b=p.modules.find(m=>m.name==='1300mm设计荷载连续梁'),l=byType(p,'loads'),st=byType(p,'member_stability'),br=byType(p,'bracket_strength');Object.assign(st.input,{sectionId:s.id,beamId:b.id,loadId:l.id,criticalMode:'formula'});Object.assign(br.input,{loadId:l.id,beamId:b.id,sectionId:p.modules.find(m=>m.name.startsWith('角码等效')).id});const ev=evaluate(p);assert.equal(ev.errors.size,0);const r=ev.results.get(st.id);near(r.derived.N,1204.632);near(r.derived.M,ev.results.get(b.id).M*1e6);near(r.derived.used,r.derived.critical);near(ev.results.get(br.id).derived.G,1.204632);near(ev.results.get(br.id).derived.F,ev.results.get(b.id).R);
});
test('bracket net geometry and source adopted load formula agree independently',()=>{
 const p=fresh(),ev=evaluate(p),s=ev.results.get(p.modules.find(m=>m.name.startsWith('角码等效')).id),r=ev.results.get(byType(p,'bracket_strength').id);near(s.A,102.5);near(s.Ix,25889.79166667);near(s.WxTop,1035.59166667);near(r.derived.sigma,100/102.5+36000/(1.05*1035.59));near(r.derived.tau,600/102.5);
});
test('horizontal point loads have original geometry, force/moment equilibrium and explicit uncoupled basis',()=>{
 const p=fresh(),ev=evaluate(p),m=p.modules.find(m=>m.name.startsWith('横向角钢梁')),r=ev.results.get(m.id);assert.deepEqual(r.model.lengths,[1525,1300,1300]);assert.deepEqual(r.model.points.map(a=>[a[0],a[2]]),[[875,100],[2175,100],[3475,100]]);near(r.reactions.reduce((a,v)=>a+v,0),300);near(r.reactions.reduce((a,v,j)=>a+v*r.model.supports[j],0),652500);near(r.forceResidual,0);near(r.momentResidual,0,1e-5);near(r.u,.261653472368069);near(r.R,.12543585890511);assert.match(m.input.basisNote,/Ixy≠0/);assert.equal(m.input.sectionId,'');m.input.sectionId=p.modules.find(m=>m.input.shape==='angle').id;assert.match(evaluate(p).errors.get(m.id),/不支持耦合/);
});
test('comparison follows live references, keeps printed values and records pending/source assumptions',()=>{
 const p=fresh(),c=byType(p,'word0920_comparison'),ev=evaluate(p),r=ev.results.get(c.id);assert.equal(r.rows.find(a=>a[0]==='x向正则化长细比')[1],'0.348');assert.equal(r.rows.find(a=>a[0]==='横向角钢梁挠度')[1],'0.33');near(r.rows.find(a=>a[0]==='现场拉拔需求')[2],.4);const html=registry.get(c.type).report({instance:c,project:p,result:r});assert.match(html,/1330\/250实为5.32/);assert.match(html,/2025/);assert.match(html,/SHA-256/);
});
test('new module report failure flags include numerical result and judgment',()=>{
 const r=connectionCheck('bracket_strength',{...registry.get('bracket_strength').create(),f:10});assert.equal(r.pass,false);const flags=failureCells([['项目','公式','计算值 / 需求值','限值 / 实测值','单位','判断'],['角码组合正应力','σ',String(r.derived.sigma),'10','MPa','不满足']]);assert.deepEqual(flags[1],[true,false,true,false,false,true]);
});
