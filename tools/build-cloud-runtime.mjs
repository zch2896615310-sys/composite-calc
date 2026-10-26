import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=process.cwd(),cloud=path.join(root,'.cloud'),prefix=path.join(cloud,'python');
await fs.mkdir(cloud,{recursive:true});
const run=(cmd,args)=>execFileSync(cmd,args,{stdio:'inherit',env:{...process.env,MAMBA_ROOT_PREFIX:path.join(cloud,'mamba')}});
try{await fs.access(path.join(cloud,'runtime.tar.gz'));}
catch{
  const response=await fetch('https://micro.mamba.pm/api/micromamba/linux-64/2.5.0');
  if(!response.ok)throw Error('micromamba download failed');
  const archive=path.join(cloud,'micromamba.tar.bz2');await fs.writeFile(archive,new Uint8Array(await response.arrayBuffer()));
  run('tar',['-xjf',archive,'-C',cloud,'bin/micromamba']);
  run(path.join(cloud,'bin/micromamba'),['create','-y','-p',prefix,'-c','conda-forge','python=3.11','numpy=2.2.6','calculix=2.23']);
  const bin=await fs.readdir(path.join(prefix,'bin'));
  if(!bin.includes('ccx')){const name=bin.find(n=>/^ccx[_-]/.test(n));if(!name)throw Error('CalculiX executable missing');await fs.symlink(name,path.join(prefix,'bin/ccx'));}
  run(path.join(prefix,'bin/python'),['-c','import numpy;print("Cloud NumPy",numpy.__version__)']);
  run('tar',['-czf',path.join(cloud,'runtime.tar.gz'),'-C',prefix,'.']);
}
await fs.mkdir('backend/fonts',{recursive:true});
const font=await fetch('https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf');
if(!font.ok)throw Error('Chinese report font download failed');
await fs.writeFile('backend/fonts/NotoSansCJKsc-Regular.otf',new Uint8Array(await font.arrayBuffer()));
// Exercise the Linux solver against the previously verified second-book result
// before allowing the deployment to become production.
run(path.join(prefix,'bin/python'),['tools/verify-cloud-runtime.py'],);
// Preserve the established public URLs, excluding backend code and runtimes.
await fs.mkdir('site',{recursive:true});
for(const entry of await fs.readdir(root,{withFileTypes:true})){
  if(entry.isFile()&&/\.(html|css|js|svg|png|jpg|ico)$/.test(entry.name))await fs.copyFile(entry.name,path.join('site',entry.name));
}
await fs.cp('structural-v1','site/structural-v1',{recursive:true});
const services={solverBase:'https://comstrucalc.netlify.app',reportBase:'https://comstrucalc.netlify.app',cadBase:''};
await fs.writeFile('site/structural-v1/services.json',JSON.stringify(services));
console.log('Prepared online solver runtime and public site');
