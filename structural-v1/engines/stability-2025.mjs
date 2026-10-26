import {positive,finite} from './section.mjs';
import {PHI_B1,B2_CASES} from './stability-data-2025.mjs';

export const stabilityDefaults=()=>({codeEdition:'GB/T50018-2025',loadId:'',beamId:'',sectionId:'',axis:'x',family:'mono_sym',symmetryAxis:'y',N:1.2,M:.01,B:1300,H:2970,A:189.17,Ix:14711.13,Iy:29807.82,Wpositive:904.09,Wnegative:935.33,E:206000,lx:900,ly:900,
 grade:'Q235',nominalT:1.5,materialMode:'table',fyManual:235,fManual:0,materialConfirmed:'no',materialBasis:'',effectiveMode:'unverified',Ae:189.17,We:904.09,WeSmall:904.09,effectiveConfirmed:'no',effectiveBasis:'',scopeConfirmed:'no',scopeBasis:'',boundaryConfirmed:'no',boundaryBasis:'',betaMode:'transverse',endMomentRatio:1,
 torsionMode:'manual',It:0,Iw:0,e0:0,Uy:0,torsionConfirmed:'no',torsionBasis:'',torsionLength:3110,warpEnds:'free',thinWallConfirmed:'no',lambdaMode:'auto',lambdaInManual:0,lambdaOutManual:0,lambdaConfirmed:'no',lambdaBasis:'',phiMode:'table',phiInManual:0,phiOutManual:0,phiConfirmed:'no',phiBasis:'',phiBMode:'auto',phiBManual:0,phiBConfirmed:'no',phiBBasis:'',b2Load:'udl',b2Braces:'none',b2Length:900,ea:0,b2Confirmed:'no',b2Basis:'',xi2Mode:'manual',xi2Manual:0,xi2Confirmed:'no',xi2Basis:'',momentMode:'envelope',bimoment:0,Womega:0,bimomentConfirmed:'no',bimomentBasis:'',connectionNote:'',evidence:{}});

const digest=v=>{const text=JSON.stringify(v);let a=2166136261,b=2246822507;for(let n=0;n<text.length;n++){a=Math.imul(a^text.charCodeAt(n),16777619);b=Math.imul(b^text.charCodeAt(n),3266489909);}return(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');};
// These are change-detection bindings, not security credentials or approvals.
// Manual evidence cannot silently carry over to a changed section/load model.
export function stabilityFingerprints(raw,refs={}){
 const i=normalizeStabilityInput(raw),s=refs.section,si=refs.sectionInput;
 const geom=[s?.A??i.A,s?.E??i.E,s?.Ix??i.Ix,s?.Iy??i.Iy,s?.WxTop??i.Wpositive,s?.WxBottom??i.Wnegative,s?.WyLeft,s?.WyRight,i.axis,i.family,i.symmetryAxis,si?.shape,si?.cad?.curve_loops,si?.rects,si?.h,si?.b,si?.tw,si?.tf];
 const N=refs.loads?refs.loads.gd*i.B*i.H/1000:i.N*1000,M=refs.beam?refs.beam.M*1e6:Math.abs(i.M)*1e6;
 const beam=[refs.beam?.model,refs.beam?.q,refs.beamInput?.P,refs.beamInput?.axis];
 const torsion=[i.torsionMode,i.It,i.Iw,i.e0,i.Uy],material=[i.grade,i.nominalT,i.materialMode,i.fyManual,i.fManual];
 const common=[geom,N,M,i.lx,i.ly,i.torsionLength,i.warpEnds,i.betaMode,i.endMomentRatio,i.ea,i.xi2Mode,i.xi2Manual,i.b2Load,i.b2Braces,i.b2Length,torsion,i.momentMode,beam];
 return Object.fromEntries(Object.entries({scopeConfirmed:[geom,i.scopeBasis],thinWallConfirmed:[geom],materialConfirmed:[material,i.materialBasis],boundaryConfirmed:[geom,i.lx,i.ly,i.torsionLength,i.warpEnds,beam[0]?.lengths,beam[0]?.supports,i.boundaryBasis],effectiveConfirmed:[geom,N,M,i.effectiveMode,i.Ae,i.We,i.WeSmall,i.momentMode,i.effectiveBasis],torsionConfirmed:[geom,torsion,i.torsionBasis],lambdaConfirmed:[common,material,i.lambdaInManual,i.lambdaOutManual,i.lambdaBasis],phiConfirmed:[common,material,i.lambdaMode,i.lambdaInManual,i.lambdaOutManual,i.phiInManual,i.phiOutManual,i.phiBasis],phiBConfirmed:[common,material,i.phiBManual,i.phiBBasis],b2Confirmed:[geom,beam,i.b2Load,i.b2Braces,i.b2Length,i.ea,i.b2Basis],xi2Confirmed:[geom,beam,i.xi2Manual,i.ea,i.xi2Basis],bimomentConfirmed:[common,i.bimoment,i.Womega,i.bimomentBasis]}).map(([k,v])=>[k,digest(v)]));
}
export function bindStabilityEvidence(raw,refs={},keys=Object.keys(stabilityFingerprints(raw,refs))){
 const fp=stabilityFingerprints(raw,refs);raw.evidence={...raw.evidence};for(const k of keys){raw[k]='yes';raw.evidence[k]=fp[k];}return raw;
}

export function normalizeStabilityInput(raw={}){
 const d=stabilityDefaults(),i={...d,...raw};
 if(!raw.codeEdition){
  i.Ix=raw.Ix??(raw.A&&raw.ix?raw.A*raw.ix**2:d.Ix);i.Iy=raw.Iy??(raw.A&&raw.iy?raw.A*raw.iy**2:d.Iy);
  i.Wpositive=raw.Wpositive??raw.W??d.Wpositive;i.Wnegative=raw.Wnegative??raw.W??d.Wnegative;
 }
 return i;
}
export function phiB1Lookup(lambda){
 if(!Number.isFinite(lambda)||lambda<0||lambda>250)throw Error('表B.1查表长细比须在0～250内，不外推');
 const n=Math.floor(lambda);return n===250?PHI_B1[250]:PHI_B1[n]+(PHI_B1[n+1]-PHI_B1[n])*(lambda-n);
}
export function material2025(i){
 const t=i.nominalT;positive(t,'原材厚度');let fy=null,f=null;
 if(i.grade==='Q235'&&t>=2&&t<=20){fy=t<=16?235:225;f=t<=16?205:195;}
 if(i.grade==='Q355'&&t>=2&&t<=20){fy=t<=16?355:345;f=t<=16?300:290;}
 if(i.grade==='Q390'&&t>=2&&t<=20){fy=t<=16?390:370;f=t<=16?345:330;}
 if(['S280','S350'].includes(i.grade)&&t>.6&&t<=2){fy=i.grade==='S280'?280:350;f=i.grade==='S280'?240:300;}
 if(i.grade==='S550'&&t>0&&t<=1.5){const n=t<=.6?0:t<=.9?1:t<=1.2?2:3;fy=[530,500,460,420][n];f=[455,430,400,360][n];}
 let valid=fy!==null;
 if(i.materialMode==='manual'){fy=i.fyManual;f=i.fManual;valid=fy>0&&f>0&&i.materialConfirmed==='yes'&&!!i.materialBasis.trim();}
 return{fy,f,valid,gammaR:i.grade==='Q390'?1.125:1.165,source:i.materialMode==='table'?'表4.2.1':'人工材料值与所填依据'};
}
const mk=(name,formula,value,unit='',limit=null,origin='',pass=null)=>({name,formula,value,unit,limit,origin,pass:pass??(value!==null&&limit!==null?value<=limit:null)});
const yes=(i,k,basis)=>i[k]==='yes'&&i.evidence?.[k]===i._fingerprints?.[k]&&(!basis||!!i[basis]?.trim());
const near=(a,b)=>Math.abs(a-b)<=1e-6*Math.max(1,Math.abs(b));
export function calculateStability2025(raw,refs={}){
 const i=normalizeStabilityInput(raw),rows=[],missing=[];i._fingerprints=stabilityFingerprints(i,refs);const need=(condition,message)=>{if(!condition&&!missing.includes(message))missing.push(message);return condition;};
 const s=refs.section,si=refs.sectionInput;let A=s?.A??i.A,E=s?.E??i.E,Ix=s?.Ix??i.Ix,Iy=s?.Iy??i.Iy;
 for(const[k,v]of Object.entries({A,E,Ix,Iy,lx:i.lx,ly:i.ly}))positive(v,k);
 if(s?.coupled)throw Error('引用截面Ixy≠0；请先将截面、弯矩及扭转参数统一到主轴坐标，不能忽略耦合');
 if(s?.rects?.some(r=>!near(r.E,s.E)))throw Error('本模块只支持同一钢材；多材料换算截面不能直接用于本稳定公式');
 let N=i.N*1000,M=Math.abs(i.M)*1e6;
 if(refs.loads){positive(i.B,'分格宽度');positive(i.H,'轴力计算高度');N=refs.loads.gd*i.B*i.H/1000;}
 if(refs.beam){M=refs.beam.M*1e6;if(i.sectionId&&refs.beamInput?.sectionId&&refs.beamInput.sectionId!==i.sectionId)need(false,'梁与稳定模块引用了不同截面，须统一验算模型');if(refs.beamInput&&refs.beamInput.axis!==i.axis)need(false,'梁的弯曲轴与本稳定模块所选轴不同');}
 finite(N,'压轴力');finite(M,'弯矩');need(N>0,'本模块要求N>0的压弯构件；纯受弯或受拉工况另行计算');
 const Ib=i.axis==='x'?Ix:Iy,Io=i.axis==='x'?Iy:Ix,rb=Math.sqrt(Ib/A),ro=Math.sqrt(Io/A),lb=i.lx/rb,lo=i.ly/ro;
 const Wp=s?(i.axis==='x'?s.WxTop:s.WyRight):i.Wpositive,Wn=s?(i.axis==='x'?s.WxBottom:s.WyLeft):i.Wnegative,Wgross=Math.min(Wp,Wn);positive(Wgross,'毛截面模量');
 const mat=material2025(i);if(i.materialMode==='manual')mat.valid=mat.valid&&yes(i,'materialConfirmed','materialBasis');const gammaR=mat.gammaR,fyCandidate=mat.fy??i.fyManual,normal=lm=>fyCandidate>0?lm/Math.PI*Math.sqrt(fyCandidate/E):null;
 const critical=Math.PI**2*E*A/(gammaR*lb**2),legacyCritical=Math.PI**2*E*A/(1.1*lb**2);
 rows.push(mk('压轴力N','N=Gd·B·H/10³（引用时）',N,'N'),mk('最大弯矩M','引用梁的全构件最大|M|，或人工输入',M,'N·mm'),mk('受弯轴长细比','λb=lb/ib',lb),mk('正交轴长细比','λo=lo/io',lo),mk('受弯轴正则化长细比（参考）','λb/π·sqrt(fy/E)',normal(lb),'',null,'表B.1直接使用普通长细比λ；正则化值不作为本表自变量。材料待核定时fy只作候选参考。'),mk('正交轴正则化长细比（参考）','λo/π·sqrt(fy/E)',normal(lo)),mk('抗力分项系数γR','Q390：1.125；其他钢材：1.165',gammaR),mk('平面内N′E几何计算参数','π²EA/(γR·λb²)',critical/1000,'kN'));
 need(yes(i,'scopeConfirmed'),'待核定截面类别、规范适用范围、主轴与实际连接组合效应');
 need(mat.valid,`待核定材料：${i.grade}、t=${i.nominalT}mm不在表4.2.1相应范围，或人工fy/f缺少已核定依据`);
 need(yes(i,'boundaryConfirmed','boundaryBasis'),'待核定弯曲、侧向、扭转及翘曲约束与计算长度依据');
 const effectiveValid=i.effectiveMode!=='unverified'&&yes(i,'effectiveConfirmed','effectiveBasis');
 need(effectiveValid,'待按第5.6节核定Ae、受压边缘We及反向弯矩有效截面');
 let Ae=i.effectiveMode==='gross'?A:i.Ae,We=i.effectiveMode==='gross'?Wgross:i.We,WeSmall=i.effectiveMode==='gross'?Wgross:i.WeSmall;
 if(effectiveValid){positive(Ae,'有效面积');positive(We,'有效截面模量');if(Ae>A*(1+1e-8))throw Error('有效面积Ae不能大于同一受力截面的毛面积A');}
 let family=i.family;
 if(family==='auto')family=si?.shape==='box'?'closed':si?.shape==='h'?'double_sym':si?.shape==='channel'?(i.axis==='y'?'mono_sym':'mono_non'):'other';
 need(['closed','double_sym','mono_sym','mono_non'].includes(family),'该截面类别不在本模块单向压弯自动路径内，须另行核定');
 if(family==='mono_sym')need(i.symmetryAxis!==i.axis,'5.5.4对称平面受弯时，弯曲轴应垂直于截面对称轴；请核对CAD轴系');
 if(family==='mono_non')need(i.symmetryAxis===i.axis,'5.5.5非对称平面受弯时，弯曲轴应为截面对称轴；请核对CAD轴系');
 if(['closed','double_sym'].includes(family))need(Ib>=Io*(1-1e-8),'当前5.5.2平面外自动路径仅覆盖最大刚度平面或等惯性矩轴；弱轴工况须另行核定');
 const transverse=refs.beam?refs.beam.model.udl.some(u=>Math.abs(u[2]?u[3]*refs.beam.q:u[3])>1e-12)||refs.beam.model.points.some(p=>Math.abs(p[1]?p[2]*(refs.beamInput?.P??0)*1000:p[2])>1e-12):i.betaMode==='transverse';
 let betaM=1;
 if(i.betaMode==='endMoments'){
  if(transverse)throw Error('存在中间横向荷载，βm须按5.5.3第2款取1.0，不能采用纯端弯矩公式');
  if(Math.abs(i.endMomentRatio)>1)throw Error('端弯矩比须在−1至1，分母为绝对值较大的端弯矩');betaM=.6+.4*i.endMomentRatio;
 }
 rows.push(mk('等效弯矩系数βm','有中间横向荷载或有侧移：1；纯端弯矩：0.6+0.4M₂/M₁',betaM,'',null,'5.5.3；正比值为单曲率，负比值为双曲率；原固定0.85不再采用。'));
 const autoT=i.torsionMode==='ih'&&si?.shape==='h'&&yes(i,'thinWallConfirmed');let It=i.It,Iw=i.Iw;
 if(autoT){It=(2*si.b*si.tf**3+(si.h-2*si.tf)*si.tw**3)/3;Iw=si.tf*si.b**3*(si.h-si.tf)**2/24;}
 const torsionValid=autoT||i.torsionMode==='manual'&&i.It>0&&i.Iw>=0&&yes(i,'torsionConfirmed','torsionBasis');
 const warp={free:[1,1],fixed:[1,.5],hinged_restrained:[.72,.5],batten:[.8,1]}[i.warpEnds];
 if(!warp)throw Error('端部翘曲约束类型无效');const [alpha,warpBeta]=warp,lw=warpBeta*i.torsionLength;
 const b2Index={udl:0,midpoint:1,uniform_moment:2,end_same:3,end_single:4,end_opposite:5,end_equal_opposite:6}[i.b2Load],braceIndex={none:0,midpoint:1,multiple:2}[i.b2Braces];
 const b2=B2_CASES[b2Index]?.slice(braceIndex*3,braceIndex*3+3);if(!b2||b2.length!==3)throw Error('附录B.2工况选择无效');
 const b2Ready=yes(i,'b2Confirmed','b2Basis');let xi2=i.xi2Mode==='table'?b2[1]:i.xi2Manual;
 const xiReady=i.xi2Mode==='table'?b2Ready:yes(i,'xi2Confirmed','xi2Basis');
 let lambdaIn=lb,lambdaOut=lo,lambdaOmega=null,lambdaU=null,s2=null;
 const torsionLambda=(lsym,positiveM=true)=>{
  if(!torsionValid||!(lw>0))return null;
  const s2local=lsym**2/A*(Iw/lw**2+.039*It),i02=i.e0**2+Ix/A+Iy/A;
  if(!(s2local>0))return null;s2=s2local;
  const rad=((s2local-i02)/(2*s2local))**2+alpha*i.e0**2/s2local;
  if(rad<0){need(false,'5.2.4弯扭公式根号项小于0，须核对轴系、剪心及扭转数据');return null;}
  return lsym*Math.sqrt((s2local+i02)/(2*s2local)+Math.sqrt(rad));
 };
 if(['mono_sym','mono_non'].includes(family)){
  if(i.lambdaMode==='manual'){
   const valid=yes(i,'lambdaConfirmed','lambdaBasis')&&(family==='mono_sym'?i.lambdaOutManual>0:i.lambdaInManual>0);
   need(valid,'待提供按2025版及当前N/M/轴系核定的换算长细比和依据');lambdaIn=family==='mono_sym'?lb:valid?i.lambdaInManual:null;lambdaOut=family==='mono_sym'?(valid?i.lambdaOutManual:null):lo;if(valid){if(family==='mono_sym')lambdaU=i.lambdaOutManual;else lambdaOmega=i.lambdaInManual;}
  }else{
   need(torsionValid,'待补同一受力截面的It、Iω、剪心e0、Uy及连接关系核定；Ix+Iy不能替代It');
   need(lw>0,'待给定有效的扭转计算几何长度及翘曲约束');
   const lsym=family==='mono_sym'?lo:lb;lambdaOmega=torsionLambda(lsym);
   if(family==='mono_non'){lambdaIn=lambdaOmega;lambdaOut=lo;}
   else{
    need(xiReady,'待核定5.5.4所用ξ₂和荷载作用点ea；连续梁不能直接套简支梁表B.2.1');
    const vals=[];
    if(torsionValid&&xiReady&&s2>0&&N>0){
     const signs=i.momentMode==='envelope'?[1,-1]:[i.momentMode==='negative'?-1:1];
     for(const sign of signs){const ex=sign*betaM*M/N,ea=sign*i.ea,a2=i.e0**2+Ix/A+Iy/A+2*ex*(i.Uy/(2*Ib)-i.e0-xi2*ea),rad=((s2-a2)/(2*s2))**2+alpha*(i.e0-ex)**2/s2;
      const outside=(s2+a2)/(2*s2)+(rad>=0?Math.sqrt(rad):NaN);
      if(rad<0||!(outside>=0)){need(false,'5.5.4某一弯矩方向计算域无效，不能忽略该方向或强制截断负根号');vals.push(null);}else vals.push(lsym*Math.sqrt(outside));}
    }
    lambdaU=vals.length&&vals.every(v=>v!==null)?Math.max(...vals):null;lambdaOut=lambdaU;lambdaIn=lb;
   }
  }
 }
 let phiIn=null,phiOut=null,referencePhiIn=null,referencePhiOrth=null;
 if(near(fyCandidate,235)&&near(E,206000)){if(lb<=250)referencePhiIn=phiB1Lookup(lb);if(lo<=250)referencePhiOrth=phiB1Lookup(lo);}
 const lambdaValid=lambdaIn!==null&&lambdaOut!==null&&lambdaIn>=0&&lambdaOut>=0;
 need(lambdaValid,'适用路径的平面内／平面外查表长细比尚未确定');
 if(i.phiMode==='table'){
  const tableMaterial=mat.valid&&near(mat.fy,235)&&near(E,206000);need(tableMaterial,'表B.1自动查表目前仅核验fy=235MPa、E=206000MPa；其他材料须给出核定φ及依据');
  if(lambdaValid&&tableMaterial){if(lambdaIn>250||lambdaOut>250)need(false,'查表长细比超出0～250；禁止外推表B.1');else{phiIn=phiB1Lookup(lambdaIn);phiOut=phiB1Lookup(lambdaOut);}}
 }else{
  const valid=yes(i,'phiConfirmed','phiBasis')&&i.phiInManual>0&&i.phiInManual<=1&&i.phiOutManual>0&&i.phiOutManual<=1;need(valid,'人工φ须在0～1内，并提供与当前路径及材料相符的核定依据');
  if(valid&&lambdaValid){phiIn=i.phiInManual;phiOut=i.phiOutManual;}
 }
 let phiB=null,phiB0=null;
 if(family==='closed')phiB=1;
 else if(family!=='mono_sym'){
  if(i.phiBMode==='manual'){
   const valid=i.phiBManual>0&&i.phiBManual<=1&&yes(i,'phiBConfirmed','phiBBasis');need(valid,'待按附录B.2核定φb及适用依据；不再固定取0.95');if(valid)phiB=i.phiBManual;
  }else{
   const valid=autoT&&family==='double_sym'&&i.axis==='x'&&Ib>=Io&&b2Ready&&i.b2Length>0&&fyCandidate>0;
   need(valid,'φb自动B.2.1仅覆盖已核定简支区段的强轴理想薄壁I/H；其他截面／连续梁须采用核定结果');
   if(valid){const h=si.h,l0=[1,.5,.33][braceIndex]*i.b2Length,lamb=l0/Math.sqrt(Iy/A),eta=2*b2[1]*i.ea/h,zeta=4*Iw/(h*h*Iy)+.156*It/Iy*(l0/h)**2;
    phiB0=4320*A*h/(lamb*lamb*Wp)*b2[0]*(Math.sqrt(eta*eta+zeta)+eta)*235/fyCandidate;
    phiB=phiB0>.7?Math.min(1,1.091-.274/phiB0):phiB0;need(phiB>0&&phiB<=1,'附录B.2计算的φb不在有效范围内');}
  }
 }
 if(family==='mono_non')need(i.Womega>0&&yes(i,'bimomentConfirmed','bimomentBasis'),'5.5.5尚缺扭转分析双力矩B、扇性模量Wω及同一坐标模型的依据');
 rows.push(mk('Ae采用值','5.6有效截面核定',effectiveValid?Ae:null,'mm²'),mk('We采用值','正反弯矩受压边缘包络',effectiveValid?We:null,'mm³'),mk('材料设计强度f','表4.2.1或有依据的人工材料值',mat.valid?mat.f:null,'MPa'),mk('仅弯曲参考φ（受弯轴）','B.1(λb)，不是开口截面完整稳定结论',referencePhiIn),mk('仅弯曲参考φ（正交轴）','B.1(λo)，不含弯扭影响',referencePhiOrth));
 if(family==='mono_non')rows.push(mk('轴压弯扭长细比λω','5.2.4-1～4，或同一工况核定值',lambdaOmega));if(family==='mono_sym')rows.push(mk('压弯弯扭长细比λu','5.5.4-1～4，正反工况包络；规范x轴=截面对称轴',lambdaU));
 rows.push(mk('平面内查表长细比','按当前条文路径采用',lambdaIn),mk('平面外查表长细比','5.5.4采用λu；5.5.5平面内另按λω',lambdaOut),mk('平面内φ采用值','表B.1线性插值或核定值',phiIn),mk('平面外φ采用值','表B.1线性插值或核定值',phiOut));
 if(family==='mono_sym')rows.push(mk('平面外路径说明','5.5.4第1款→5.2.2；λu已包含弯矩影响',null,'',null,'本路径采用N/(φu·Ae)，不套用双轴对称截面的φb弯矩项。'));
 else rows.push(mk('受弯整体稳定系数φb','闭口1；B.2计算或核定值',phiB,'',null,phiB0===null?'':`B.2未调整φb0=${phiB0}`));
 const NE=family==='mono_non'&&lambdaIn>0?Math.PI**2*E*A/(gammaR*lambdaIn**2):critical,den=phiIn!==null?1-N/NE*phiIn:null;
 rows.push(mk('平面内N′E实际参数','π²EA/(γR·适用长细比²)',family==='mono_non'&&!lambdaValid?null:NE/1000,'kN'),mk('平面内放大分母D','1−(N/N′E)·φ',den));
 const prerequisites=missing.length===0&&phiIn!==null&&phiOut!==null&&(family==='mono_sym'||phiB>0);
 let sigmaIn=null,sigmaOut=null,extra=null,pass=null,pending=!prerequisites;
 if(prerequisites){
  if(!(den>0)){pass=false;pending=false;rows.push(mk('平面内分母失效','D>0',den,'',0,'分母≤0，停止应力放大计算并判为不满足',false));}
  else{
   const bStress=family==='mono_non'?Math.abs(i.bimoment)/i.Womega:0;
   sigmaIn=N/(phiIn*Ae)+betaM*M/(den*We)+bStress;
   const eta=family==='closed'?.7:1;
   sigmaOut=family==='mono_sym'?N/(phiOut*Ae):N/(phiOut*Ae)+eta*M/(phiB*We)+bStress;
   rows.push(mk('平面内稳定应力','N/(φ·Ae)+βm|M|/(D·We)'+(family==='mono_non'?'+|B|/Wω':''),sigmaIn,'MPa',mat.f,'5.5.2-1；非对称平面路径按5.5.5-1'),mk('平面外稳定应力',family==='mono_sym'?'N/(φu·Ae)':'N/(φo·Ae)+η|M|/(φb·We)'+(family==='mono_non'?'+|B|/Wω':''),sigmaOut,'MPa',mat.f,family==='mono_sym'?'5.5.4第1款及5.2.2':`5.5.2-3或5.5.5-2；η=${eta}`));
   pass=sigmaIn<=mat.f&&sigmaOut<=mat.f;
   if(family==='mono_sym'){
    const extraDen=1-N/critical;
    if(!(WeSmall>0)){need(false,'5.5.4-5尚缺较小有效截面模量W′ey');pending=true;pass=pass===false?false:null;}
    else if(!(extraDen>0)){pass=false;rows.push(mk('剪心侧受压补充检验分母','1−N/N′Ey>0',extraDen,'',0,'5.5.4-5分母≤0，判不满足',false));}
    else{extra=Math.abs(N/Ae-betaM*M/(extraDen*WeSmall));rows.push(mk('剪心侧受压补充检验','|N/Ae−βm|M|/[(1−N/N′Ey)W′ey]|',extra,'MPa',mat.f,'5.5.4-5；N′Ey按规范y轴即实际受弯轴计算。不自动省略该检验。'));pass=pass&&extra<=mat.f;}
   }
  }
 }
 if(pass===false)pending=false;
 if(rows.some(v=>v.value!==null&&!Number.isFinite(v.value)))throw Error('稳定性计算出现非有限值，请检查参数范围与单位');
 const state=pass===false?'稳定性存在不满足项目':pending?'稳定性待补充条件，暂不判定满足':'按GB/T50018—2025所列适用路径满足';
 return{rows,derived:{N,M,A,Ix,Iy,Ib,Io,E,Wgross,rb,ro,lx:lb,ly:lo,normalizedX:normal(lb),normalizedY:normal(lo),critical,legacyCritical,used:NE,gammaR,betaM,family,material:mat,Ae:effectiveValid?Ae:null,We:effectiveValid?We:null,lambdaIn,lambdaOut,lambdaOmega,lambdaU,referencePhiIn,referencePhiOrth,phiIn,phiOut,phiB,phiB0,It:torsionValid?It:null,Iw:torsionValid?Iw:null,denominator:den,sigmaIn,sigmaOut,extra,fingerprints:i._fingerprints},missing,pass,pending,state};
}

export function upgradeStabilityProject(project){
 let changed=false;
 for(const m of project.modules){if(m.type!=='member_stability'||m.input.codeEdition==='GB/T50018-2025')continue;
  const old=structuredClone(m.input),i=normalizeStabilityInput(old);i.codeEdition='GB/T50018-2025';i.legacy2020={N:old.N,M:old.M,phiX:old.phiX,phiY:old.phiY,phiB:old.phiB,betaMx:old.betaMx,betaTx:old.betaTx,NEx:old.NEx,f:old.f,note:'原书/旧项目输入只作历史对照，不代入2025版稳定性判定'};
  for(const k of ['phiX','phiY','phiB','betaMx','betaTx','criticalMode','NEx','f','fy','ix','iy'])delete i[k];
  if(project.reportInfo?.sourceSha256==='d085c3c08090d08035a9d4ff640201e2c408420732fd2752bd1bfcbddea5f20c'){
   i.loadId=project.modules.find(x=>x.name==='Word逐式荷载 1300mm')?.id||i.loadId;i.beamId=project.modules.find(x=>x.name==='1300mm设计荷载连续梁')?.id||i.beamId;i.sectionId=project.modules.find(x=>x.input.shape==='cad')?.id||i.sectionId;i.connectionNote='既有CAD核对：开孔弱截面6个闭合轮廓，整体不连通；连接与共同抗扭未核定。It/Iω/剪心/Uy待补，不以几何接触认定传力。';m.name='立柱稳定性 · GB/T50018—2025';
  }
  m.input=i;changed=true;
 }
 if(project.reportInfo?.sourceSha256==='d085c3c08090d08035a9d4ff640201e2c408420732fd2752bd1bfcbddea5f20c'){project.reportInfo.paragraphs=project.reportInfo.paragraphs.map(t=>{const updated=t.replace('原书稳定系数为人工输入，未自动查表。','立柱稳定性改按GB/T50018-2025分流；原书φ及N′E只作历史对照。材料、有效截面和弯扭条件缺失时保持待补。');if(updated!==t)changed=true;return updated;});}
 return changed;
}
