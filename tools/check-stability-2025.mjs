import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {stabilityDefaults,calculateStability2025 as calc,material2025,phiB1Lookup,bindStabilityEvidence,upgradeStabilityProject} from '../structural-v1/engines/stability-2025.mjs';
import {section} from '../structural-v1/engines/section.mjs';globalThis.fetch=async()=>({ok:true,json:async()=>({solverBase:'',reportBase:'',cadBase:''})});const {registry,evaluate,validateProject}=await import('../structural-v1/model.mjs');
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} vs ${b}`);
vm.runInThisContext(fs.readFileSync(new URL('../structural-v1/engines/beam-source.js',import.meta.url),'utf8'));
const notes={scopeBasis:'synthetic branch fixture',boundaryBasis:'specified end restraints',effectiveBasis:'specified effective section for branch test',torsionBasis:'specified same-axis torsion inputs',lambdaBasis:'specified equivalent slenderness for this load model',phiBasis:'specified manual coefficient fixture',phiBBasis:'specified B.2 result fixture',b2Basis:'specified simply supported segment',xi2Basis:'specified transverse load coefficient',materialBasis:'specified material values for thickness range test',bimomentBasis:'specified torsional response fixture'};
function ready(extra={},refs={}){const sec=section({shape:'box',b:50,h:50,tw:2,tf:2,E:206000});const i={...stabilityDefaults(),...notes,family:'closed',nominalT:2,A:sec.A,Ix:sec.Ix,Iy:sec.Iy,Wpositive:sec.WxTop,Wnegative:sec.WxBottom,effectiveMode:'gross',...extra};return bindStabilityEvidence(i,refs);}
test('B.1 has integer ordinary-lambda values, interpolation and strict bounds',()=>{
 near(phiB1Lookup(0),1);near(phiB1Lookup(100),.588);near(phiB1Lookup(102),.573);near(phiB1Lookup(102.5),(.573+.566)/2);near(phiB1Lookup(250),.117);assert.throws(()=>phiB1Lookup(250.001));assert.throws(()=>phiB1Lookup(-1));assert.throws(()=>phiB1Lookup(NaN));
});
test('table4.2.1 material endpoints are literal, no Q235 1.5mm extrapolation',()=>{
 const get=(grade,t)=>material2025({...stabilityDefaults(),grade,nominalT:t});assert.equal(get('Q235',1.5).valid,false);assert.equal(get('Q235',2).f,205);assert.equal(get('Q235',16).f,205);assert.equal(get('Q235',17).f,195);assert.equal(get('Q235',21).valid,false);assert.equal(get('Q355',16).fy,355);assert.equal(get('Q390',17).f,330);assert.equal(get('Q390',2).gammaR,1.125);assert.equal(get('S280',.6).valid,false);assert.equal(get('S280',.61).f,240);assert.equal(get('S550',.6).fy,530);assert.equal(get('S550',.9).fy,500);assert.equal(get('S550',1.2).fy,460);assert.equal(get('S550',1.5).fy,420);assert.equal(get('S550',1.5001).valid,false);
});
test('unknown template returns pending and null checks, never placeholder zero or old pass',()=>{
 const r=calc(stabilityDefaults());assert.equal(r.pass,null);assert.equal(r.pending,true);assert.equal(r.derived.sigmaIn,null);assert.equal(r.derived.phiOut,null);assert.equal(r.derived.phiB,null);assert.equal(r.derived.betaM,1);assert.equal(r.derived.gammaR,1.165);assert.ok(r.missing.some(x=>x.includes('1.5mm')));assert.ok(r.missing.some(x=>x.includes('It')));assert.ok(r.rows.every(x=>x.value===null||Number.isFinite(x.value)));
});
test('closed section uses2025 gammaR, D=1-Nphi/NE and eta=.7, phiB=1',()=>{
 const i=ready(),r=calc(i),d=r.derived;assert.equal(r.pass,true);const lambda=900/Math.sqrt(i.Ix/i.A),NE=Math.PI**2*206000*i.A/(1.165*lambda**2),phi=phiB1Lookup(lambda),D=1-1200/NE*phi;
 near(d.critical,NE);near(d.denominator,D);near(d.phiB,1);near(d.sigmaIn,1200/(phi*i.A)+10000/(D*i.Wpositive));near(d.sigmaOut,1200/(phi*i.A)+.7*10000/i.Wpositive);assert.notEqual(d.denominator,1-.8*1200/NE);
});
test('current transverse-load beta is1; .85 can only follow a valid pure-end moment ratio',()=>{
 near(calc(ready()).derived.betaM,1);near(calc(ready({betaMode:'endMoments',endMomentRatio:.625})).derived.betaM,.85);near(calc(ready({betaMode:'endMoments',endMomentRatio:-.5})).derived.betaM,.4);assert.throws(()=>calc(ready({betaMode:'endMoments',endMomentRatio:1.1})),/端弯矩比/);
 const refs={beam:{M:.01,q:1,model:{udl:[[0,1000,1,1]],points:[]}},beamInput:{axis:'x',P:1}};assert.throws(()=>calc(ready({betaMode:'endMoments'},refs),refs),/中间横向荷载/);
});
test('nonpositive amplification denominator fails without negative/infinite stress values',()=>{
 const r=calc(ready({N:1e9}));assert.equal(r.pass,false);assert.equal(r.pending,false);assert.ok(r.derived.denominator<0);assert.equal(r.derived.sigmaIn,null);assert.ok(r.rows.some(v=>v.pass===false));assert.ok(r.rows.every(x=>x.value===null||Number.isFinite(x.value)));
});
test('out-of-table lambda and other fy are pending unless supported manual phi is supplied',()=>{
 const r=calc(ready({lx:6000}));assert.equal(r.pass,null);assert.ok(r.missing.some(x=>x.includes('250')));const q=calc(ready({grade:'Q390'}));assert.equal(q.pass,null);assert.equal(q.derived.gammaR,1.125);
 const manual=calc(ready({grade:'Q390',phiMode:'manual',phiInManual:.8,phiOutManual:.8}));assert.equal(manual.pass,true);near(manual.derived.material.f,345);
});
test('old arbitrary coefficients do not substitute for material/effective/torsion evidence',()=>{
 const i={N:1.2,M:.01,A:189.17,W:904.09,ix:8.818,iy:12.552,E:206000,lx:900,ly:900,fy:235,f:215,phiX:.82,phiY:.91,phiB:.95,betaMx:.85,betaTx:.85,NEx:33.2,criticalMode:'manual',loadId:'',beamId:'',sectionId:''};const r=calc(i);assert.equal(r.pass,null);assert.equal(r.derived.betaM,1);assert.equal(r.derived.phiIn,null);assert.equal(r.derived.material.f,null);assert.notEqual(r.derived.critical,33200);
});
test('manual material requires basis bound to the current grade and thickness',()=>{
 const i=ready({nominalT:1.5,materialMode:'manual',fyManual:235,fManual:200});assert.equal(calc(i).pass,true);i.nominalT=1.4;assert.equal(calc(i).pass,null);bindStabilityEvidence(i);assert.equal(calc(i).pass,true);i.materialBasis='';assert.equal(calc(i).pass,null);
});
test('5.5.4 symmetric-plane path uses actual orthogonal axis in lambdaU and axial out-of-plane check',()=>{
 const i=ready({family:'mono_sym',axis:'x',symmetryAxis:'y',A:189.17,Ix:14711.13,Iy:29807.82,Wpositive:904.09,Wnegative:935.33,torsionMode:'manual',It:1000,Iw:1e6,e0:5,Uy:100000,torsionLength:900,xi2Manual:.46,ea:1,momentMode:'envelope'}),r=calc(i),d=r.derived;
 assert.equal(r.pass,true);assert.equal(d.phiB,null);const lsym=900/Math.sqrt(i.Iy/i.A),s2=lsym**2/i.A*(1e6/900**2+.039*1000),ex=.01*1e6/1200;
 const lambdas=[1,-1].map(sign=>{const e=sign*ex,ea=sign,a2=25+i.Ix/i.A+i.Iy/i.A+2*e*(100000/(2*i.Ix)-5-.46*ea);return lsym*Math.sqrt((s2+a2)/(2*s2)+Math.sqrt(((s2-a2)/(2*s2))**2+(5-e)**2/s2));});
 near(d.lambdaU,Math.max(...lambdas));near(d.sigmaOut,1200/(phiB1Lookup(d.lambdaU)*i.A));assert.ok(r.rows.some(v=>v.name==='剪心侧受压补充检验'));assert.equal(d.lambdaIn,d.lx);
});
test('5.5.4 manual lambdaU does not replace the geometric in-plane slenderness',()=>{
 const i=ready({family:'mono_sym',symmetryAxis:'y',lambdaMode:'manual',lambdaOutManual:120,lambdaInManual:1});const r=calc(i);assert.equal(r.pass,true);near(r.derived.lambdaIn,900/Math.sqrt(i.Ix/i.A));near(r.derived.phiOut,.452);assert.equal(r.derived.It,null);assert.equal(r.derived.phiB,null);
});
test('shear-centre-side supplementary denominator cannot be silently omitted',()=>{
 const i=ready({family:'mono_sym',lambdaMode:'manual',lambdaOutManual:120,effectiveMode:'manual',Ae:384,We:1000,WeSmall:0});const r=calc(i);assert.equal(r.pass,null);assert.equal(r.pending,true);assert.ok(r.missing.some(s=>s.includes('W′ey')));
});
test('5.5.5 non-symmetric-plane path requires B/Womega and equivalent in-plane lambda',()=>{
 const i=ready({family:'mono_non',symmetryAxis:'x',lambdaMode:'manual',lambdaInManual:110,phiBMode:'manual',phiBManual:.8,Womega:0});const missing=calc(i);assert.equal(missing.pass,null);assert.ok(missing.missing.some(s=>s.includes('双力矩')));i.Womega=10000;i.bimoment=100;bindStabilityEvidence(i);const r=calc(i);assert.equal(r.pass,true);near(r.derived.lambdaIn,110);near(r.derived.used,Math.PI**2*i.E*i.A/(1.165*110**2));near(r.derived.sigmaIn,1200/(phiB1Lookup(110)*i.A)+10000/(r.derived.denominator*i.Wpositive)+.01);
});
test('wrong symmetric-axis mapping, unverified I/H applicability and weak-axis double path stay pending',()=>{
 assert.equal(calc(ready({family:'mono_sym',symmetryAxis:'x',lambdaMode:'manual',lambdaOutManual:110})).pass,null);assert.equal(calc(ready({family:'double_sym',torsionMode:'ih'})).pass,null);assert.equal(calc(ready({family:'closed',Ix:1e4,Iy:2e4})).pass,null);
});
test('ideal I/H B.2 path calculates thin-wall It/Iomega, coefficients and phiB adjustment',()=>{
 const si={shape:'h',b:100,h:200,tw:5,tf:8,E:206000},s=section(si),refs={section:s,sectionInput:si};const i=ready({family:'double_sym',nominalT:8,torsionMode:'ih',b2Length:4000},refs),r=calc(i,refs),d=r.derived;assert.equal(r.pass,true);near(d.It,(2*100*8**3+184*5**3)/3);near(d.Iw,8*100**3*192**2/24);const lambda=4000/Math.sqrt(s.Iy/s.A),zeta=4*d.Iw/(200**2*s.Iy)+.156*d.It/s.Iy*(4000/200)**2,phi0=4320*s.A*200/(lambda**2*s.WxTop)*1.13*Math.sqrt(zeta);near(d.phiB0,phi0);near(d.phiB,phi0>.7?Math.min(1,1.091-.274/phi0):phi0);
});
test('evidence binding invalidates changed loads, dimensions and manual overrides',()=>{
 const i=ready();assert.equal(calc(i).pass,true);i.M*=2;assert.equal(calc(i).pass,null);bindStabilityEvidence(i);assert.equal(calc(i).pass,true);i.Ix*=1.01;assert.equal(calc(i).pass,null);bindStabilityEvidence(i);assert.equal(calc(i).pass,true);i.evidence={};assert.equal(calc(i).pass,null);
});
test('new example links N/M/section, stays pending, and preserves horizontal beam inputs',()=>{
 const p=validateProject(JSON.parse(fs.readFileSync(new URL('../structural-v1/examples/word-0920-6mm.json',import.meta.url),'utf8')).project),ev=evaluate(p);assert.equal(ev.errors.size,0);const st=p.modules.find(m=>m.type==='member_stability'),r=ev.results.get(st.id);near(r.derived.N,1204.632);near(r.derived.M,.012332140351907377*1e6);near(r.derived.gammaR,1.165);assert.equal(r.pass,null);assert.equal(r.derived.It,null);assert.ok(st.input.legacy2020);const h=p.modules.find(m=>m.name.startsWith('横向角钢梁'));near(ev.results.get(h.id).u,.2616534723680691);assert.match(h.input.model,/1525,1300,1300/);
});
test('legacy project upgrade is idempotent, preserves unrelated modules and original parameters',()=>{
 const original={id:'s',type:'member_stability',version:1,name:'old',input:{...stabilityDefaults(),codeEdition:undefined,phiX:.82,phiY:.91,phiB:.95,betaMx:.85,betaTx:.85,NEx:33.2,f:215}},other={id:'x',type:'beam',input:{q:99}},p={modules:[original,other]};assert.equal(upgradeStabilityProject(p),true);assert.equal(original.id,'s');assert.deepEqual(other,{id:'x',type:'beam',input:{q:99}});assert.equal(original.input.legacy2020.phiB,.95);assert.equal(original.input.codeEdition,'GB/T50018-2025');assert.equal(upgradeStabilityProject(p),false);assert.equal(calc(original.input).pass,null);
});
test('UI and report include missing conditions and normative formulas, no unused raw fields',()=>{
 const p=JSON.parse(fs.readFileSync(new URL('../structural-v1/examples/word-0920-6mm.json',import.meta.url),'utf8')).project,ev=evaluate(p),m=p.modules.find(m=>m.type==='member_stability'),ctx={project:p,instance:m,result:ev.results.get(m.id),...ev,errorHtml:''},def=registry.get(m.type);const html=def.render(ctx),report=def.report(ctx);assert.match(html,/当前待补条件/);assert.match(report,/5\.5\.4/);assert.ok(ctx.result.reportFormulas.some(s=>s.includes('φu')));assert.ok(def.reportInputs(ctx).some(row=>row[0].includes('旧输入历史')));assert.throws(()=>def.action(ctx,'verify-torsionConfirmed'),/填写该项依据/);
});
