"""Export the verified solver source, never local engineering files or binaries."""
from pathlib import Path
import sys

source=Path(sys.argv[1]).resolve()
dest=Path(__file__).resolve().parents[1]/'backend'
names=['server.py','fem_adapter.py','layered_api.py','layered_shell_worker.py','projected_shell_kernel.py','layered_precision.py','support_geometry.py','solid_results.py','report_docx.py']
names+=['engines/calculix/'+n for n in ['offline_run.py','run_model.py','run_solid.py','material_adapter.py','analyze_results.py']]
for name in names:
    text=(source/name).read_text(encoding='utf-8-sig')
    if name=='server.py':text=text.replace('from cad_converter import status as cad_status, convert as convert_cad\n','')
    for expression in ["ROOT/'runtime/ccx.exe'","APP/'engines/calculix/runtime/ccx.exe'"]:
        text=text.replace(expression,"Path(os.environ['STONECALC_CCX'])")
    if "Path(os.environ['STONECALC_CCX'])" in text and 'from pathlib import Path' not in text:
        text='from pathlib import Path\n'+text
    target=dest/name;target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(text,encoding='utf-8',newline='\n')
print('Exported',len(names),'verified backend source files')
