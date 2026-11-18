import { PGlite } from '@electric-sql/pglite';
import { readFile,readdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { testVisits } from './test-visits.mjs';
import { testSessionSafety } from './test-session-safety.mjs';
import { testInstantVisits } from './test-instant-visits.mjs';
import { testTestEnvironment } from './test-test-environment.mjs';
process.on('uncaughtException',error=>{console.error(error.message,error.where || '',error.internalQuery || '');process.exit(1)});
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email text,phone text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;`);
for(const file of (await readdir(new URL('../migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()){
 try{await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));console.log('Applied',file)}catch(e){console.error(file,e.message,e.where,e.position);process.exit(1)}
}
const customer='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',chefUser='00000000-0000-0000-0000-000000000003',admin='00000000-0000-0000-0000-000000000004';
await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,'customer@example.test','{"username":"customer","role":"admin"}'),($2,'other@example.test','{"username":"other"}'),($3,'chef@example.test','{"username":"chef","account_type":"chef"}'),($4,'admin@example.test','{"username":"staff"}')`,[customer,other,chefUser,admin]);
assert.equal((await db.query('select role from chefos_profiles where id=$1',[customer])).rows[0].role,'customer');
await db.exec(`insert into auth.users(id,email,phone,raw_user_meta_data) values('00000000-0000-0000-0000-000000000005','','919999999999','{"role":"admin"}')`);
const phoneProfile=(await db.query(`select * from chefos_profiles where id='00000000-0000-0000-0000-000000000005'`)).rows[0];
assert.equal(phoneProfile.role,'customer');assert.equal(phoneProfile.phone,'919999999999');assert(phoneProfile.username.length>0);
await db.exec(`delete from auth.users where id='00000000-0000-0000-0000-000000000005'`);
await db.query(`update chefos_profiles set role='admin' where id=$1`,[admin]);
const chef=(await db.query(`update chefos_chefs set is_verified=true,is_available=true where user_id=$1 returning id`,[chefUser])).rows[0].id;
async function actor(id,fn){await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);try{return await fn()}finally{await db.exec('reset role')}}
const rpc=async(name,args=[],values=[])=> (await db.query(`select ${name}(${args.join(',')}) as result`,values)).rows[0].result;
const diet={age:30,height_cm:175,weight_kg:70,activity_level:'moderate',goal:'healthy_eating',diet:'vegetarian',cuisines:['south_indian'],allergens:[],other_restrictions:'',dislikes:'',non_veg_days:[],cheat_meal_day:null,allergies_confirmed:true,personalisation_consent:true};
await actor(customer,async()=>{
 assert.equal((await rpc('chefos_diet_profile')).ready,false);
 await assert.rejects(()=>rpc('chefos_diet_profile',['$1','0'],[{...diet,personalisation_consent:false}]),/consent/i);
 await assert.rejects(()=>rpc('chefos_diet_profile',['$1','0'],[{...diet,weight_kg:0}]),/weight/i);
 await assert.rejects(()=>rpc('chefos_diet_profile',['$1','0'],[{...diet,age:null}]),/age/i);
 await assert.rejects(()=>rpc('chefos_diet_profile',['$1','0'],[{...diet,user_id:other}]),/Unsupported/i);
 await assert.rejects(()=>rpc('chefos_diet_profile',['$1','0'],[{...diet,allergens:['unknown']}]),/allergen/i);
 await assert.rejects(()=>rpc('chefos_diet_profile',['$1','0'],[{...diet,cuisines:['south_indian','south_indian']}]),/Duplicate/i);
 await assert.rejects(()=>rpc('chefos_diet_profile',['$1','0'],[{...diet,non_veg_days:[1]}]),/Vegetarian/i);
 const saved=await rpc('chefos_diet_profile',['$1','0'],[diet]);
 assert.equal(Number(saved.bmi),22.9);assert.equal(saved.revision,1);assert.equal(saved.review_required,false);
 await assert.rejects(()=>rpc('chefos_diet_profile',['$1','0'],[diet]),/changed elsewhere/i);
 const next=await rpc('chefos_diet_profile',['$1','1'],[{...diet,allergens:['milk']}]);
 assert.equal(next.review_required,true);assert.equal(next.revision,2);
 await assert.rejects(()=>db.query('select * from chefos_private.diet_profiles'),/permission denied/i);
});
await assert.rejects(()=>rpc('chefos_server_prepare_order',['$1','$2'],[other,{schedule_version:2}]),/Complete your food/i);
await actor(other,async()=>{
 assert.equal((await rpc('chefos_diet_profile')).ready,false);
 await rpc('chefos_diet_profile',['$1','0'],[diet]);
});
await actor(chefUser,()=>assert.rejects(()=>rpc('chefos_diet_profile'),/Customer account required/i));
await actor(admin,()=>assert.rejects(()=>rpc('chefos_diet_profile'),/Customer account required/i));
await actor(customer,async()=>{
 await rpc('chefos_complete_profile',["'Customer Name'","'Bengaluru'"]);
 await assert.rejects(()=>rpc('chefos_complete_profile',["''","'Bengaluru'"]),/name and city/i);
 await assert.rejects(()=>rpc('chefos_ops_data',["'overview'"]),/Administrator|admin/i);
 await assert.rejects(()=>db.exec(`update chefos_profiles set role='admin' where id='${customer}'`),/permission denied/i);
 await assert.rejects(()=>db.exec('select * from chefos_private.payments'),/permission denied/i);
 assert.equal((await db.query('select count(*)::int n from chefos_profiles')).rows[0].n,1);
 await assert.rejects(()=>rpc('chefos_server_prepare_order',['$1','$2'],[customer,{}]),/permission denied/i);
});
assert.equal((await db.query('select full_name from chefos_profiles where id=$1',[customer])).rows[0].full_name,'Customer Name');
assert.equal((await db.query('select full_name from chefos_profiles where id=$1',[other])).rows[0].full_name,'');
const catalog=await rpc('chefos_pricing_catalog');
const config=JSON.parse(await readFile(new URL('../../chefos_pricing_config.json',import.meta.url),'utf8'));
let referenceChecks=0;
for(const band of catalog.households){
 const expected=config.reference_tables_base_chef.by_household_band[band.id];
 for(const cycle of ['weekly','monthly','quarterly'])for(const n of [1,2,3]){
  const key=n===1?'1_meal_per_day':`MEAL${n}_per_meal`;
  assert.equal(band.plans[cycle][n].per_meal_inr,expected.plans[cycle][key]);referenceChecks++;
  assert(!JSON.stringify(band.plans[cycle][n]).includes('chef_payout'));
 }
 for(const n of [1,2]){
  const quote=await rpc('chefos_private.quote_rate',['null','$1',"'instant'",'$2'],[config.household_size.bands.find(x=>x.id===band.id).min,n]);
  assert.equal(quote.price_inr,expected.instant[n===1?'1_meal':'2_meals'].customer_price);
  assert.equal(quote.chef_payout_total,expected.instant[n===1?'1_meal':'2_meals'].chef_earns);referenceChecks++;
 }
}
assert.equal(referenceChecks,44);
await db.query('insert into chefos_private.chef_locations(chef_id,latitude,longitude) values($1,12.97,77.59)',[chef]);
await actor(customer,async()=>{
 const map=await rpc('chefos_discovery_map',['12.97','77.59','5']);
 assert.equal(map.chefs.length,1);assert.equal(map.chefs[0].id,chef);
 assert.equal(map.chefs[0].latitude,12.97);
 assert.equal(JSON.stringify(map).includes('otp_code'),false);
 assert.equal((await rpc('chefos_discovery_map',['0','0','5'])).chefs.length,0);
 await assert.rejects(()=>rpc('chefos_discovery_map',['91','77','5']),/valid map location/i);
 await assert.rejects(()=>rpc('chefos_discovery_map',['12','null','5']),/valid map location/i);
});
await db.exec('set role anon');
await assert.rejects(()=>rpc('chefos_discovery_map'),/permission denied/i);
await db.exec('reset role');
await actor(other,()=>rpc('chefos_mobile_action',["'preference.save'",`'{"people_count":8}'`]));
// Historical October fixtures are inserted only as the database owner. Public
// callers must upgrade; these fixtures test captured-order recovery/isolation.
async function historical(id,fn){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);try{return await fn()}finally{await db.query("select set_config('request.jwt.claim.sub','',false)")}}
await actor(other,()=>assert.rejects(()=>rpc('chefos_mobile_action',["'instant.create'",`'{"latitude":12.97,"longitude":77.59,"meal":"lunch","wave":"L1"}'`]),/Upgrade/i));
const instant=await historical(other,()=>rpc('chefos_private.chefos_mobile_legacy',["'instant.create'",`'{"latitude":12.97,"longitude":77.59,"meal":"lunch","wave":"L1"}'`]));
await actor(chefUser,async()=>{
 assert.equal((await rpc('chefos_mobile_action',["'partner.me'"])).pending_instant_offers.length,1);
});
await historical(chefUser,()=>rpc('chefos_private.chefos_mobile_legacy',["'instant.respond'",'$1'],[{request_id:instant.id,action:'accept'}]));
await actor(chefUser,()=>assert.rejects(()=>rpc('chefos_mobile_action',["'instant.respond'",'$1'],[{request_id:instant.id,action:'accept'}]),/Upgrade/i));
assert.equal((await db.query('select quote from chefos_private.instant_details where request_id=$1',[instant.id])).rows[0].quote.people_count,8);
const service=(await db.query('select id from chefos_private.service_sessions where instant_request_id=$1',[instant.id])).rows[0].id;
await actor(chefUser,async()=>{
 await assert.rejects(()=>rpc('chefos_service_action',['$1',"'start.request'"],[service]),/legacy service.*verified visit/i);
 assert(!JSON.stringify(await rpc('chefos_mobile_action',["'partner.me'"])).includes('otp_code'));
});
assert.equal((await db.query('select otp_attempts from chefos_private.service_sessions where id=$1',[service])).rows[0].otp_attempts,0);
await actor(customer,async()=>{assert.equal((await rpc('chefos_mobile_action',["'service.my'"])).service_otps.length,0)});
await actor(customer,async()=>{await assert.rejects(()=>rpc('chefos_save_menu',["'{}'"]),/seven dishes/i)});
await actor(admin,async()=>{assert.equal((await rpc('chefos_ops_data',["'overview'"])).customers,2)});
const booking={chef,meal_type:['lunch'],people_count:3,plan_cycle:'monthly',meal_wave:{lunch:'L2'},start_date:(await db.query("select (now() at time zone 'Asia/Kolkata')::date::text as day")).rows[0].day};
await assert.rejects(()=>rpc('chefos_server_prepare_order',['$1','$2'],[customer,booking]),/Upgrade/i);
const prepared=await rpc('chefos_private.chefos_prepare_subscription',['$1','$2'],[customer,booking]);
await rpc('chefos_server_record_order',['$1','$2','$3'],[customer,'order_test',prepared]);
await actor(customer,async()=>{await assert.rejects(()=>rpc('chefos_activate_order',["'order_test'"]),/captured payment/i)});
await rpc('chefos_server_capture',['$1','$2','$3','$4'],['order_test','pay_test',prepared.quote.amount_paise,'INR']);
await actor(other,async()=>{await assert.rejects(()=>rpc('chefos_activate_order',["'order_test'"]),/captured payment/i)});
const subscription=await actor(customer,()=>rpc('chefos_activate_order',["'order_test'"]));
await actor(customer,async()=>{
 assert.equal((await rpc('chefos_activate_order',["'order_test'"])).id,subscription.id);
 assert.equal(JSON.stringify(subscription).includes('chef_payout'),false);
 assert.equal((await rpc('chefos_price_quote',['$1','3',"'monthly'",'1'],[chef])).price_locked,true);
 await assert.rejects(()=>rpc('chefos_mobile_action',["'preference.save'",`'{"people_count":8}'`]),/renewal/i);
 assert.equal((await rpc('chefos_mobile_action',["'menu.today'"])).service_otps.length,1);
});
await actor(chefUser,async()=>{assert.equal((await rpc('chefos_mobile_action',["'partner.me'"])).service_sessions.length,2)});
await actor(admin,async()=>{
 for(const section of ['customers','chefs','subscriptions','payments','pricing','activity'])assert(await rpc('chefos_ops_data',['$1'],[section]));
 await rpc('chefos_ops_update',["'chef_rates'",'$1',`'{"subscriber_ratings":100,"tenure_months":12,"meals_served":1000,"certified_specialty":true}'`],[chef]);
});
await actor(customer,async()=>{assert.equal((await rpc('chefos_price_quote',['$1','3',"'monthly'",'1'],[chef])).price_inr,subscription.price)});
await db.query('update chefos_chefs set rating=5 where id=$1',[chef]);
await db.query(`update chefos_private.chef_rate_inputs set subscriber_ratings=10000,tenure_months=1000,meals_served=100000,certified_specialty=true where chef_id=$1`,[chef]);
assert.equal((await rpc('chefos_private.quote_rate',['$1','3',"'monthly'",'1'],[chef])).chef_payout_per_meal,config.chef_rate_card.payout_cap_per_meal);
await db.query('update chefos_private.chef_rate_inputs set pilot_rate=120,pilot_started_at=current_date where chef_id=$1',[chef]);
const pilot=await rpc('chefos_private.quote_rate',['$1','3',"'monthly'",'3'],[chef]);
assert.equal(pilot.pilot_cook_rate,true);assert.equal(pilot.chef_payout_per_meal,120);assert.equal(pilot.coupon_code,'');assert.equal(pilot.per_meal_inr,140);
await db.query('update chefos_private.chef_rate_inputs set pilot_started_at=current_date-365 where chef_id=$1',[chef]);
assert.equal((await rpc('chefos_private.quote_rate',['$1','3',"'monthly'",'1'],[chef])).pilot_cook_rate,false);
await actor(admin,()=>rpc('chefos_ops_update',["'subscriptions'",'$1',`'{"is_active":false}'`],[subscription.id]));
const tomorrow=(await db.query("select ((now() at time zone 'Asia/Kolkata')::date+1)::text as day")).rows[0].day;
const second=await rpc('chefos_private.chefos_prepare_subscription',['$1','$2'],[other,{...booking,start_date:tomorrow}]);
await rpc('chefos_server_record_order',['$1',"'order_other'",'$2'],[other,second]);
await rpc('chefos_server_capture',["'order_other'","'pay_other'",'$1',"'INR'"],[second.quote.amount_paise]);
await actor(other,()=>rpc('chefos_activate_order',["'order_other'"]));
await actor(admin,()=>assert.rejects(()=>rpc('chefos_ops_update',["'subscriptions'",'$1',`'{"is_active":true}'`],[subscription.id]),/another active plan/i));
await db.query('update chefos_profiles set is_active=false where id=$1',[customer]);
await actor(customer,async()=>{
 assert.equal((await db.query('select count(*)::int n from chefos_subscriptions')).rows[0].n,0);
 await assert.rejects(()=>rpc('chefos_mobile_action',["'menu.today'"]),/active Chefos/i);
});
console.log('PASS: 44 pricing reference entries; signup permissions; RLS isolation; all staff sections; instant offer acceptance; customer-specific household pricing; OTP privacy and attempts; payment verification; ownership; replay idempotency; locked paid quotes after rate changes; payout caps; pilot floor/expiry; paused slot conflicts; suspended access');
if(process.env.CHEFOS_TEST_FIXTURES){
 const fixtures={};await actor(admin,async()=>{for(const section of ['overview','customers','chefs','subscriptions','payments','pricing','activity'])fixtures[section]=await rpc('chefos_ops_data',['$1'],[section])});
 await writeFile(process.env.CHEFOS_TEST_FIXTURES,JSON.stringify(fixtures,null,2));
}
await testVisits(db,actor,rpc,admin,diet);
await testSessionSafety(db,actor,rpc,admin,diet);
await testInstantVisits(db,actor,rpc,admin);
await testTestEnvironment(db,actor,rpc);
await db.close();
