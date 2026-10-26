"""Portable entry point for isolated Netlify solver/export jobs."""
from pathlib import Path
import json,sys,os

HERE=Path(__file__).resolve().parent
kind,input_file,output_folder=sys.argv[1:]
folder=Path(output_folder);folder.mkdir(parents=True,exist_ok=True)
payload=json.loads(Path(input_file).read_text(encoding='utf-8'))
if kind=='fem':
    import server
    p=payload['project'];size=payload['mesh_mm']
    import math
    axes=[sorted(set(p['geometry'][key]+[s[axis]for s in p['supports']]))for key,axis in [('x_breaks','x'),('z_breaks','z')]]
    cells=math.prod(sum(math.ceil((b-a)/size)if size>0 else 1 for a,b in zip(axis,axis[1:]))for axis in axes)
    limit=2000 if payload.get('postprocess')=='layered-shell-v1' else max(1,5000//len(p['layers']))
    if cells>limit:raise ValueError('当前在线任务网格过密，请增大网格控制尺寸后重试')
    if payload.get('postprocess')=='layered-shell-v1':
        server.layered_api.validate(p,size,server.validate)
        (folder/'input.json').write_text(json.dumps(payload,ensure_ascii=False),encoding='utf-8')
        # Preserve the exact submitted snapshot and existing precision kernel.
        from projected_shell_kernel import build,write
        from layered_shell_worker import summarize
        build(p,size,folder,lambda message:print(message,flush=True))
        write(folder/'summary.json',summarize(folder,payload,folder.name))
    elif payload.get('postprocess')=='solid-ip-v2':
        server.validate(p,size)
        server.ROOT=folder.parent.parent
        server.update_job=lambda job_id,**value:print(value.get('message',''),flush=True)
        # compute_job creates its own output directory.
        folder.rmdir()
        server.compute_job(folder.name,p,size)
        if not(folder/'summary.json').is_file():raise ValueError((folder/'error.txt').read_text(encoding='utf-8'))
    else:raise ValueError('不支持的有限元结果版本')
else:
    from report_docx import build
    from zipfile import ZipFile,ZIP_DEFLATED
    # A generic, data-free OPC cover; retain the existing native OOXML writer.
    w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    paragraphs=''.join(f'<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{"结构计算书" if i==5 else ""}</w:t></w:r></w:p>'for i in range(27))
    parts={
      '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/_rels/document.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
      'word/document.xml':f'<w:document xmlns:w="{w}"><w:body>{paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr></w:body></w:document>'}
    template=folder/'cover.docx'
    with ZipFile(template,'w',ZIP_DEFLATED)as z:
        for name,data in parts.items():z.writestr(name,data)
    build(payload,folder/'report.docx',template)
print('complete',flush=True)
