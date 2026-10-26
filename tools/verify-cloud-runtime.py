from pathlib import Path
import json,os,subprocess,sys,tempfile,math
root=Path.cwd();bundle=json.loads((root/'structural-v1/examples/second-book-original-1.json').read_text(encoding='utf-8'))
reference=bundle['result'];snapshot=reference['snapshot']
env=dict(os.environ,STONECALC_CCX=str(root/'.cloud/python/bin/ccx'),LD_LIBRARY_PATH=str(root/'.cloud/python/lib'),OMP_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1',PYTHONUTF8='1')
with tempfile.TemporaryDirectory(prefix='stonecalc-cloud-verify-')as temp:
    work=Path(temp);input_file=work/'input.json';input_file.write_text(json.dumps(snapshot,ensure_ascii=False),encoding='utf-8')
    folder=work/'runs'/'00000000000000000000000000000001'
    subprocess.run([sys.executable,str(root/'backend/cloud_worker.py'),'fem',str(input_file),str(folder)],env=env,check=True,timeout=300)
    result=json.loads((folder/'summary.json').read_text(encoding='utf-8'))
    assert result['snapshot']==snapshot
    for expected,actual in zip(reference['summary'],result['summary']):
        assert math.isclose(expected['max_abs_uy_mm'],actual['max_abs_uy_mm'],rel_tol=1e-7,abs_tol=1e-9)
        for el,al in zip(expected['layers'],actual['layers']):
            for key,peak in el['peaks'].items():assert math.isclose(peak['value'],al['peaks'][key]['value'],rel_tol=1e-6,abs_tol=1e-10),(key,peak,al['peaks'][key])
    print('Linux cloud kernel matches the verified original-1 second-book example')
