import {positive,finite} from './section.mjs';

export const LEGACY_TYPE='member_stability_legacy2020';
export const LEGACY_NOTICE='“2020”沿用原书版本标注，仅用于历史公式复算；不表示已核实存在GB 50018—2020标准，也不替代2025版稳定性验算。φx、φy、φb、βmx、βtx由人工输入，不按长细比自动查表；不计算异型截面弯扭、有效截面或连接约束。';
export const legacyDefaults=()=>({codeEdition:'original-2020-labelled',loadId:'',beamId:'',sectionId:'',axis:'x',N:1.2,M:.01,B:1300,H:2970,A:189.17,W:904.09,ix:8.818,iy:12.552,E:206000,lx:900,ly:900,fy:235,f:215,phiX:.82,phiY:.91,phiB:.95,betaMx:.85,betaTx:.85,criticalMode:'manual',NEx:33.2,coefficientBasis:'沿用0920原书采用值：φx=0.82、φy=0.91、φb=0.95、βmx=βtx=0.85；本模块未核实其查表及适用性。'});
const row=(name,formula,value,unit='',limit=null,origin='',pass=null)=>({name,formula,value,unit,limit,origin,pass:pass??(limit===null?null:value<=limit)});

export function calculateLegacyStability(raw,refs={}){
 const i={...legacyDefaults(),...raw};let N=i.N*1000,M=Math.abs(i.M)*1e6,A=i.A,W=i.W,ix=i.ix,iy=i.iy,E=i.E;
 if(refs.loads){positive(i.B,'分格宽度');positive(i.H,'计算高度');N=refs.loads.gd*i.B*i.H/1000;}
 if(refs.beam){M=refs.beam.M*1e6;if(refs.beamInput?.axis&&refs.beamInput.axis!==i.axis)throw Error('梁的弯曲轴与本模块所选轴不同');if(i.sectionId&&refs.beamInput?.sectionId&&refs.beamInput.sectionId!==i.sectionId)throw Error('梁与本模块须引用同一截面');}
 if(refs.section){const s=refs.section;if(s.coupled||s.rects?.some(r=>Math.abs(r.E-s.E)>1e-6))throw Error('原书单轴公式要求同材料主轴截面，不能忽略Ixy耦合');A=s.A;E=s.E;ix=Math.sqrt((i.axis==='x'?s.Ix:s.Iy)/A);iy=Math.sqrt((i.axis==='x'?s.Iy:s.Ix)/A);W=i.axis==='x'?Math.min(s.WxTop,s.WxBottom):Math.min(s.WyLeft,s.WyRight);}
 for(const[k,v]of Object.entries({A,W,ix,iy,E,lx:i.lx,ly:i.ly,fy:i.fy,f:i.f,phiX:i.phiX,phiY:i.phiY,phiB:i.phiB}))positive(v,k);
 finite(N,'压轴力');finite(M,'弯矩');if(N<0)throw Error('原书压弯公式的压轴力不能为负数');
 for(const k of ['betaMx','betaTx']){finite(i[k],k);if(i[k]<0)throw Error('等效弯矩系数不能为负数');}
 for(const k of ['phiX','phiY','phiB'])if(i[k]>1)throw Error('稳定系数φ须大于0且不大于1');
 if(!['formula','manual'].includes(i.criticalMode))throw Error('临界力取值方式无效');
 const lx=i.lx/ix,ly=i.ly/iy,normalizedX=lx/Math.PI*Math.sqrt(i.fy/E),normalizedY=ly/Math.PI*Math.sqrt(i.fy/E),critical=Math.PI**2*E*A/(1.1*lx**2),used=i.criticalMode==='manual'?i.NEx*1000:critical;
 positive(used,'采用N′Ex');const denominator=1-.8*N/used;
 const rows=[row('受弯轴长细比λx','λx=lx/ix',lx),row('正交轴长细比λy','λy=ly/iy',ly),row('正则化长细比λnx','λx/π·sqrt(fy/E)',normalizedX),row('正则化长细比λny','λy/π·sqrt(fy/E)',normalizedY),row('人工采用φx','人工输入；未自动查表',i.phiX),row('人工采用φy','人工输入；未自动查表',i.phiY),row('人工采用φb','人工输入',i.phiB),row('人工采用βmx、βtx','以下按各自人工值代入',null,'',null,`βmx=${i.betaMx}；βtx=${i.betaTx}`),row('N′Ex公式复算','π²EA/(1.1λx²)',critical/1000,'kN'),row('N′Ex实际采用','人工原书值或当前公式复算值',used/1000,'kN',null,i.criticalMode==='manual'?'人工采用值；与公式复算值分别保留':'按当前截面、长度公式计算'),row('平面内放大分母','1−0.8N/N′Ex',denominator)];
 let inPlane=null,outPlane=null,axialX=null,bendingX=null,axialY=null,bendingY=null;
 if(denominator>0){axialX=N/(i.phiX*A*i.f);bendingX=i.betaMx*M/(W*i.f*denominator);axialY=N/(i.phiY*A*i.f);bendingY=i.betaTx*M/(i.phiB*W*i.f);inPlane=axialX+bendingX;outPlane=axialY+bendingY;rows.push(row('平面内稳定利用率','N/(φxAf)+βmx|M|/[Wf(1−0.8N/N′Ex)]',inPlane,'',1,`轴力项=${Number(axialX.toPrecision(10))}；弯矩项=${Number(bendingX.toPrecision(10))}`),row('平面外稳定利用率','N/(φyAf)+βtx|M|/(φbWf)',outPlane,'',1,`轴力项=${Number(axialY.toPrecision(10))}；弯矩项=${Number(bendingY.toPrecision(10))}`));}
 else rows.push(row('平面内公式不满足适用条件','1−0.8N/N′Ex>0；分母≤0停止计算',denominator,'',null,'不继续输出稳定利用率',false));
 if(rows.some(r=>r.value!==null&&!Number.isFinite(r.value)))throw Error('复算出现非有限数值，请检查单位及参数范围');
 const pass=denominator>0&&inPlane<=1&&outPlane<=1;
 return{rows,derived:{N,M,A,W,ix,iy,E,lx,ly,normalizedX,normalizedY,critical,used,denominator,axialX,bendingX,axialY,bendingY,inPlane,outPlane},pass,pending:false,state:pass?'按人工系数，原书所列公式满足':'原书所列公式存在不满足项',reportFormulas:['ix=sqrt(Ix/A); iy=sqrt(Iy/A)','λx=lx/ix; λy=ly/iy','λn=λ/π·sqrt(fy/E)','φx、φy、φb及βmx、βtx：人工输入','N′Ex=π²EA/(1.1λx²)，或人工采用原书值','η内=N/(φxAf)+βmx|M|/[Wf(1−0.8N/N′Ex)]≤1','η外=N/(φyAf)+βtx|M|/(φbWf)≤1']};
}

// Add this historical comparison once to the identified Word example only.
// Existing 2025 checks and all beam/angle modules remain byte-equivalent.
export function ensureLegacyWordComparison(project){
 if(project.reportInfo?.sourceSha256!=='d085c3c08090d08035a9d4ff640201e2c408420732fd2752bd1bfcbddea5f20c'||project.legacyStability2020Added||project.modules.some(m=>m.type===LEGACY_TYPE))return false;
 const at=project.modules.findIndex(m=>m.type==='member_stability'),old=project.modules[at]?.input.legacy2020;
 const input=legacyDefaults();for(const k of ['N','M','phiX','phiY','phiB','betaMx','betaTx','NEx','f'])if(Number.isFinite(old?.[k]))input[k]=old[k];
 project.modules.splice(at<0?project.modules.length:at+1,0,{id:crypto.randomUUID(),type:LEGACY_TYPE,version:1,name:'立柱稳定性 · 原书2020标注',input});project.legacyStability2020Added=true;return true;
}
