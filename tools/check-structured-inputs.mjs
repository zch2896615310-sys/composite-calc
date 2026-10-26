import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sectionModule from '../structural-v1/modules/section.mjs';
globalThis.fetch=async()=>({ok:true,json:async()=>({solverBase:'',reportBase:'',cadBase:''})});
const {default:fem,femRequest,inputKey}=await import('../structural-v1/modules/fem.mjs');
import {section} from '../structural-v1/engines/section.mjs';
import {biaxialDefaults,calculateBiaxial} from '../structural-v1/engines/beam-biaxial.mjs';
import {rectangleEditor,layerEditor,breakpointEditor,dofEditor,materialsEditor,changeFemInput,femListAction,positionListEditor,changePositionInput,positionListAction} from '../structural-v1/structured-inputs.mjs';
vm.runInThisContext(fs.readFileSync(new URL('../structural-v1/engines/beam-source.js',import.meta.url),'utf8'));
const bundle=JSON.parse(fs.readFileSync(new URL('../structural-v1/examples/second-book-original-1.json',import.meta.url),'utf8'));
const p=bundle.project.modules.find(m=>m.type==='fem').input.project;
const input=()=>({project:structuredClone(p),mesh_mm:200,loadId:''});
const context=i=>({instance:{id:'F',type:'fem',input:i},project:{modules:[]},jobs:new Map(),femResults:new Map()});
test('rectangles and layers render without rewriting old input, and a new adjacent rectangle is reversible',()=>{
 const i={...sectionModule.create(),shape:'custom',rects:[{x:0,y:0,b:2.5,h:20.5,E:206000},{x:0,y:29.5,b:2.5,h:20.5,E:206000}]},before=JSON.stringify(i),r=section(i);
 rectangleEditor(i);layerEditor(i);assert.equal(JSON.stringify(i),before);assert.equal(r.A,102.5);
 sectionModule.action({instance:{input:i}},'add-rect');assert.equal(section(i).A,202.5);sectionModule.action({instance:{input:i}},'remove-rect',2);assert.equal(JSON.stringify(i),before);assert.deepEqual(section(i),r);
});
test('rendering all finite-element list editors preserves the exact solver snapshot and density conventions',()=>{
 const i=input(),before=inputKey(i),request=femRequest(context(i));
 breakpointEditor(i.project,'x_breaks','板宽');breakpointEditor(i.project,'z_breaks','板高');materialsEditor(i.project);i.project.supports.forEach(dofEditor);
 fem.render(context(i));assert.equal(inputKey(i),before);assert.deepEqual(femRequest(context(i)),request);
});
test('one material parameter edit changes only its target, and directional checkboxes preserve the remaining constraints',()=>{
 const i=input(),old=structuredClone(i),keys=Object.keys(i.project.materials),n=keys.indexOf('CORE');
 assert.equal(changeFemInput(i,`input.materialRows.${n}.constant.2`,2500),true);old.project.materials.CORE.engineering_constants[2]=2500;assert.deepEqual(i,old);
 const original=[...i.project.supports[0].dofs];changeFemInput(i,'input.supportDof.0.1',true);assert.ok(i.project.supports[0].dofs.includes(1));changeFemInput(i,'input.supportDof.0.1',false);assert.deepEqual(i.project.supports[0].dofs,original.filter(v=>v!==1));
 assert.ok(!Object.hasOwn(i,'materialRows')&&!Object.hasOwn(i,'supportDof'));assert.equal(changeFemInput(i,'input.mesh_mm',100),false);fem.validate(i);
});
test('adding and removing a mesh division preserves board bounds; referenced materials and boundary points are protected',()=>{
 const i=input(),old=structuredClone(i.project.geometry.x_breaks);femListAction(i,'add-break-x_breaks');assert.equal(i.project.geometry.x_breaks[0],old[0]);assert.equal(i.project.geometry.x_breaks.at(-1),old.at(-1));const n=i.project.geometry.x_breaks.findIndex(v=>!old.includes(v));femListAction(i,'remove-break-x_breaks',n);assert.deepEqual(i.project.geometry.x_breaks,old);assert.throws(()=>femListAction(i,'remove-break-x_breaks',0),/边界/);
 assert.throws(()=>femListAction(i,'remove-material',0),/引用/);const count=Object.keys(i.project.materials).length;femListAction(i,'add-material');assert.equal(Object.keys(i.project.materials).length,count+1);femListAction(i,'remove-material',count);assert.deepEqual(i.project.materials,p.materials);
});
test('material model switching declares the actual adapter convention and preserves densities and unrelated metadata',()=>{
 const i=input(),m=Object.values(i.project.materials)[0],old=structuredClone(m);m.note='preserve';changeFemInput(i,'input.materialRows.0.model','orthotropic');assert.equal(m.poisson_convention,'CCX_nuij_over_Ei');assert.equal(m.mass_density,old.mass_density);assert.equal(m.engineering_constants[0],old.E);assert.equal(m.engineering_constants[6],old.E/(2*(1+old.nu)));changeFemInput(i,'input.materialRows.0.model','isotropic');assert.deepEqual(m,{...old,note:'preserve'});
});
test('position rows retain legacy node, segment, percent and endpoint tokens and preserve response when changing the locating method',()=>{
 const i={...biaxialDefaults(),xSupportMode:'custom',xSupports:'N0,L',fixedYRotations:'N0',fixedXRotations:'',twistSupports:'N0,S1:0.5,75%,L'},before=JSON.stringify(i),r=calculateBiaxial(i);
 for(const key of ['xSupports','fixedYRotations','fixedXRotations','twistSupports'])positionListEditor(i,key);assert.equal(JSON.stringify(i),before);
 changePositionInput(i,'input.positionLists.xSupports.1.kind','absolute');assert.equal(i.xSupports,'N0,3000');assert.equal(calculateBiaxial(i).bendingResultant,r.bendingResultant);assert.equal(i.twistSupports,'N0,S1:0.5,75%,L');
 positionListAction(i,'position-add-fixedYRotations');assert.equal(i.fixedYRotations,'N0,N1');assert.ok(Number.isFinite(calculateBiaxial(i).bendingResultant));positionListAction(i,'position-remove-fixedYRotations',1);assert.equal(calculateBiaxial(i).bendingResultant,r.bendingResultant);assert.ok(!Object.hasOwn(i,'positionLists'));
});
