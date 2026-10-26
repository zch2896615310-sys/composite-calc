globalThis.fetch=async()=>({ok:true,json:async()=>({solverBase:'',reportBase:'',cadBase:''})});
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {biaxialDefaults,calculateBiaxial as calc,ensureBiaxialAngleExample,BIAXIAL_TYPE} from '../structural-v1/engines/beam-biaxial.mjs';
import {beam} from '../structural-v1/engines/beam.mjs';
import {section} from '../structural-v1/engines/section.mjs';
const {registry,evaluate,validateProject}=await import('../structural-v1/model.mjs');
import {beamCurveData,probeBeamCurve} from '../structural-v1/beam-curve.mjs';
import {failureCells} from '../structural-v1/report-status.mjs';
vm.runInThisContext(fs.readFileSync(new URL('../structural-v1/engines/beam-source.js',import.meta.url),'utf8'));
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<=tol*Math.max(1,Math.abs(b)),`${a} != ${b}`),L=3000;
const input=(o={})=>({...biaxialDefaults(),model:'横梁连续梁\n段长 = 3000mm\n支点 = N0,N1\n均布 = 0,L,q\n集中 = 无\n传力支点 = 全部\n悬挑系数 = 2\n自重 = 不计\n自重系数 = 1.2',...o});
const value=(r,dir,x)=>{const e=r.elements.find(e=>x>=e.a&&x<=e.b);return poly(e['u'+dir],(x-e.a)/(e.b-e.a));};
const sec=()=>section({shape:'angle',h:50,b:50,tw:3,E:206000});
test('diagonal section reproduces both independent closed-form uniform-load deflections and moments',()=>{
 const i=input({Ix:2e6,Iy:5e6,q:2,udlX:[{start:0,end:L,q:3}]}),r=calc(i);near(value(r,'Y',L/2),5*2*L**4/(384*i.E*i.Ix));near(value(r,'X',L/2),5*3*L**4/(384*i.E*i.Iy));near(r.channels.Y.M,2*L*L/8/1e6);near(r.channels.X.M,3*L*L/8/1e6);near(r.balanceY.force,0);near(r.balanceX.moment,0);near(r.channels.Y.u,beam({...i,I:i.Ix,axis:'x'},null).u);
});
test('coupled uniform loads match the analytical inverse inertia matrix, including lateral displacement without lateral load',()=>{
 const i=input({Ix:2e6,Iy:4e6,Ixy:-8e5,q:2}),r=calc(i),det=i.Ix*i.Iy-i.Ixy**2,C=5*L**4/(384*i.E);near(value(r,'Y',L/2),C*i.Iy*2/det);near(value(r,'X',L/2),-C*i.Ixy*2/det);near(r.channels.X.M,0,1e-8);near(r.bendingResultant,Math.hypot(value(r,'Y',L/2),value(r,'X',L/2)));const b=calc({...i,Ixy:-i.Ixy});near(value(b,'X',L/2),-value(r,'X',L/2));near(value(b,'Y',L/2),value(r,'Y',L/2));
});
test('rotating section and load vector together rotates displacements consistently',()=>{
 const i=input({Ix:2e6,Iy:4e6,Ixy:-8e5,q:2,udlX:[{start:0,end:L,q:3}]}),a=calc(i),angle=31,t=angle*Math.PI/180,c=Math.cos(t),s=Math.sin(t),b=calc({...i,rotation:angle,q:3*s+2*c,udlX:[{start:0,end:L,q:3*c-2*s}]});near(value(b,'X',L/2),c*value(a,'X',L/2)-s*value(a,'Y',L/2));near(value(b,'Y',L/2),s*value(a,'X',L/2)+c*value(a,'Y',L/2));near(a.bendingResultant,b.bendingResultant);
});
test('continuous lateral restraint reproduces the old constrained-direction EI, with zero X displacement',()=>{
 const s=sec(),i=input({sectionId:'s',xSupportMode:'continuous'}),r=calc(i,s),old=beam({...i,sectionId:'',I:s.Ix,axis:'x'},null);near(r.channels.Y.u,old.u);near(r.channels.X.u,0);near(r.channels.Y.M,old.M);assert.ok(r.channels.X.M>0);near(r.balanceX.force,0);near(r.balanceX.moment,0,1e-5);
});
test('fixed bending rotations reproduce the fixed-end analytical solution, including support reaction moments',()=>{
 const i=input({fixedYRotations:'N0,N1'}),r=calc(i);near(r.channels.Y.u,L**4/(384*i.E*i.Ix));near(r.channels.Y.M,L*L/12/1e6);near(Math.abs(r.reactions[0].CY),L*L/12);near(r.balanceY.moment,0,1e-5);
});
test('different directional support locations remain coupled and satisfy global equilibrium',()=>{
 const i=input({model:input().model.replace('3000mm','1000,1000,1000mm').replace('N0,N1\n','N0,N1,N2,N3\n'),Ix:2e6,Iy:4e6,Ixy:8e5,xSupportMode:'custom',xSupports:'N0,N3',pointsX:[{position:1200,P:.2}]}),r=calc(i);assert.ok(r.channels.X.M>0);assert.ok(r.channels.X.u>0);near(r.balanceY.force,0,1e-5);near(r.balanceY.moment,0,1e-5);near(r.balanceX.force,0,1e-5);near(r.balanceX.moment,0,1e-5);
});
test('partial UDL and off-node concentrated loads are meshed at discontinuities with exact recovery',()=>{
 const i=input({Ix:2e6,Iy:4e6,Ixy:5e5,model:input().model.replace('均布 = 0,L,q','均布 = 430,2500,1.7').replace('集中 = 无','集中 = 827,0.3'),pointsX:[{position:1751,P:-.12}]}),r=calc(i);for(const x of [430,2500,827,1751])assert.ok(r.mesh.includes(x));near(r.balanceY.force,0,1e-5);near(r.balanceX.moment,0,1e-5);const data=beamCurveData(r.channels.Y,'V'),v=probeBeamCurve(data.elements,827);assert.equal(v.length,2);near(Math.abs(v[0].value-v[1].value),.3);
});
test('Saint-Venant end torque matches TL/GJ and contributes displacement at the eccentric load line',()=>{
 const i=input({q:0,J:1000,eX:10,torsionMode:'stvenant',twistSupports:'N0',model:input().model.replace('均布 = 0,L,q','均布 = 无').replace('集中 = 无','集中 = L,1')}),r=calc(i),G=i.E/(2*(1+i.nu)),phi=1000*10*L/(G*i.J);near(r.torsion.theta,phi*180/Math.PI);near(r.torsion.T,.01);near(r.torsion.atLoad.Y,10*phi);near(r.torsion.torqueResidual,0);assert.equal(r.pass,null);assert.ok(r.missing.some(s=>s.includes('翘曲')));
});
test('distributed eccentric load matches fixed-end torsion and signed torque from both load components',()=>{
 const i=input({J:2000,eX:10,torsionMode:'stvenant',twistSupports:'N0,N1'}),r=calc(i),G=i.E/(2*(1+i.nu));near(r.torsion.theta,10*L*L/(8*G*i.J)*180/Math.PI);near(r.torsion.T,10*L/2/1e6);const zero=calc({...i,eY:5,udlX:[{start:0,end:L,q:2}]});near(zero.torsion.T,0);near(zero.torsion.theta,0);
});
test('thin-wall J is an explicit angle approximation and never polar Ix+Iy',()=>{
 const si={shape:'angle',h:50,b:50,tw:3,E:206000},r=calc(input({sectionId:'s',torsionMode:'stvenant',Jmode:'thin-angle'}),section(si),globalThis,null,si);near(r.torsion.J,873);assert.notEqual(r.torsion.J,r.inertia.Ix+r.inertia.Iy);assert.throws(()=>calc(input({torsionMode:'stvenant',Jmode:'thin-angle'})),/理想角钢/);
});
test('invalid inertia, missing torsion restraint and unsupported geometry never report a pass',()=>{
 for(const o of [{Ixy:2e6},{Ix:0},{rotation:NaN},{torsionMode:'stvenant',J:0},{torsionMode:'stvenant',J:1000,twistSupports:''},{xSupportMode:'custom',xSupports:'N0'},{pointsX:[{position:3001,P:1}]},{udlX:[{start:500,end:400,q:1}]},{fixedYRotations:'1300'}])assert.throws(()=>calc(input(o)));
 const r=calc(input());assert.equal(r.pending,true);assert.equal(r.torsion,null);assert.equal(r.pass,null);assert.equal(r.channels.X.u,0);
});
test('formula pass requires current boundary and no-torque evidence; changing installation invalidates it',()=>{
 const i=input({boundaryBasis:'known boundary',torsionMode:'verified-no-torque',torsionBasis:'load at shear centre'}),r=calc(i);i.boundaryConfirmed='yes';i.boundaryKey=r.boundaryKey;i.noTorqueKey=r.noTorqueKey;assert.equal(calc(i).pass,true);assert.equal(calc({...i,rotation:45}).pending,true);assert.equal(calc({...i,q:2}).pending,true);
});
test('high loading fails deflection while unresolved scope stays explicit; report highlights its numeric result',()=>{
 const r=calc(input({q:100}));assert.equal(r.pass,false);assert.equal(r.pending,false);assert.ok(r.missing.length);assert.deepEqual(failureCells([['检验项目','计算值','限值','单位','判断'],['Y向挠度',String(r.channels.Y.utilization*100),'100','%','不满足']])[1],[true,true,false,false,true]);
});
test('example migration inserts once, preserves original modules and does not re-add a deleted comparison',()=>{
 const p=JSON.parse(fs.readFileSync(new URL('../structural-v1/examples/word-0920-6mm.json',import.meta.url),'utf8')).project;p.modules=p.modules.filter(m=>m.type!==BIAXIAL_TYPE);delete p.biaxialAngleAdded;const before=structuredClone(p.modules);assert.equal(ensureBiaxialAngleExample(p),true);assert.equal(ensureBiaxialAngleExample(p),false);assert.deepEqual(p.modules.filter(m=>m.type!==BIAXIAL_TYPE),before);p.modules=p.modules.filter(m=>m.type!==BIAXIAL_TYPE);assert.equal(ensureBiaxialAngleExample(p),false);
});
test('live angle example, JSON persistence and report retain two directions, unknown torsion and original single-axis reference',()=>{
 const p=validateProject(JSON.parse(fs.readFileSync(new URL('../structural-v1/examples/word-0920-6mm.json',import.meta.url),'utf8')).project),ev=evaluate(p);assert.equal(ev.errors.size,0,JSON.stringify([...ev.errors]));assert.equal(p.modules.length,20);const m=p.modules.find(m=>m.type===BIAXIAL_TYPE),r=ev.results.get(m.id);assert.ok(r.channels.X.u>0);assert.ok(r.channels.Y.u>.26165);assert.equal(r.torsion,null);assert.equal(r.pending,true);const old=p.modules.find(m=>m.type==='beam'&&m.name.startsWith('横向角钢梁'));near(ev.results.get(old.id).u,.2616534723680691);const def=registry.get(BIAXIAL_TYPE),ctx={project:p,instance:m,result:r,errorHtml:''};assert.throws(()=>def.action(ctx,'confirm-boundary'),/待核定/);assert.match(def.report(ctx),/X向/);assert.match(def.report(ctx),/Y向/);assert.match(def.report(ctx),/尚未计算/);assert.ok(def.reportInputs(ctx).some(v=>v[0]==='实际Ix、Iy、Ixy / mm⁴'));assert.equal(evaluate(validateProject(JSON.parse(JSON.stringify(p)))).errors.size,0);
});
