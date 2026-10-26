// Self-contained Mathcad Prime JScript (ES3), transverse Euler-Bernoulli beam.
// No external files, network, CAD, COM or Python. Positive loads act downward.
// Same source runs as editable model parser (ROLE=input) and folded solver.
var ROLE = "__ROLE__";
var WIDTH = 24;
function fail(code) { var e = new Error("Beam model " + code); e.code = code; throw e; }
function num(s) {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) fail(1);
    var v=Number(s); if (!isFinite(v)) fail(1); return v;
}
function trim(s) { return s.replace(/^\s+|\s+$/g, ""); }
function pack(a) {
    var s="",v;
    for(var i=0;i<a.length;i++) {
        if(!isFinite(a[i])) fail(9);
        v=Number(a[i]).toExponential(15);
        while(v.length<WIDTH)v=" "+v;
        if(v.length!=WIDTH)fail(9);
        s+=v;
    }
    return s;
}
function unpack(s) {
    var a=[]; if(s.length%WIDTH)fail(1);
    for(var i=0;i<s.length;i+=WIDTH)a.push(Number(s.substr(i,WIDTH)));
    return a;
}
function unique(a,H) {
    a.sort(function(x,y){return x-y;});var b=[];
    for(var i=0;i<a.length;i++)if(!b.length||Math.abs(a[i]-b[b.length-1])>1e-10*H)b.push(a[i]);
    return b;
}
function position(s,nodes) {
    s=trim(s); var x,mm;
    if(s=="L")x=nodes[nodes.length-1];
    else if((mm=/^N(\d+)$/.exec(s))) {
        var ni=Number(mm[1]); if(ni>=nodes.length)fail(3);x=nodes[ni];
    } else if((mm=/^S(\d+):(.+)$/.exec(s))) {
        var si=Number(mm[1]),r=num(mm[2]); if(si<1||si>=nodes.length||r<0||r>1)fail(3);
        x=nodes[si-1]+r*(nodes[si]-nodes[si-1]);
    } else if(s.charAt(s.length-1)=="%")x=num(s.substr(0,s.length-1))/100*nodes[nodes.length-1];
    else x=num(s);
    if(x<0||x>nodes[nodes.length-1])fail(3);
    return x;
}
function magnitude(s,ref,scale) {
    s=trim(s);var mm;
    if(s==ref)return [1,1];
    if((mm=new RegExp("^"+ref+"\\*([^ ]+)$").exec(s)))return [1,num(mm[1])];
    return [0,num(s)*scale];
}
function parseModel(text) {
    var lines=text.replace(/\r/g,"").split("\n"),fields={},ud=[],pt=[],seenU=false,seenP=false;
    var allowed={"段长":1,"支点":1,"均布":1,"集中":1,"传力支点":1,"悬挑系数":1,"自重":1,"自重系数":1};
    for(var i=1;i<lines.length;i++) {
        var line=trim(lines[i]);if(!line)continue;
        var m=/^([^=]+)=(.*)$/.exec(line);if(!m)fail(1);
        var k=trim(m[1]),v=trim(m[2]);if(!allowed[k])fail(1);
        if(k=="均布") {seenU=true;if(v!="无")ud.push(v);}
        else if(k=="集中") {seenP=true;if(v!="无")pt.push(v);}
        else {if(fields[k]!=null)fail(1);fields[k]=v;}
    }
    if(trim(lines[0])!="立柱连续梁"&&trim(lines[0])!="横梁连续梁")fail(1);
    if(!seenU||!seenP)fail(1);
    if(!fields["段长"]||!fields["支点"]||!fields["悬挑系数"]||!fields["传力支点"])fail(1);
    if(!/mm$/.test(fields["段长"]))fail(1);
    var ss=fields["段长"].replace(/mm$/,"").split(/[,，]/),lengths=[],nodes=[0];
    if(ss.length<1||ss.length>20)fail(2);
    for(i=0;i<ss.length;i++){var l=num(trim(ss[i]));if(l<=0)fail(2);lengths.push(l);nodes.push(nodes[nodes.length-1]+l);}
    var H=nodes[nodes.length-1],supports=[],sa=fields["支点"].split(/[,，]/);
    for(i=0;i<sa.length;i++)supports.push(position(sa[i],nodes));
    var sorted=unique(supports.slice(0),H);if(sorted.length!=supports.length)fail(4);
    supports=sorted;if(supports.length<2||supports.length>32)fail(4);
    var factor=num(fields["悬挑系数"]);if(factor<=0||factor>10)fail(5);
    // Optional for older cards. This is transverse self-weight, not axial load.
    var weightMode=fields["自重"]==null?"不计":fields["自重"];
    if(weightMode!="不计"&&weightMode!="计入")fail(10);
    var weightFactor=fields["自重系数"]==null?1.2:num(fields["自重系数"]);
    if(!(weightFactor>0))fail(10);
    var transfer=[],tr=fields["传力支点"];
    for(i=0;i<supports.length;i++)transfer.push(0);
    if(tr=="全部")for(i=0;i<supports.length;i++)transfer[i]=1;
    else if(tr=="末2") {transfer[supports.length-1]=1;transfer[supports.length-2]=1;}
    else {
        var ts=tr.split(/[,，]/);
        for(i=0;i<ts.length;i++){var t=num(trim(ts[i]));if(t%1||t<1||t>supports.length||transfer[t-1])fail(6);transfer[t-1]=1;}
    }
    if(ud.length>16||pt.length>32)fail(7);
    var u=[],p=[],z,a,b,load;
    for(i=0;i<ud.length;i++) {
        z=ud[i].split(/[,，]/);if(z.length!=3)fail(7);
        a=position(z[0],nodes);b=position(z[1],nodes);if(b<=a)fail(7);
        load=magnitude(z[2],"q",1);u.push([a,b,load[0],load[1]]);
    }
    for(i=0;i<pt.length;i++) {
        z=pt[i].split(/[,，]/);if(z.length!=2)fail(7);
        a=position(z[0],nodes);load=magnitude(z[1],"P",1000);p.push([a,load[0],load[1]]);
    }
    var header=[1,0,lengths.length,supports.length,u.length,p.length,H,factor,weightMode=="计入"?1:0,weightFactor,0,0,0,0,0,0];
    var result=header.concat(lengths,supports,transfer);
    for(i=0;i<u.length;i++)result=result.concat(u[i]);
    for(i=0;i<p.length;i++)result=result.concat(p[i]);
    return {values:result,lengths:lengths,supports:supports,udl:u,points:p,transfer:transfer,H:H,factor:factor};
}
function decode(a) {
    if(a[0]!=1)fail(a[1]||1);
    var at=16,ls=a.slice(at,at+a[2]);at+=a[2];
    var sp=a.slice(at,at+a[3]);at+=a[3];var tr=a.slice(at,at+a[3]);at+=a[3];
    var u=[],p=[];
    for(var i=0;i<a[4];i++){u.push(a.slice(at,at+4));at+=4;}
    for(i=0;i<a[5];i++){p.push(a.slice(at,at+3));at+=3;}
    return {lengths:ls,supports:sp,transfer:tr,udl:u,points:p,H:a[6],factor:a[7],weightOn:a[8]||0,weightFactor:a[9]||1.2};
}
function zeros(n) {var a=[];for(var i=0;i<n;i++)a.push(0);return a;}
function solveSPD(K,F) {
    var n=F.length,L=[],scale=[],b=[],y=[],x=[];
    for(var i=0;i<n;i++){if(K[i][i]<=0)fail(8);scale[i]=Math.sqrt(K[i][i]);L[i]=zeros(n);b[i]=F[i]/scale[i];}
    for(i=0;i<n;i++)for(var j=0;j<=i;j++) {
        var s=K[i][j]/scale[i]/scale[j];for(var k=0;k<j;k++)s-=L[i][k]*L[j][k];
        if(i==j){if(s<1e-13)fail(8);L[i][j]=Math.sqrt(s);}else L[i][j]=s/L[j][j];
    }
    for(i=0;i<n;i++){s=b[i];for(j=0;j<i;j++)s-=L[i][j]*y[j];y[i]=s/L[i][i];}
    for(i=n-1;i>=0;i--){s=y[i];for(j=i+1;j<n;j++)s-=L[j][i]*x[j];x[i]=s/L[i][i];}
    for(i=0;i<n;i++)x[i]/=scale[i];return x;
}
function poly(a,x) {var v=0;for(var i=a.length-1;i>=0;i--)v=v*x+a[i];return v;}
function deriv(a) {var b=[];for(var i=1;i<a.length;i++)b.push(i*a[i]);return b.length?b:[0];}
function roots(a,lo,hi) {
    var b=a.slice(0),maxc=0,i;for(i=0;i<b.length;i++)maxc=Math.max(maxc,Math.abs(b[i]));
    if(maxc==0)return [];for(i=0;i<b.length;i++)b[i]/=maxc;
    while(b.length>1&&Math.abs(b[b.length-1])<1e-15)b.pop();
    if(b.length<=1)return [];
    if(b.length==2){var r=-b[0]/b[1];return r>=lo-1e-12&&r<=hi+1e-12?[Math.max(lo,Math.min(hi,r))]:[];}
    var cuts=[lo].concat(roots(deriv(b),lo,hi),[hi]),out=[];
    cuts=unique(cuts,1);
    for(i=0;i<cuts.length;i++)if(Math.abs(poly(b,cuts[i]))<1e-12)out.push(cuts[i]);
    for(i=0;i<cuts.length-1;i++) {
        var l=cuts[i],h=cuts[i+1],fl=poly(b,l),fh=poly(b,h);if(fl*fh>=0)continue;
        for(var j=0;j<55;j++){var mid=(l+h)/2,fm=poly(b,mid);if(fl*fm<=0){h=mid;}else{l=mid;fl=fm;}}
        out.push((l+h)/2);
    }
    return unique(out,1);
}
function peak(coeff,a,b) {
    var c=[a,b].concat(roots(deriv(coeff),a,b)),v=0;
    for(var i=0;i<c.length;i++)v=Math.max(v,Math.abs(poly(coeff,c[i])));return v;
}
function solveBeam(model,E,I,qRef,pRef,ratio,weightRef) {
    if(!(E>0&&I>0&&ratio>0)&&isFinite(E+I+ratio))fail(5);
    if(!isFinite(E+I+qRef+pRef+ratio))fail(5);
    if(weightRef==null)weightRef=0;
    if(!isFinite(weightRef)||weightRef<0||!isFinite(model.weightFactor)||model.weightFactor<=0)fail(10);
    var H=model.H,EI=E*I,sp=model.supports,mesh=[0,H],x=0,i,j,k;
    for(i=0;i<model.lengths.length;i++){x+=model.lengths[i];mesh.push(x);}
    mesh=mesh.concat(sp);var us=[],ps=[];
    for(i=0;i<model.udl.length;i++){var uu=model.udl[i];us.push([uu[0],uu[1],uu[2]?qRef*uu[3]:uu[3]]);mesh.push(uu[0],uu[1]);}
    if(model.weightOn)us.push([0,H,weightRef*model.weightFactor]);
    for(i=0;i<model.points.length;i++){var pp=model.points[i];ps.push([pp[0],pp[1]?pRef*pp[2]:pp[2]]);mesh.push(pp[0]);}
    mesh=unique(mesh,H);if(mesh.length>121)fail(7);
    function nodeIndex(v){for(var z=0;z<mesh.length;z++)if(Math.abs(mesh[z]-v)<H*1e-10)return z;fail(3);}
    var n=2*mesh.length,K=[],F=zeros(n),qs=[],isFixed={},free=[],d=zeros(n),zsol=zeros(n);
    for(i=0;i<n;i++)K.push(zeros(n));
    for(i=0;i<mesh.length-1;i++) {
        var le=mesh[i+1]-mesh[i],ell=le/H,q=0,mid=(mesh[i]+mesh[i+1])/2;
        for(j=0;j<us.length;j++)if(mid>us[j][0]&&mid<us[j][1])q+=us[j][2];qs.push(q);
        var a=12/Math.pow(ell,3),b=6/(ell*ell),c=4/ell,f=2/ell;
        var ke=[[a,b,-a,b],[b,c,-b,f],[-a,-b,a,-b],[b,f,-b,c]];
        var fe=[q*le/2,q*le*le/(12*H),q*le/2,-q*le*le/(12*H)];
        for(j=0;j<4;j++){F[2*i+j]+=fe[j];for(k=0;k<4;k++)K[2*i+j][2*i+k]+=ke[j][k];}
    }
    for(i=0;i<ps.length;i++)F[2*nodeIndex(ps[i][0])]+=ps[i][1];
    for(i=0;i<sp.length;i++)isFixed[2*nodeIndex(sp[i])]=true;
    for(i=0;i<n;i++)if(!isFixed[i])free.push(i);
    var kff=[],ff=[];
    for(i=0;i<free.length;i++){var row=[];for(j=0;j<free.length;j++)row.push(K[free[i]][free[j]]);kff.push(row);ff.push(F[free[i]]);}
    var sol=solveSPD(kff,ff);for(i=0;i<free.length;i++)zsol[free[i]]=sol[i];
    var residual=[];
    for(i=0;i<n;i++){var value=-F[i];for(j=0;j<n;j++)value+=K[i][j]*zsol[j];residual.push(value);d[i]=zsol[i]*Math.pow(H,3)/EI;}
    var R=[],Rmax=0,transfer=0,force=0,moment=0,fsum=0,msum=0,absLoad=0;
    for(i=0;i<sp.length;i++){var rr=-residual[2*nodeIndex(sp[i])];R.push(rr);Rmax=Math.max(Rmax,Math.abs(rr));if(model.transfer[i])transfer=Math.max(transfer,Math.abs(rr));force+=rr;moment+=rr*sp[i];}
    for(i=0;i<us.length;i++){value=us[i][2]*(us[i][1]-us[i][0]);fsum+=value;msum+=value*(us[i][0]+us[i][1])/2;absLoad+=Math.abs(value);}
    for(i=0;i<ps.length;i++){fsum+=ps[i][1];msum+=ps[i][1]*ps[i][0];absLoad+=Math.abs(ps[i][1]);}
    force-=fsum;moment-=msum;
    var freeRes=0;for(i=0;i<free.length;i++)freeRes=Math.max(freeRes,Math.abs(residual[free[i]]));
    if(Math.abs(force)>1e-6*Math.max(1,absLoad)||Math.abs(moment)>1e-6*Math.max(1,absLoad*H)||freeRes>1e-6*Math.max(1,absLoad))fail(9);
    var elements=[],Mmax=0,Vmax=0,Umax=0,curves=[[],[],[],[]];
    for(i=0;i<mesh.length-1;i++) {
        le=mesh[i+1]-mesh[i];q=qs[i];
        var w0=d[2*i],r0=d[2*i+1]/H,w1=d[2*i+2],r1=d[2*i+3]/H;
        var Q=q*Math.pow(le,4)/(24*EI);
        // Coefficients in local t=(x-x0)/le. Quartic particular solution is
        // essential: Hermite interpolation alone is not exact under a UDL.
        var u=[w0,r0*le,3*(w1-w0)-(2*r0+r1)*le+Q,2*(w0-w1)+(r0+r1)*le-2*Q,Q];
        var mc=deriv(deriv(u)),vc;
        for(j=0;j<mc.length;j++)mc[j]*=-EI/(le*le);
        vc=deriv(mc);for(j=0;j<vc.length;j++)vc[j]/=le;
        elements.push({a:mesh[i],b:mesh[i+1],u:u,M:mc,V:vc});
        Mmax=Math.max(Mmax,peak(mc,0,1));Vmax=Math.max(Vmax,peak(vc,0,1));Umax=Math.max(Umax,peak(u,0,1));
        for(j=0;j<=24;j++){var t=j/24;curves[0].push(mesh[i]+le*t);curves[1].push(poly(mc,t)/1e6);curves[2].push(poly(vc,t)/1000);curves[3].push(-poly(u,t));}
    }
    var domains=[];if(sp[0]>0)domains.push([0,sp[0],1]);
    for(i=0;i<sp.length-1;i++)domains.push([sp[i],sp[i+1],0]);
    if(sp[sp.length-1]<H)domains.push([sp[sp.length-1],H,2]);
    var eta=0,maxEquivalent=0;
    for(i=0;i<domains.length;i++) {
        var dm=domains[i],um=0,equivalent=(dm[1]-dm[0])*(dm[2]?model.factor:1),limit=equivalent/ratio;
        for(j=0;j<elements.length;j++){var el=elements[j],lo=Math.max(dm[0],el.a),hi=Math.min(dm[1],el.b);if(hi>=lo)um=Math.max(um,peak(el.u,(lo-el.a)/(el.b-el.a),(hi-el.a)/(el.b-el.a)));}
        dm.push(um,limit,um/limit);eta=Math.max(eta,um/limit);maxEquivalent=Math.max(maxEquivalent,equivalent);
    }
    var sx=[],sy=[],lx=[],ly=[];
    for(i=0;i<sp.length;i++){var v=sp[i],dd=.012*H;sx.push(v,v-dd,v+dd,v);sy.push(0,-.55,-.55,0);}
    function arrow(pos,load){if(load==0)return;var sign=load>0?1:-1,dd=.007*H;lx=lx.concat([pos,pos,pos,pos-dd,pos,pos+dd,pos,pos]);ly=ly.concat([0,1.4*sign,.12*sign,.4*sign,.12*sign,.4*sign,.12*sign,0]);}
    for(i=0;i<us.length;i++)for(j=1;j<=3;j++)arrow(us[i][0]+(us[i][1]-us[i][0])*j/4,us[i][2]);
    for(i=0;i<ps.length;i++)arrow(ps[i][0],ps[i][1]);
    if(!lx.length){lx=[0,0];ly=[0,0];}
    var header=[1,0,H,Mmax,Vmax,Umax,Rmax,transfer,eta,maxEquivalent,maxEquivalent/ratio,force,moment,0,sp.length,domains.length,curves[0].length,sx.length,lx.length,mesh.length,model.lengths.length,us.length,ps.length,freeRes];
    var result=header.concat(sp,R);
    for(i=0;i<domains.length;i++)result=result.concat(domains[i]);
    for(i=0;i<4;i++)result=result.concat(curves[i]);
    result=result.concat(sx,sy,lx,ly,mesh);
    for(i=0;i<mesh.length;i++)result.push(-d[2*i]);
    return {values:result,header:header,reactions:R,domains:domains,mesh:mesh,elements:elements};
}
function TextBoxEvent_Start(Inputs,Outputs) {};
function TextBoxEvent_Stop(Inputs,Outputs) {};
function TextBoxEvent_Exec(Inputs,Outputs) {
    try {
        if(ROLE=="input") {
            var parsed=parseModel(String(TextBox.Text()));
            Outputs[0].Value=pack(parsed.values);TextBox.BackColor(0xFFF397);
        } else {
            var parts=String(Inputs[0].Value).split("|"),model=decode(unpack(parts[0]));
            if(parts.length!=6&&parts.length!=7)fail(1);
            var solved=solveBeam(model,Number(parts[1]),Number(parts[2]),Number(parts[3]),Number(parts[4]),Number(parts[5]),parts.length==7?Number(parts[6]):0);
            Outputs[0].Value=pack(solved.values);TextBox.Text("模型计算完成；公式、单位换算与结果见本区域。无需修改此框。");
        }
    } catch(e) {
        var code=e.code||9,empty=zeros(ROLE=="input"?16:24);
        empty[1]=code;empty[6]=1;
        if(ROLE!="input"){empty[2]=1;empty[8]=1e99;empty[9]=1;empty[10]=1;empty[14]=1;empty[15]=1;empty[16]=2;empty[17]=2;empty[18]=2;empty[19]=2;while(empty.length<64)empty.push(0);}
        Outputs[0].Value=pack(empty);
        if(ROLE=="input")TextBox.BackColor(0xFFD6D6);
        else TextBox.Text("模型无效，错误代码 "+code+"；修改上方黄色模型卡片后重算。");
    }
};
