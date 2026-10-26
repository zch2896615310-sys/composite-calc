// Display and boundary editing only. Coordinates always remain SAP global XYZ.
export const MATERIAL_COLORS={MARBLE:'#d6bc91',STEEL:'#7ca6c4',CORE:'#a8b98b'};
export const materialName=k=>({MARBLE:'石材',STEEL:'钢板',CORE:'蜂窝芯'})[k]||k;
export const SUPPORT_PRESETS=[['normal','法向定位 · 固定Y',[2]],['bearing','法向定位＋竖向承重 · 固定Y、Z',[2,3]],['anchor','三向定位 · 固定X、Y、Z',[1,2,3]]];
export function supportKind(s){const d=[...s.dofs].sort().join();return d==='2'?'normal':d==='2,3'?'bearing':d==='1,2,3'?'anchor':'custom';}
export const supportColor=s=>({normal:'#367ba5',bearing:'#c48932',anchor:'#a55349',custom:'#74658e'})[supportKind(s)];
export function bounds(p){const xs=p.geometry.x_breaks,zs=p.geometry.z_breaks;return {x0:Math.min(...xs),x1:Math.max(...xs),z0:Math.min(...zs),z1:Math.max(...zs),thickness:p.layers.reduce((s,l)=>s+Math.max(0,l.thickness),0)};}
const roundY=y=>Math.round(y*1e9)/1e9;
export function connectionFaces(p){let y=0;return[{key:'front',y:0,label:`${materialName(p.layers[0]?.material)}外表面 · Y=0`},...p.layers.map((l,i)=>{y=roundY(y+l.thickness);return{key:i===p.layers.length-1?'back':'after:'+l.name,y,label:i===p.layers.length-1?`${materialName(l.material)}外表面（末层） · Y=${y}`:`${materialName(l.material)} / ${materialName(p.layers[i+1].material)}交界 · Y=${y}`};})];}
export function supportY(p,s){const key=s.surface||'custom',face=connectionFaces(p).find(f=>f.key===key);if(key!=='custom'&&!face)throw Error('挂点连接面对应的材料层已移除，请重新选择连接面');const y=face?face.y:s.y??0,t=bounds(p).thickness;if(!Number.isFinite(y)||y< -1e-8||y>t+1e-8)throw Error(`挂点 Y 须在实体厚度范围 0～${roundY(t)} mm 内`);return roundY(Math.max(0,Math.min(t,y)));}
export function thicknessPlanes(p){const ys=[...new Set([...connectionFaces(p).map(f=>f.y),...p.supports.map(s=>supportY(p,s))])].sort((a,b)=>a-b);if(ys.some((y,i)=>i&&y-ys[i-1]<1e-7))throw Error('Y 切分位置过近，间距须至少为 0.0000001 mm');return ys;}
export function displaySupportY(p,s,view={}){const y=supportY(p,s),v=normalizeView(view),ls=displayLayers(p,v);let a=0;for(const l of ls){const b=roundY(a+l.thickness);if(y<=b+1e-9)return l.y0+(y-a)*v.thicknessScale;a=b;}return ls.at(-1)?.y1||0;}
export function splitAxis(values,size){const sorted=[...new Set(values)].sort((a,b)=>a-b),out=[sorted[0]];if(!(size>0))return sorted;for(let k=1;k<sorted.length;k++){const a=sorted[k-1],b=sorted[k],n=Math.ceil((b-a)/size);if(n>2000)return sorted;for(let j=1;j<=n;j++)out.push(a+(b-a)*j/n);}return out;}
export function previewMesh(p,size){const xs=splitAxis([...p.geometry.x_breaks,...p.supports.map(s=>s.x)],size),zs=splitAxis([...p.geometry.z_breaks,...p.supports.map(s=>s.z)],size),ys=thicknessPlanes(p);return{xs,zs,ys,elements:(xs.length-1)*(zs.length-1)*(ys.length-1),nodes:xs.length*zs.length*ys.length};}
export function boundaryInfo(p){
 const b=bounds(p),span=Math.max(b.x1-b.x0,b.z1-b.z0,1),cx=(b.x0+b.x1)/2,cz=(b.z0+b.z1)/2,rows=[];
 for(const s of p.supports){const x=(s.x-cx)/span,y=(supportY(p,s)-b.thickness/2)/span,z=(s.z-cz)/span;for(const dof of s.dofs)rows.push(dof===1?[1,0,0,0,z,-y]:dof===2?[0,1,0,-z,0,x]:[0,0,1,y,-x,0]);}
 let rank=0;for(let col=0;col<6;col++){let pivot=rank;for(let i=rank;i<rows.length;i++)if(Math.abs(rows[i][col])>Math.abs(rows[pivot]?.[col]||0))pivot=i;if(Math.abs(rows[pivot]?.[col]||0)<1e-9)continue;[rows[rank],rows[pivot]]=[rows[pivot],rows[rank]];const v=rows[rank][col];rows[rank]=rows[rank].map(x=>x/v);for(let i=rank+1;i<rows.length;i++){const f=rows[i][col];rows[i]=rows[i].map((x,j)=>x-f*rows[rank][j]);}rank++;if(rank===6)break;}
 return {rank,count:p.supports.length,axis:[1,2,3].map(d=>p.supports.filter(s=>s.dofs.includes(d)).length)};
}
export function validateSupport(p,s,index=-1){
 const b=bounds(p);if(!/^[A-Za-z0-9_][A-Za-z0-9_-]{0,39}$/.test(s.sap_joint))throw Error('编号须为英文、数字、下划线或短横线');
 if(![s.x,s.z].every(Number.isFinite)||s.x<b.x0||s.x>b.x1||s.z<b.z0||s.z>b.z1)throw Error('挂点须在板面范围内');
 if(!s.dofs.length||new Set(s.dofs).size!==s.dofs.length||s.dofs.some(d=>![1,2,3].includes(d)))throw Error('至少固定一个平移方向；无约束点请删除');
 const y=supportY(p,s);if(p.supports.some((v,i)=>i!==index&&(v.sap_joint===s.sap_joint||Math.hypot(v.x-s.x,supportY(p,v)-y,v.z-s.z)<1e-8)))throw Error('挂点编号或位置与已有挂点重复');
 return s;
}
export function editSupports(input,indices,patch){const next=structuredClone(input),p=next.project;for(const i of indices){const s={...p.supports[i],...patch};if(patch.dofs)s.dofs=[...patch.dofs].sort();if('surface'in patch||'y'in patch)s.y=supportY(p,s);p.supports[i]=s;}p.supports.forEach((s,i)=>validateSupport(p,s,i));thicknessPlanes(p);return next;}
export function addSupport(input,x,z,snap=5,connection=null){const next=structuredClone(input),p=next.project,b=bounds(p),round=v=>Math.round(v/snap)*snap;if(x<b.x0||x>b.x1||z<b.z0||z>b.z1)throw Error('请点击板面范围内添加挂点');let n=1;while(p.supports.some(s=>s.sap_joint==='P'+n))n++;const s={sap_joint:'P'+n,x:Math.max(b.x0,Math.min(b.x1,round(x))),z:Math.max(b.z0,Math.min(b.z1,round(z))),dofs:[2],...(connection||{})};if(connection)s.y=supportY(p,s);validateSupport(p,s);p.supports.push(s);thicknessPlanes(p);return next;}
export function normalizeView(v={}){const indices=a=>Array.isArray(a)?a.filter(n=>Number.isInteger(n)&&n>=0):[],finite=(n,d)=>Number.isFinite(n)?n:d;return{yaw:finite(v.yaw,28),elevation:Math.max(-90,Math.min(90,finite(v.elevation,16))),zoom:Math.max(.55,Math.min(2.5,finite(v.zoom,1))),thicknessScale:[1,8,20].includes(v.thicknessScale)?v.thicknessScale:8,exploded:!!v.exploded,mesh:!!v.mesh,selectedLayer:Number.isInteger(v.selectedLayer)&&v.selectedLayer>=0?v.selectedLayer:0,selectedSupports:indices(v.selectedSupports),tab:v.tab==='layers'?'layers':'supports',snap:5,addSurface:typeof v.addSurface==='string'?v.addSurface:'front',addY:finite(v.addY,0),tool:v.tool==='add'?'add':'select',hiddenLayers:indices(v.hiddenLayers),colors:{...MATERIAL_COLORS,...Object.fromEntries(Object.entries(v.colors||{}).filter(([k,c])=>/^#[0-9a-f]{6}$/i.test(c)))}};}
export function displayLayers(p,view={}){const v=normalizeView(view),b=bounds(p),gap=Math.max(b.x1-b.x0,b.z1-b.z0)*.14;let y=0;return p.layers.map((l,i)=>{const y0=y*v.thicknessScale+(v.exploded?i*gap:0),y1=y0+l.thickness*v.thicknessScale;y+=l.thickness;return{...l,index:i,y0,y1,color:/^#[0-9a-f]{6}$/i.test(v.colors[l.material])?v.colors[l.material]:'#aebac4'};});}
export function camera(p,view={},width=1000,height=580){
 const v=normalizeView(view),b=bounds(p),a=v.yaw*Math.PI/180,e=v.elevation*Math.PI/180,R=[Math.cos(a),Math.sin(a),0],U=[-Math.sin(a)*Math.sin(e),Math.cos(a)*Math.sin(e),Math.cos(e)],D=[Math.sin(a)*Math.cos(e),-Math.cos(a)*Math.cos(e),Math.sin(e)],layers=displayLayers(p,v),maxy=layers.at(-1)?.y1||0,center=[(b.x0+b.x1)/2,maxy/2,(b.z0+b.z1)/2];
 const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),raw=q=>{const d=q.map((x,i)=>x-center[i]);return[dot(R,d),-dot(U,d),dot(D,d)];},corners=[];
 for(const x of [b.x0,b.x1])for(const y of [0,maxy])for(const z of [b.z0,b.z1])corners.push(raw([x,y,z]));
 const minx=Math.min(...corners.map(q=>q[0])),maxx=Math.max(...corners.map(q=>q[0])),miny=Math.min(...corners.map(q=>q[1])),maxyy=Math.max(...corners.map(q=>q[1])),scale=Math.min((width-260)/Math.max(1,maxx-minx),(height-130)/Math.max(1,maxyy-miny))*v.zoom;
 const project=q=>{const r=raw(q);return[width/2+r[0]*scale,height/2+r[1]*scale,r[2]];};
 const unproject=(x,y,planeY=0)=>{const u=(x-width/2)/scale,vv=-(y-height/2)/scale,det=R[0]*U[2]-R[2]*U[0];if(Math.abs(det)<1e-8)return null;const a=u-R[1]*(planeY-center[1]),c=vv-U[1]*(planeY-center[1]);return[center[0]+(a*U[2]-c*R[2])/det,center[2]+(c*R[0]-a*U[0])/det];};
 return {project,unproject,R,U,D,scale,width,height};
}
export function modelFaces(p,view={},cam=camera(p,view)){
 const b=bounds(p),v=normalizeView(view),faces=[];
 for(const l of displayLayers(p,v)){
  if(v.hiddenLayers.includes(l.index)||!(l.thickness>0))continue;
  const q=[[b.x0,l.y0,b.z0],[b.x1,l.y0,b.z0],[b.x1,l.y1,b.z0],[b.x0,l.y1,b.z0],[b.x0,l.y0,b.z1],[b.x1,l.y0,b.z1],[b.x1,l.y1,b.z1],[b.x0,l.y1,b.z1]].map(cam.project);
  for(const [ids,shade]of [[[0,1,5,4],1],[[3,2,6,7],.9],[[0,3,7,4],.75],[[1,2,6,5],.85],[[4,5,6,7],1.08],[[0,1,2,3],.7]])faces.push({layer:l,points:ids.map(i=>q[i]),depth:ids.reduce((s,i)=>s+q[i][2],0)/4,shade});
 }
 return faces.sort((a,b)=>a.depth-b.depth);
}
