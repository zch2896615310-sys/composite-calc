export function moduleState({type,result,error,job,stale=false,inputError=false}){
 if(inputError)return{label:'输入未完成',tone:'warning'};
 if(['queued','running'].includes(job?.status))return{label:'计算中',tone:'running'};
 if(stale)return{label:'结果已失效',tone:'warning'};
 if(error)return{label:/尚未计算|尚未得到|待重新计算|结果待|输入已改变/.test(error)?'待计算':'待检查',tone:'warning'};
 if(!result)return{label:['fem','shell'].includes(type)?'待计算':'待输入',tone:'neutral'};
 if(result.pending)return{label:'待补数据',tone:'warning'};
 if(result.pass===false)return{label:'不满足',tone:'danger'};
 if(result.pass===true)return{label:'所列满足',tone:'success'};
 if(result.pass===null)return{label:'仅计算需求',tone:'neutral'};
 if(type==='shell'&&result.mode==='legacy')return{label:'校准参考',tone:'neutral'};
 if(type==='beam'&&result.utilization>1)return{label:'挠度超限',tone:'danger'};
 return{label:'已计算',tone:'success'};
}
