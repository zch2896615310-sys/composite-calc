import {positive,finite} from './section.mjs';
export const BIAXIAL_TYPE='beam_biaxial';
const defaultModel='横梁连续梁\n段长 = 1500,1500mm\n支点 = N0,N1,N2\n均布 = 0,L,q\n集中 = 无\n传力支点 = 全部\n悬挑系数 = 2\n自重 = 不计\n自重系数 = 1.2';
export const biaxialDefaults=()=>({sectionId:'',loadId:'',loadField:'qELine',E:206000,Ix:1625800,Iy:1625800,Ixy:0,q:1,P:1,ratio:250,ratioX:250,model:defaultModel,rotation:0,xSupportMode:'same',xSupports:'N0,N2',fixedYRotations:'',fixedXRotations:'',pointsX:[],udlX:[],torsionMode:'pending',Jmode:'manual',J:0,nu:.3,eX:0,eY:0,twistSupports:'N0',torsionBasis:'',boundaryBasis:'',boundaryConfirmed:'no',boundaryKey:'',noTorqueKey:'',basisNote:''});
const zeros=n=>Array(n).fill(0),matrix=n=>Array.from({length:n},()=>zeros(n));
const add=(a,b,scale=1)=>Array.from({length:Math.max(a.length,b.length)},(_,j)=>(a[j]||0)+(b[j]||0)*scale);
const times=(a,b)=>{const c=zeros(a.length+b.length-1);a.forEach((v,j)=>b.forEach((w,k)=>c[j+k]+=v*w));return c;};
function peaks(elements,key,core){return Math.max(0,...elements.map(e=>core.peak(e[key],0,1)));}
function vectorPeak(elements,core){return Math.sqrt(Math.max(0,...elements.map(e=>core.peak(add(times(e.uY,e.uY),times(e.uX,e.uX)),0,1))));}
function positions(text,nodes,core,name){if(!text.trim())return[];const a=text.split(/[,，]/).map(s=>core.position(s.trim(),nodes));if(new Set(a).size!==a.length)throw Error(name+'存在重复位置');return a;}
function domains(supports,H,factor,elements,key,ratio,core){const out=[];if(supports[0]>0)out.push([0,supports[0],1]);for(let j=1;j<supports.length;j++)out.push([supports[j-1],supports[j],0]);if(supports.at(-1)<H)out.push([supports.at(-1),H,2]);return out.map(([a,b,c])=>{const limit=(b-a)*(c?factor:1)/ratio;let u=0;for(const e of elements){const l=Math.max(a,e.a),h=Math.min(b,e.b);if(h>=l)u=Math.max(u,core.peak(e[key],(l-e.a)/(e.b-e.a),(h-e.a)/(e.b-e.a)));}return[a,b,c,u,limit,u/limit];});}
export function calculateBiaxial(raw,section=null,core=globalThis,loads=null,sectionInput=null){
 const i={...biaxialDefaults(),...raw};if(i.sectionId&&!section)throw Error('引用截面缺失');if(section?.rects?.some(r=>Math.abs(r.E-section.E)>1e-6))throw Error('双向梁暂只支持同材料截面，不能把多材料换算应力视为同一钢材');
 let E=section?.E??i.E,Ix=section?.Ix??i.Ix,Iy=section?.Iy??i.Iy,Ixy=section?.Ixy??i.Ixy;
 for(const[k,v]of Object.entries({E,Ix,Iy,ratio:i.ratio,ratioX:i.ratioX}))positive(v,k);finite(Ixy,'Ixy');finite(i.rotation,'截面安装角度');
 const rad=i.rotation*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),original={Ix,Iy,Ixy};[Ix,Iy,Ixy]=[Ix*c*c+Iy*s*s+2*Ixy*s*c,Ix*s*s+Iy*c*c-2*Ixy*s*c,(Iy-Ix)*s*c+Ixy*(c*c-s*s)];
 const determinant=Ix*Iy-Ixy*Ixy;if(!(determinant>1e-10*Ix*Iy))throw Error('截面惯性矩矩阵非正定或接近退化，请核对Ix、Iy、Ixy与单位');
 const model=core.decode(core.parseModel(i.model).values),H=model.H,nodes=model.lengths.reduce((a,l)=>(a.push(a.at(-1)+l),a),[0]);if(model.weightOn)throw Error('请将自重作为明确的分方向均布荷载输入');
 const q=loads?loads[i.loadField]:i.q;finite(q,'Y向均布参考荷载');finite(i.P,'集中力参考值');
 const udlY=model.udl.map(a=>[a[0],a[1],a[2]?q*a[3]:a[3]]),pointY=model.points.map(a=>[a[0],a[1]?i.P*1000*a[2]:a[2]]);
 const checkPosition=x=>{finite(x,'荷载位置');if(x<0||x>H)throw Error('X向荷载或支点超出梁长');return x;};
 const udlX=i.udlX.map(a=>{checkPosition(a.start);checkPosition(a.end);finite(a.q,'X向均布荷载');if(!(a.end>a.start))throw Error('X向均布荷载终点须大于起点');return[a.start,a.end,a.q];}),pointX=i.pointsX.map(a=>[checkPosition(a.position),finite(a.P,'X向集中力')*1000]);
 if(udlX.length>16||pointX.length>32)throw Error('X向荷载超过上限');
 if(!['same','custom','continuous'].includes(i.xSupportMode))throw Error('侧向约束方式无效');
 const continuous=i.xSupportMode==='continuous',sx=i.xSupportMode==='custom'?positions(i.xSupports,nodes,core,'X向支点'):model.supports.slice(),ry=positions(i.fixedYRotations,nodes,core,'Y向固转支点'),rx=positions(i.fixedXRotations,nodes,core,'X向固转支点');
 if(sx.length<2)throw Error('X向至少需要两个不同的位移支点；本模块不自动消除侧向刚体运动');
 if(ry.some(x=>!model.supports.includes(x))||rx.some(x=>!sx.includes(x)))throw Error('固转位置必须属于该方向的位移支点');
 const ts=i.torsionMode==='stvenant'?positions(i.twistSupports,nodes,core,'限扭支点'):[];
 let mesh=[...nodes,...model.supports,...sx,...ry,...rx,...ts,...udlY.flatMap(a=>a.slice(0,2)),...udlX.flatMap(a=>a.slice(0,2)),...pointY.map(a=>a[0]),...pointX.map(a=>a[0])];mesh=core.unique(mesh,H);if(mesh.length>121)throw Error('模型节点超过121个');
 const node=x=>{const j=mesh.findIndex(y=>Math.abs(y-x)<=H*1e-10);if(j<0)throw Error('支点节点未找到');return j;},n=4*mesh.length,K=matrix(n),F=zeros(n),I0=Math.max(Ix,Iy),EI0=E*I0,qs=[],fixed=new Set();
 const loadAt=(us,mid)=>us.reduce((a,u)=>a+(mid>u[0]&&mid<u[1]?u[2]:0),0);
 for(let e=0;e<mesh.length-1;e++){
  const L=mesh[e+1]-mesh[e],ell=L/H,mid=(mesh[e+1]+mesh[e])/2,qY=loadAt(udlY,mid),qX=loadAt(udlX,mid);qs.push([qY,qX]);
  const a=12/ell**3,b=6/ell**2,d=4/ell,f=2/ell,ke=[[a,b,-a,b],[b,d,-b,f],[-a,-b,a,-b],[b,f,-b,d]],map=[[4*e,4*e+1,4*e+4,4*e+5],[4*e+2,4*e+3,4*e+6,4*e+7]],D=[[Ix,Ixy],[Ixy,Iy]];
  for(let u=0;u<2;u++){const qv=[qY,qX][u],fe=[qv*L/2,qv*L*L/(12*H),qv*L/2,-qv*L*L/(12*H)];for(let j=0;j<4;j++){F[map[u][j]]+=fe[j];for(let v=0;v<2;v++)for(let k=0;k<4;k++)K[map[u][j]][map[v][k]]+=ke[j][k]*D[u][v]/I0;}}
 }
 pointY.forEach(([x,p])=>F[4*node(x)]+=p);pointX.forEach(([x,p])=>F[4*node(x)+2]+=p);
 model.supports.forEach(x=>fixed.add(4*node(x)));sx.forEach(x=>fixed.add(4*node(x)+2));ry.forEach(x=>fixed.add(4*node(x)+1));rx.forEach(x=>fixed.add(4*node(x)+3));
 if(continuous)mesh.forEach((x,j)=>{fixed.add(4*j+2);fixed.add(4*j+3);});
 const free=Array.from({length:n},(_,j)=>j).filter(j=>!fixed.has(j)),z=zeros(n);let solution;
 try{solution=core.solveSPD(free.map(j=>free.map(k=>K[j][k])),free.map(j=>F[j]));}catch{throw Error('双向约束不足或刚度矩阵无效，请核对两方向支点与转动约束');}
 free.forEach((j,k)=>z[j]=solution[k]);const displacement=z.map(v=>v*H**3/EI0),residual=K.map((row,j)=>row.reduce((a,v,k)=>a+v*z[k],-F[j]));
 const reactions=mesh.map((x,j)=>({x,RY:fixed.has(4*j)?-residual[4*j]:0,RX:fixed.has(4*j+2)?-residual[4*j+2]:0,CY:fixed.has(4*j+1)?-residual[4*j+1]*H:0,CX:fixed.has(4*j+3)?-residual[4*j+3]*H:0,fixedY:fixed.has(4*j),fixedX:fixed.has(4*j+2)})).filter(a=>a.fixedY||a.fixedX);
 const balance=(us,ps,key,ckey)=>{const sum=us.reduce((a,u)=>a+u[2]*(u[1]-u[0]),0)+ps.reduce((a,p)=>a+p[1],0),moment=us.reduce((a,u)=>a+u[2]*(u[1]-u[0])*(u[0]+u[1])/2,0)+ps.reduce((a,p)=>a+p[0]*p[1],0),f=reactions.reduce((a,r)=>a+r[key],-sum),m=reactions.reduce((a,r)=>a+r[key]*r.x+r[ckey],-moment),scale=Math.max(1,...us.map(u=>Math.abs(u[2]*(u[1]-u[0]))),...ps.map(p=>Math.abs(p[1])));if(Math.abs(f)>scale*1e-6||Math.abs(m)>scale*H*1e-6)throw Error('双向梁平衡检查未通过');return{force:f,moment:m};};
 const balanceY=balance(udlY,pointY,'RY','CY'),balanceX=balance(udlX,pointX,'RX','CX'),freeResidual=Math.max(0,...free.map(j=>Math.abs(residual[j])));if(freeResidual>Math.max(1,...F.map(Math.abs))*1e-6)throw Error('自由度残差过大');
 const elements=[];
 for(let e=0;e<mesh.length-1;e++){
  const L=mesh[e+1]-mesh[e],[qY,qX]=qs[e],Q=continuous?[qY*L**4/(24*E*Ix),0]:[(Iy*qY-Ixy*qX)*L**4/(24*E*determinant),(Ix*qX-Ixy*qY)*L**4/(24*E*determinant)];
  const u=[0,2].map((o,j)=>{if(continuous&&j===1)return[0,0,0,0,0];const w0=displacement[4*e+o],r0=displacement[4*e+o+1]/H,w1=displacement[4*e+o+4],r1=displacement[4*e+o+5]/H;return[w0,r0*L,3*(w1-w0)-(2*r0+r1)*L+Q[j],2*(w0-w1)+(r0+r1)*L-2*Q[j],Q[j]];});
  const dy=core.deriv(core.deriv(u[0])),dx=core.deriv(core.deriv(u[1])),MY=add(dy,dx,Ixy/Ix).map(v=>-E*Ix*v/L**2),MX=add(dx,dy,Ixy/Iy).map(v=>-E*Iy*v/L**2);elements.push({a:mesh[e],b:mesh[e+1],uY:u[0],uX:u[1],MY,MX,VY:core.deriv(MY).map(v=>v/L),VX:core.deriv(MX).map(v=>v/L)});
 }
 const channel=(dir,supports,ratio)=>{const es=elements.map(e=>({a:e.a,b:e.b,u:e['u'+dir],M:e['M'+dir],V:e['V'+dir]})),dm=domains(supports,H,model.factor,elements,'u'+dir,ratio,core),samples=es.flatMap(e=>Array.from({length:41},(_,j)=>{const t=j/40;return{x:e.a+(e.b-e.a)*t,M:core.poly(e.M,t)/1e6,V:core.poly(e.V,t)/1000,u:-core.poly(e.u,t)};}));return{model:{...model,supports},elements:es,samples,M:peaks(es,'M',core)/1e6,V:peaks(es,'V',core)/1000,u:peaks(es,'u',core),utilization:Math.max(0,...dm.map(d=>d[5])),domains:dm,reactions:supports.map(x=>reactions.find(r=>r.x===x)?.['R'+dir]||0)};};
 const Y=channel('Y',model.supports,i.ratio),X=channel('X',sx,i.ratioX),missing=[],boundaryKey=JSON.stringify([i.sectionId,original,E,i.rotation,model.lengths,model.supports,i.xSupportMode,sx,ry,rx]);if(i.boundaryConfirmed!=='yes'||i.boundaryKey!==boundaryKey||!i.boundaryBasis.trim())missing.push('安装朝向与各支点的双向位移、转动约束尚未核定；当前仅按所填约束计算');
 let torsion=null;
 if(i.torsionMode==='stvenant'){
  finite(i.eX,'荷载作用线距剪心eX');finite(i.eY,'荷载作用线距剪心eY');finite(i.nu,'泊松比');if(i.nu<=-1||i.nu>=.5)throw Error('泊松比须大于−1且小于0.5');const G=E/(2*(1+i.nu));let J=i.J;
  if(i.Jmode==='thin-angle'){if(sectionInput?.shape!=='angle')throw Error('薄壁角钢J近似只适用于引用的理想角钢');const{b,h,tw}=sectionInput;if(tw/Math.min(b,h)>.1)throw Error('当前角钢不满足本近似的薄壁限制t/min(b,h)≤0.1');J=(b+h-tw)*tw**3/3;}
  positive(J,'同一截面扭转常数J');if(!ts.length)throw Error('至少需要一个限扭支点，不能用零转角消除自由扭转而不标明约束');
  const kt=matrix(mesh.length),ft=zeros(mesh.length),tq=qs.map(([y,x])=>i.eX*y-i.eY*x);for(let e=0;e<mesh.length-1;e++){const L=mesh[e+1]-mesh[e],v=G*J/L;kt[e][e]+=v;kt[e][e+1]-=v;kt[e+1][e]-=v;kt[e+1][e+1]+=v;ft[e]+=tq[e]*L/2;ft[e+1]+=tq[e]*L/2;}
  pointY.forEach(([x,p])=>ft[node(x)]+=i.eX*p);pointX.forEach(([x,p])=>ft[node(x)]-=i.eY*p);const ti=new Set(ts.map(node)),tf=mesh.map((_,j)=>j).filter(j=>!ti.has(j)),phi=zeros(mesh.length),sol=core.solveSPD(tf.map(j=>tf.map(k=>kt[j][k])),tf.map(j=>ft[j]));tf.forEach((j,k)=>phi[j]=sol[k]);
  const tr=ts.map(x=>{const j=node(x);return{x,T:ft[j]-kt[j].reduce((a,v,k)=>a+v*phi[k],0)};}),totalApplied=ft.reduce((a,v)=>a+v,0),torqueResidual=tr.reduce((a,v)=>a+v.T,-totalApplied);if(Math.abs(torqueResidual)>Math.max(1,...ft.map(Math.abs))*1e-6)throw Error('扭矩平衡检查未通过');
  const es=elements.map((e,j)=>{const L=e.b-e.a,Q=tq[j]*L*L/(2*G*J),p=[phi[j],phi[j+1]-phi[j]+Q,-Q],T=core.deriv(p).map(v=>G*J*v/L);return{a:e.a,b:e.b,phi:p,T};}),atLoad=elements.map((e,j)=>({...e,uX:add(e.uX,es[j].phi,-i.eY),uY:add(e.uY,es[j].phi,i.eX)}));
  const plot={model:{...model,supports:ts},elements:es.map(e=>({a:e.a,b:e.b,M:e.T,u:e.phi.map(v=>-v*180/Math.PI),V:[0]})),samples:es.flatMap(e=>Array.from({length:41},(_,j)=>{const t=j/40;return{x:e.a+(e.b-e.a)*t,M:core.poly(e.T,t)/1e6,u:core.poly(e.phi,t)*180/Math.PI};}))};
  torsion={G,J,eX:i.eX,eY:i.eY,theta:peaks(es,'phi',core)*180/Math.PI,T:peaks(es,'T',core)/1e6,reactions:tr,torqueResidual,plot,atLoad:{X:peaks(atLoad,'uX',core),Y:peaks(atLoad,'uY',core),resultant:vectorPeak(atLoad,core)},elements:es};if(!i.torsionBasis.trim())missing.push('扭转参数、剪心偏距与限扭支点缺少核定依据；所列扭转结果为输入假定下参考值');missing.push('圣维南扭转不包含翘曲正应力、局部畸变与弯扭屈曲，尚非角钢完整承载力验算');
 }else if(i.torsionMode==='verified-no-torque'){if(!i.torsionBasis.trim()||i.noTorqueKey!==JSON.stringify([boundaryKey,udlY,pointY,udlX,pointX,i.torsionBasis]))missing.push('须核定当前荷载通过剪心或可靠限扭的依据，不能将未知偏心默认取零');}
 else if(i.torsionMode==='pending')missing.push('荷载至剪心的偏距及限扭条件未定，扭转和荷载作用点附加位移尚未计算');else throw Error('扭转计算方式无效');
 const exceeded=Y.utilization>1||X.utilization>1;
 return{E,q,model,mesh,original,boundaryKey,noTorqueKey:JSON.stringify([boundaryKey,udlY,pointY,udlX,pointX,i.torsionBasis]),inertia:{Ix,Iy,Ixy,determinant,rotation:i.rotation},channels:{Y,X},elements,reactions,balanceY,balanceX,freeResidual,bendingResultant:vectorPeak(elements,core),torsion,missing,pending:!exceeded&&missing.length>0,pass:exceeded?false:missing.length?null:true,state:exceeded?'双向弯曲存在挠度超限':missing.length?'双向弯曲已计算；安装或扭转条件待核定':'按核定条件，所列双向挠度满足',reportFormulas:['D=E[[Ix,Ixy],[Ixy,Iy]]','D·d4[vY,vX]/ds4=[qY,qX]','Kff·df=Ff；两方向在同一矩阵联立求解','支点与荷载边界处分段，均布荷载位移采用四次多项式','T=eX·FY−eY·FX；G=E/[2(1+ν)]','圣维南扭转：−GJ·θ二阶导数=t(s)','荷载作用线位移：uX=vX−eYθ；uY=vY+eXθ']};
}

export function ensureBiaxialAngleExample(project){
 if(project.reportInfo?.sourceSha256!=='d085c3c08090d08035a9d4ff640201e2c408420732fd2752bd1bfcbddea5f20c'||project.biaxialAngleAdded||project.modules.some(m=>m.type===BIAXIAL_TYPE))return false;
 const angle=project.modules.find(m=>m.type==='section'&&m.input.shape==='angle'),at=project.modules.findIndex(m=>m.type==='beam'&&m.name.startsWith('横向角钢梁'));if(!angle||at<0)return false;const source=project.modules[at];
 project.modules.splice(at+1,0,{id:crypto.randomUUID(),type:BIAXIAL_TYPE,version:1,name:'横向角钢梁 · 双向耦合与扭转',input:{...biaxialDefaults(),sectionId:angle.id,model:source.input.model,q:source.input.q,P:source.input.P,ratio:source.input.ratio,rotation:0,boundaryBasis:'已知条件：仅支点处连接，跨中没有连续约束。参考计算暂按四支点均限制X/Y平移、弯曲转角自由；实际安装朝向与限扭条件待核定。',basisNote:'同一跨段及0.1kN×3水平荷载的双向耦合参考模型；荷载按Y向输入，X向无外荷载，保留Ixy。仅支点处连接，跨中无连续约束。α=0为参考安装方向，未核定实际限扭。原单向模型保留作对照，不能将两套结果混用。'}});project.biaxialAngleAdded=true;return true;
}
