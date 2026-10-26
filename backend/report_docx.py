"""Native DOCX export using the retained reference package and its page system.

Standard library only. Body paragraphs/tables and OMML equations are editable;
computed figures are PNG. Original input files are never written.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from copy import deepcopy
import base64
import hashlib
import json
import re
import xml.etree.ElementTree as E

W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
M='http://schemas.openxmlformats.org/officeDocument/2006/math'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
REL='http://schemas.openxmlformats.org/package/2006/relationships'
CT='http://schemas.openxmlformats.org/package/2006/content-types'
WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
A='http://schemas.openxmlformats.org/drawingml/2006/main'
PIC='http://schemas.openxmlformats.org/drawingml/2006/picture'
for prefix,namespace in [('w',W),('m',M),('r',R),('wp',WP),('a',A),('pic',PIC)]:E.register_namespace(prefix,namespace)
def q(ns,name):return '{'+ns+'}'+name
def sub(parent,ns,tag,attrs=None,text=None):
    n=E.SubElement(parent,q(ns,tag),attrs or {})
    if text is not None:n.text=str(text)
    return n

def paragraph(text='',size=24,bold=False,center=False,keep=False,fail=False):
    p=E.Element(q(W,'p'));pp=sub(p,W,'pPr')
    sub(pp,W,'spacing',{q(W,'after'):'120',q(W,'line'):'360',q(W,'lineRule'):'auto'})
    if center:sub(pp,W,'jc',{q(W,'val'):'center'})
    if keep:sub(pp,W,'keepNext')
    r=sub(p,W,'r');rp=sub(r,W,'rPr');sub(rp,W,'rFonts',{q(W,'ascii'):'Times New Roman',q(W,'hAnsi'):'Times New Roman',q(W,'eastAsia'):'宋体'})
    sub(rp,W,'sz',{q(W,'val'):str(size)})
    if bold or fail:sub(rp,W,'b')
    if fail:sub(rp,W,'color',{q(W,'val'):'C00000'})
    sub(r,W,'t',{'{http://www.w3.org/XML/1998/namespace}space':'preserve'},text)
    return p

def equation(text):
    p=E.Element(q(W,'p'));pp=sub(p,W,'pPr');sub(pp,W,'spacing',{q(W,'before'):'60',q(W,'after'):'120'})
    math=sub(sub(p,M,'oMathPara'),M,'oMath')
    # Separate math tokens so readers do not reinterpret adjacent variable
    # names as a command (e.g. It disappearing in LibreOffice).
    for char in text:
        run=sub(math,M,'r');pr=sub(run,M,'rPr');sub(pr,M,'sty',{q(M,'val'):'p'})
        sub(run,M,'t',{'{http://www.w3.org/XML/1998/namespace}space':'preserve'},char)
    return p

def table(rows,failed_cells=None):
    if not rows:return paragraph()
    cols=max(len(r) for r in rows);t=E.Element(q(W,'tbl'));pr=sub(t,W,'tblPr')
    sub(pr,W,'tblW',{q(W,'w'):'8306',q(W,'type'):'dxa'})
    borders=sub(pr,W,'tblBorders')
    for k in ['top','left','bottom','right','insideH','insideV']:sub(borders,W,k,{q(W,'val'):'single',q(W,'sz'):'4',q(W,'color'):'999999'})
    grid=sub(t,W,'tblGrid')
    for _ in range(cols):sub(grid,W,'gridCol',{q(W,'w'):str(8306//cols)})
    for j,row in enumerate(rows):
        tr=sub(t,W,'tr')
        trp=sub(tr,W,'trPr');sub(trp,W,'cantSplit')
        if j==0:sub(trp,W,'tblHeader')
        for col,value in enumerate(row):
            tc=sub(tr,W,'tc');tcp=sub(tc,W,'tcPr');sub(tcp,W,'tcW',{q(W,'w'):str(8306//cols),q(W,'type'):'dxa'})
            if j==0:sub(tcp,W,'shd',{q(W,'fill'):'F2F2F2'})
            failed=bool(j and failed_cells and j<len(failed_cells) and col<len(failed_cells[j]) and failed_cells[j][col])
            cell=paragraph(str(value),size=20,bold=j==0,fail=failed)
            cp=cell.find(q(W,'pPr'));sub(cp,W,'ind',{q(W,k):'0' for k in ['left','right','firstLine','leftChars','rightChars','firstLineChars']})
            spacing=cp.find(q(W,'spacing'));spacing.set(q(W,'line'),'260');spacing.set(q(W,'after'),'60')
            tc.append(cell)
    return t

def image_paragraph(rid,idx,width,height):
    # Render figures at a width consistent with the reference's text area.
    inches=min(5.5,width/100)
    h_inches=inches*height/width
    if h_inches>5.6:inches*=5.6/h_inches;h_inches=5.6
    cx,cy=int(inches*914400),int(h_inches*914400)
    p=E.Element(q(W,'p'));pp=sub(p,W,'pPr');sub(pp,W,'jc',{q(W,'val'):'center'})
    sub(pp,W,'spacing',{q(W,'line'):'240',q(W,'lineRule'):'auto',q(W,'after'):'80'})
    inline=sub(sub(sub(p,W,'r'),W,'drawing'),WP,'inline',{'distT':'0','distB':'0','distL':'0','distR':'0'})
    sub(inline,WP,'extent',{'cx':str(cx),'cy':str(cy)})
    sub(inline,WP,'docPr',{'id':str(idx),'name':f'Calculation figure {idx}'})
    graphic=sub(inline,A,'graphic');data=sub(graphic,A,'graphicData',{'uri':PIC});pic=sub(data,PIC,'pic')
    nv=sub(pic,PIC,'nvPicPr');sub(nv,PIC,'cNvPr',{'id':str(idx),'name':f'figure-{idx}.png'});sub(nv,PIC,'cNvPicPr')
    fill=sub(pic,PIC,'blipFill');sub(fill,A,'blip',{q(R,'embed'):rid});sub(sub(fill,A,'stretch'),A,'fillRect')
    sp=sub(pic,PIC,'spPr');transform=sub(sp,A,'xfrm');sub(transform,A,'off',{'x':'0','y':'0'});sub(transform,A,'ext',{'cx':str(cx),'cy':str(cy)})
    sub(sub(sp,A,'prstGeom',{'prst':'rect'}),A,'avLst')
    return p

def build(payload,dest,template):
    title=payload.get('title');sections=payload.get('sections')
    if not isinstance(title,str) or not isinstance(sections,list) or len(sections)>100:raise ValueError('报告数据格式无效')
    with ZipFile(template) as z:parts={n:z.read(n) for n in z.namelist()}
    old=E.fromstring(parts['word/document.xml']);oldbody=old.find(q(W,'body'))
    doc=E.Element(q(W,'document'));body=sub(doc,W,'body')
    # Keep the original vertical five-character cover and paragraph rhythm.
    for i,child in enumerate(list(oldbody)[:27]):
        p=deepcopy(child)
        if i==5:
            runs=p.findall(q(W,'r'))
            for r in runs:p.remove(r)
            replacement=paragraph(title,size=38,bold=True,center=True)
            for r in replacement.findall(q(W,'r')):p.append(r)
        body.append(p)
    page=paragraph();sub(sub(page,W,'r'),W,'br',{q(W,'type'):'page'});body.append(page)
    body.append(paragraph('计算说明',size=30,bold=True,keep=True))
    body.append(paragraph('本计算书由项目中的基础荷载、截面、结构分析及所列公式验算生成。各模块输入、计算假定和结果状态分别列明；实体或分层壳分析及其材料强度、挠度和连接验算统一使用CalculiX，各章明确取值定义。'))
    body.append(paragraph('项目名称 '+title))
    for text in payload.get('introduction',[]):body.append(paragraph(text))
    if payload.get('overall'):
        body.append(paragraph('项目校核状态',size=28,bold=True,keep=True))
        for item in payload['overall']:
            text=item.get('text','') if isinstance(item,dict) else str(item)
            fail=item.get('fail',False) if isinstance(item,dict) else bool(re.search('不满足|挠度超限|所列公式超过输入限值',text))
            body.append(paragraph(text,fail=bool(fail)))
    original_rels=parts['word/_rels/document.xml.rels'].decode('utf-8')
    original_types=parts['[Content_Types].xml'].decode('utf-8')
    added_relationships=[]
    image_id=1000
    for index,s in enumerate(sections,1):
        body.append(paragraph(f'第{index}节  {s["title"]}',size=30,center=True,keep=True))
        inputs=s.get('inputRows',[])
        if inputs:
            body.append(paragraph('一  输入参数',size=26,bold=True,keep=True))
            if len(inputs)>10:
                paired=[inputs[j]+(inputs[j+1] if j+1<len(inputs) else ['','']) for j in range(0,len(inputs),2)]
                body.append(table([['参数','值','参数','值']]+paired))
            else:body.append(table([['参数','值']]+inputs))
        formulas=s.get('formulas',[])
        if formulas:
            body.append(paragraph('二  计算公式',size=26,bold=True,keep=True))
            for formula in formulas:body.append(equation(str(formula)))
        body.append(paragraph('三  计算过程与结果',size=26,bold=True,keep=True))
        for block in s.get('blocks',[]):
            kind=block['type']
            if kind=='table':
                body.append(table(block['rows'],block.get('failedCells')))
                spacer=paragraph('',size=2);spacing=spacer.find(q(W,'pPr')).find(q(W,'spacing'));spacing.set(q(W,'line'),'100');spacing.set(q(W,'after'),'60');body.append(spacer)
            elif kind=='image':
                data=base64.b64decode(block['data'],validate=True)
                if not data.startswith(b'\x89PNG\r\n\x1a\n') or len(data)>10_000_000:raise ValueError('报告图像无效')
                image_id+=1;rid=f'rIdWorkbench{image_id}';name=f'media/workbench-{image_id}.png';parts['word/'+name]=data
                added_relationships.append(f'<Relationship Id="{rid}" Type="{R}/image" Target="{name}"/>')
                width,height=block['width'],block['height']
                if not(0<width<10000 and 0<height<10000):raise ValueError('图像尺寸无效')
                body.append(image_paragraph(rid,image_id,width,height));body.append(paragraph(block.get('caption','计算结果图'),size=20,center=True))
            else:body.append(paragraph(block.get('text',''),size=24,bold=kind=='subheading',keep=kind=='subheading',fail=bool(block.get('fail')) and kind!='subheading'))
    body.append(deepcopy(oldbody.find(q(W,'sectPr'))))
    parts['word/document.xml']=E.tostring(doc,encoding='utf-8',xml_declaration=True)
    # Keep OPC relationship/content-type roots in the original default
    # namespace representation; some office readers reject prefixed roots.
    parts['word/_rels/document.xml.rels']=original_rels.replace('</Relationships>',''.join(added_relationships)+'</Relationships>').encode('utf-8')
    # Include a machine-readable source snapshot without printing raw JSON in
    # the engineer-facing chapters. Editable native equations remain in body.
    parts['workbench/input.json']=json.dumps(payload.get('projectSnapshot',{}),ensure_ascii=False,indent=2).encode()
    parts['[Content_Types].xml']=original_types.replace('</Types>','<Override PartName="/workbench/input.json" ContentType="application/json"/></Types>').encode('utf-8')
    with ZipFile(dest,'w',ZIP_DEFLATED) as z:
        for n,data in parts.items():z.writestr(n,data)
    return{'template_sha256':hashlib.sha256(Path(template).read_bytes()).hexdigest(),'sections':len(sections),'figures':image_id-1000,'equations':sum(len(s.get('formulas',[])) for s in sections),'sha256':hashlib.sha256(Path(dest).read_bytes()).hexdigest()}
