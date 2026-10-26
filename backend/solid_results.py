"""Postprocess the unchanged V2 C3D8I solver. No shell stress substitutions."""
import math
VERSION='solid-ip-v2'
CASES={'DEAD':{'DEAD':1},'EQ_Y':{'EQ_Y':1},'EQ_X':{'EQ_X':1},'qe':{'EQ_Y':1,'EQ_X':1},'ULS':{'DEAD':1.3,'EQ_Y':1.4,'EQ_X':1.4},'SLS':{'DEAD':1,'EQ_Y':1,'EQ_X':1},'ULS_MINUS':{'DEAD':1.3,'EQ_Y':-1.4,'EQ_X':-1.4},'SLS_MINUS':{'DEAD':1,'EQ_Y':-1,'EQ_X':-1}}
GAUSS=[(-1,-1,-1),(1,-1,-1),(-1,1,-1),(1,1,-1),(-1,-1,1),(1,-1,1),(-1,1,1),(1,1,1)]
def measures(s):
 a,b,c,t,u,v=s
 q=(a+b+c)/3;p=math.sqrt(((a-q)**2+(b-q)**2+(c-q)**2+2*(t*t+u*u+v*v))/6)
 if p<1e-30:principal=q
 else:
  aa,bb,cc=(a-q)/p,(b-q)/p,(c-q)/p;tt,uu,vv=t/p,u/p,v/p
  det=aa*bb*cc+2*tt*uu*vv-aa*vv*vv-bb*uu*uu-cc*tt*tt
  principal=q+2*p*math.cos(math.acos(max(-1,min(1,det/2)))/3)
 return {'principal3':principal,'principal_plane':(a+b)/2+math.hypot((a-b)/2,t),'mises3':math.sqrt(((a-b)**2+(b-c)**2+(c-a)**2)/2+3*(t*t+u*u+v*v)),'mises_plane':math.sqrt(max(0,a*a+b*b-a*b+3*t*t)),'t13':u,'t23':v,'shear_transverse':math.hypot(u,v)}
def peak_record(value,eid,gp,xyz,signed=None):return {'value':value,'signed':value if signed is None else signed,'element':eid,'gp':gp,'xyz_mm':xyz}
def summarize(mesh,fields,p):
 layers=[]
 for il,layer in enumerate(p['layers']):
  peaks={};components=[0.]*6
  for (eid,gp),s in fields['s'].items():
   e=mesh['element_metadata'][str(eid)]
   if e['layer']!=il:continue
   g=GAUSS[gp-1];xyz=[(e[k+'0']+e[k+'1'])/2+g[j]*(e[k+'1']-e[k+'0'])/2/math.sqrt(3) for j,k in enumerate('xyz')]
   for j,v in enumerate(s):components[j]=max(components[j],abs(v))
   for key,signed in measures(s).items():
    value=abs(signed) if key in ('t13','t23') else max(0,signed)
    if key not in peaks or value>peaks[key]['value']:peaks[key]=peak_record(value,eid,gp,xyz,signed)
  layers.append({'layer':layer['name'],'material':layer['material'],'max_abs_components_MPa':components,'peaks':peaks})
 front=[int(n)for n,q in mesh['nodes'].items()if abs(q[1])<1e-8]
 n=max(front,key=lambda n:abs(fields['u'][n][1]));alln=max(fields['u'],key=lambda n:abs(fields['u'][n][1]))
 all_peak={'value':abs(fields['u'][alln][1]),'signed':fields['u'][alln][1],'node':alln,'xyz_mm':mesh['nodes'].get(str(alln),mesh['nodes'].get(alln))}
 return layers,{'value':abs(fields['u'][n][1]),'signed':fields['u'][n][1],'node':n,'xyz_mm':mesh['nodes'][str(n)] if str(n) in mesh['nodes'] else mesh['nodes'][n]},all_peak
