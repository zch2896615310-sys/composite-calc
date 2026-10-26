// Deployment-owned configuration. Empty service URLs mean browser-only mode.
const config=await fetch(new URL('./services.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('服务配置读取失败');return r.json();});
const names={solver:'有限元',report:'Word/PDF 导出',cad:'DWG 转换'};
const allowedBase=value=>{
  if(!value)return '';
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||/^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url.hostname))throw Error('在线服务地址必须使用 HTTPS 公网地址');
  return url.href.replace(/\/$/,'');
};
export const services=Object.freeze(Object.fromEntries(['solver','report','cad'].map(k=>[k+'Base',allowedBase(config[k+'Base'])])));
export function serviceURL(kind,path){
  const base=services[kind+'Base'];
  if(!base)throw Error(`${names[kind]||kind}在线服务待接入`);
  if(!path.startsWith('/')&&path!=='')throw Error('服务路径无效');
  return base+path;
}
export function reportDownloadURL(path){
  const base=serviceURL('report','/');
  const url=new URL(path,base);
  if(url.origin!==new URL(base).origin)throw Error('报告下载地址与导出服务不一致');
  return url.href;
}
