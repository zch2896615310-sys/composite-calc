const normalized=s=>String(s??'').replace(/\s+/g,' ').trim();
export const isFailureText=s=>/不满足|挠度超限|所列公式超过输入限值/.test(normalized(s));
const numeric=s=>{const t=normalized(s).replace(/,/g,'');return t!==''&&Number.isFinite(Number(t))?Number(t):null;};

export function failureCells(rows){
 const headers=(rows[0]||[]).map(normalized),valueColumn=headers.findIndex(h=>/^(计算值|数值)(\s|$)/.test(h)),result=valueColumn>=0?valueColumn:headers.findIndex(h=>/^结果(\s|$)/.test(h)),limit=headers.findIndex(h=>/^限值(\s|$)/.test(h)),judgment=headers.findIndex(h=>/^(判断|结论)$/.test(h));
 return rows.map((row,j)=>{
  const flags=row.map(()=>false);if(!j)return flags;
  let failed=judgment>=0&&isFailureText(row[judgment]);
  if(judgment<0&&result>=0&&limit>=0){const a=numeric(row[result]),b=numeric(row[limit]);failed=a!==null&&b!==null&&a>b;}
  if(normalized(row[0])==='挠度限值利用率'&&numeric(row[1])!==null&&numeric(row[1])>100)failed=true;
  if(failed)for(const k of [0,result,judgment])if(k>=0&&k<flags.length)flags[k]=true;
  return flags;
 });
}

export function markReportFailures(root){
 for(const table of root.querySelectorAll('table')){
  const trs=[...table.querySelectorAll('tr')],flags=failureCells(trs.map(tr=>[...tr.children].map(c=>normalized(c.textContent))));
  trs.forEach((tr,j)=>[...tr.children].forEach((cell,k)=>{if(flags[j]?.[k])cell.classList.add('report-fail');}));
 }
 for(const el of root.querySelectorAll('p,.result-notice,.state-pill.danger'))if(el.classList.contains('danger')||isFailureText(el.textContent))el.classList.add('report-fail');
 return root;
}
