import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export async function testTestEnvironment(db, actor, rpc) {
 const counts=async()=>JSON.stringify((await db.query(`select (select count(*) from public.chefos_profiles) profiles,(select count(*) from public.chefos_chefs) chefs,(select count(*) from chefos_private.chef_locations) locations,(select count(*) from chefos_private.payments) payments`)).rows[0]);
 const before=await counts();
 await db.exec(await readFile(new URL('../setup/seed_test_chefs.sql',import.meta.url),'utf8'));
 assert.equal((await db.query("select count(*)::int n from public.chefos_chefs_test where id::text like 'eeee0000-%'")).rows[0].n,18);
 assert.equal((await db.query("select count(*)::int n from chefos_test_private.chef_slots_test where chef_id::text like 'eeee0000-%'")).rows[0].n,18*63);
 const admin=(await db.query("select id from public.chefos_profiles_test where role='admin' and is_active limit 1")).rows[0].id;
 await actor(admin,async()=>assert.equal((await rpc('chefos_simulate_locations_test')).updated,18));
 const crossing=(await db.query(`select count(*)::int n from pg_constraint con join pg_class own on own.oid=con.conrelid join pg_namespace ns on ns.oid=own.relnamespace join pg_class target on target.oid=con.confrelid join pg_namespace target_ns on target_ns.oid=target.relnamespace where con.contype='f' and ((ns.nspname='public' and own.relname like '%\_test') or ns.nspname='chefos_test_private') and (target_ns.nspname='chefos_private' or (target_ns.nspname='public' and target.relname not like '%\_test'))`)).rows[0].n;
 assert.equal(crossing,0,'test foreign keys must stay in test business tables');
 const customer='bbbb0000-0000-4000-8000-000000000001', chefUser='bbbb0000-0000-4000-8000-000000000002', other='bbbb0000-0000-4000-8000-000000000003';
 await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,'test-customer@example.test','{"username":"test-customer","chefos_environment":"test"}'),($2,'test-chef@example.test','{"username":"test-chef","account_type":"chef","chefos_environment":"test"}'),($3,'test-other@example.test','{"username":"test-other","chefos_environment":"test"}')`,[customer,chefUser,other]);
 assert.equal((await db.query('select count(*)::int n from public.chefos_profiles where id=any($1::uuid[])',[[customer,chefUser,other]])).rows[0].n,0);
 const chef=(await db.query('update public.chefos_chefs_test set is_verified=true,is_available=true where user_id=$1 returning id',[chefUser])).rows[0].id;
 const diet={age:30,height_cm:175,weight_kg:70,activity_level:'moderate',goal:'healthy_eating',diet:'vegetarian',cuisines:['south_indian'],allergens:[],other_restrictions:'',dislikes:'',non_veg_days:[],cheat_meal_day:null,allergies_confirmed:true,personalisation_consent:true};
 await actor(customer,async()=>{
  await rpc('chefos_diet_profile_test',['$1','0'],[diet]);
  assert.equal((await rpc('chefos_diet_profile_test')).ready,true);
  assert.equal((await rpc('chefos_discovery_map_test')).chefs.length,18);
  await assert.rejects(()=>rpc('chefos_mobile_action',["'chefs.list'"]),/active Chefos/i);
  await assert.rejects(()=>db.query('update public.chefos_chefs_test set is_verified=true'),/permission denied/i);
  await assert.rejects(()=>rpc('chefos_simulate_locations_test'),/administrator/i);
 });
 await actor(chefUser,async()=>{
  await rpc('chefos_update_location_test',['$1'],[{latitude:13.008641,longitude:77.695013,accuracy:8,heading:45,speed:2,recorded_at:new Date().toISOString()}]);
  const old=await rpc('chefos_update_location_test',['$1'],[{latitude:13,longitude:77,recorded_at:new Date(Date.now()-5000).toISOString()}]);
  assert.equal(old.accepted,false);
 });
 const quote=await actor(customer,()=>rpc('chefos_price_quote_test',['$1','3',"'weekly'",'1'],[chef]));
 const plan=(await db.query(`insert into public.chefos_subscriptions_test(user_id,chef_id,meal_type,meal_wave,people_count,plan_cycle,start_date,end_date,price,pricing) values($1,$2,array['lunch'],'{"lunch":"L2"}',3,'weekly',current_date,current_date+6,$3,$4) returning id`,[customer,chef,quote.price_inr,quote])).rows[0].id;
 const visit=(await db.query(`insert into chefos_test_private.service_sessions_test(user_id,chef_id,subscription_id,meal,wave,service_date) values($1,$2,$3,'lunch','L2',(now() at time zone 'Asia/Kolkata')::date) returning id`,[customer,chef,plan])).rows[0].id;
 assert.equal((await actor(customer,()=>rpc('chefos_live_tracking_test',['$1'],[visit]))).location,null);
 await actor(chefUser,()=>rpc('chefos_service_action_test',['$1',"'journey'"],[visit]));
 await db.query('update public.chefos_chefs_test set is_available=false where id=$1',[chef]);
 const tracking=await actor(customer,()=>rpc('chefos_live_tracking_test',['$1'],[visit]));
 assert.equal(tracking.location.latitude,13.008641);
 await actor(other,()=>assert.rejects(()=>rpc('chefos_live_tracking_test',['$1'],[visit]),/not assigned/i));
 await actor(other,async()=>assert.equal((await db.query('select count(*)::int n from public.chefos_live_locations_test where chef_id=$1',[chef])).rows[0].n,0));
 await actor(customer,async()=>assert.equal((await db.query('select count(*)::int n from public.chefos_live_locations_test where chef_id=$1',[chef])).rows[0].n,1));
 await db.query("update chefos_test_private.service_sessions_test set status='completed' where id=$1",[visit]);
 assert.equal((await actor(customer,()=>rpc('chefos_live_tracking_test',['$1'],[visit]))).location,null);
 assert.equal(await counts(),before,'test signup, seeding, preferences, tracking and sessions must not write production business rows');
 console.log('PASS: 18 isolated test chefs; 1,134 test slots; test-only signup; independent foreign keys, preferences and pricing; exact GPS; stale update rejection; assigned-customer tracking; completion privacy; production row counts unchanged.');
}
