import {store} from '../lib/jobs.mjs';
export default async()=>{
 const db=store();
 for await(const page of db.list({prefix:'jobs/',paginate:true}))for(const item of page.blobs){
  const job=await db.get(item.key,{type:'json'});
  if(!job||Date.now()-job.created<86400000)continue;
  for await(const files of db.list({prefix:'files/'+job.id+'/',paginate:true}))await Promise.all(files.blobs.map(f=>db.delete(f.key)));
  await Promise.all(['jobs/','inputs/','results/'].map(prefix=>db.delete(prefix+job.id)));
 }
};
export const config={schedule:'@daily'};
