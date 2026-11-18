export function syntheticMenu(input,prefix='Test'){
 return {days:Array.from({length:(Date.parse(input.end_date)-Date.parse(input.start_date))/86400000+1},(_,i)=>({
  date:new Date(Date.parse(input.start_date)+i*86400000).toISOString().slice(0,10),
  meals:Object.fromEntries(input.meals.map(meal=>[meal,{title:`${prefix} ${meal} ${i+1}`,cuisine:'south_indian',servings:input.people_count,cooking_minutes:40,
   ingredients:[{name:'rice',quantity:200,unit:'g',allergens:[]}],steps:['Wash, cook and serve.'],storage_notes:'Serve promptly.'}]))
 }))};
}
export async function menuPreview(actor,rpc,user,booking){
 const requested=await actor(user,()=>rpc('chefos_menu_request',["'preview'",'$1'],[booking]));
 const job=await rpc('chefos_server_claim_menu',['$1'],[requested.job_id]);
 if(job){
  await rpc('chefos_server_finish_menu',['$1','$2','$3',"'custom'"],[job.id,job.claim_token,syntheticMenu(job.input)]);
 }
 const result=await actor(user,()=>rpc('chefos_menu_request',["'job'",'$1'],[{job_id:requested.job_id}]));
 await actor(user,()=>rpc('chefos_menu_request',["'accept'",'$1'],[{menu_id:result.menu.id,version:result.menu.version}]));
 return {menu_id:result.menu.id,menu_version:result.menu.version};
}
