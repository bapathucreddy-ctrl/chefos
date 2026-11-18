import assert from 'node:assert/strict';
import { menuPreview } from './menu-fixtures.mjs';
import { testMenuJobs } from './test-menu-jobs.mjs';
export async function testVisits(db,actor,rpc,admin,diet){
 const customer='00000000-0000-0000-0000-000000000011',other='00000000-0000-0000-0000-000000000012',partner='00000000-0000-0000-0000-000000000013';
 await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,'visits@example.test','{"username":"visit-customer"}'),($2,'visits2@example.test','{"username":"visit-other"}'),($3,'visits-chef@example.test','{"username":"visit-chef","account_type":"chef"}')`,[customer,other,partner]);
 const chef=(await db.query('update chefos_chefs set is_verified=true,is_available=true where user_id=$1 returning id',[partner])).rows[0].id;
 const day=(await db.query("select ((now() at time zone 'Asia/Kolkata')::date+1)::text d")).rows[0].d;
 const building=await actor(admin,()=>rpc('chefos_ops_building',["'Test Tower'",'12.97','77.59',"'test-community-code'"]));
 await actor(partner,()=>rpc('chefos_mobile_action',["'partner.location'",'$1'],[{latitude:12.97,longitude:77.59}]));
 for(const id of [customer,other]) await actor(id,async()=>{
  await rpc('chefos_diet_profile',['$1','0'],[diet]);
  const wrong=await rpc('chefos_household',['$1'],[{building_id:building.id,flat:'101',code:'wrong'}]);assert.equal(wrong.error,true);
  const home=await rpc('chefos_household',['$1'],[{building_id:building.id,flat:id===customer?'101':'102',code:'test-community-code'}]);assert.equal(home.household.verified,true);
  assert(!JSON.stringify(home).includes('code_hash'));
  await assert.rejects(()=>rpc('chefos_partner_schedule'),/Chef account/i);
 });
 await actor(partner,async()=>{
  const schedule=await rpc('chefos_partner_schedule');assert.equal(schedule.slots.length,63);
  assert.deepEqual(schedule.slots.filter(s=>s.weekday===0&&s.meal==='breakfast').map(s=>s.start_minute),[360,480,600]);
  await assert.rejects(()=>rpc('chefos_household'),/Customer account/i);
 });
 const booking={schedule_version:2,chef,meal_type:['breakfast','lunch'],people_count:3,plan_cycle:'weekly',start_date:day,visits:[{meals:['breakfast','lunch'],start_minute:360}]};
 await assert.rejects(()=>rpc('chefos_server_prepare_order',['$1','$2'],[customer,booking]),/Preview.*menu/i);
 Object.assign(booking,await menuPreview(actor,rpc,customer,booking));
 const prepared=await rpc('chefos_server_prepare_order',['$1','$2'],[customer,booking]);
 assert.equal(prepared.quote.total_meals,14);assert.equal(prepared.quote.price_inr,2240);
 assert.equal((await rpc('chefos_server_prepare_order',['$1','$2'],[customer,booking])).hold_id,prepared.hold_id);
 const rows=(await db.query('select * from chefos_private.visits where hold_id=$1 order by starts_at',[prepared.hold_id])).rows;
 assert.equal(rows.length,7);assert.equal((new Date(rows[0].ends_at)-new Date(rows[0].starts_at))/3600000,2);
 const otherBooking={...booking,...await menuPreview(actor,rpc,other,booking)};
 await assert.rejects(()=>rpc('chefos_server_prepare_order',['$1','$2'],[other,otherBooking]),/overlaps|travel/i);
 assert.equal((await db.query('select count(*)::int n from chefos_private.booking_holds where user_id=$1',[other])).rows[0].n,0,'failed preparation rolls back its hold');
 const options=await actor(other,()=>rpc('chefos_visit_options',['$1','$2',"'weekly'","array['breakfast']"],[chef,day]));
 assert(!options.some(s=>s.start_minute===480),'8 AM conflicts with the two-hour visit plus travel');
 assert(options.some(s=>s.start_minute===600));
 await actor(partner,async()=>{
  const schedule=await rpc('chefos_partner_schedule');
  const weekday=(new Date(day+'T00:00:00Z').getUTCDay()+6)%7;
  const slot=schedule.slots.find(s=>s.weekday===weekday&&s.start_minute===360);
  await assert.rejects(()=>rpc('chefos_partner_schedule',["'remove'",'$1'],[{slot_id:slot.id}]),/booking|hold/i);
  await assert.rejects(()=>rpc('chefos_partner_schedule',["'leave'",'$1'],[{date:day}]),/reassigned/i);
 });
 await rpc('chefos_server_record_order',['$1',"'order_v2'",'$2'],[customer,prepared]);
 const reused=await rpc('chefos_server_record_order',['$1',"'order_unused'",'$2'],[customer,prepared]);assert.equal(reused.order_id,'order_v2');
 await actor(other,()=>assert.rejects(()=>rpc('chefos_activate_order',["'order_v2'"]),/captured payment/i));
 await rpc('chefos_server_capture',["'order_v2'","'pay_v2'",'$1',"'INR'"],[prepared.quote.amount_paise]);
 const sub=await actor(customer,()=>rpc('chefos_activate_order',["'order_v2'"]));assert.equal(sub.schedule_version,2);
 assert.equal((await actor(customer,()=>rpc('chefos_activate_order',["'order_v2'"]))).id,sub.id);
 assert.equal((await db.query('select count(*)::int n from chefos_private.service_sessions where subscription_id=$1',[sub.id])).rows[0].n,7,'one combined session per day, not two independent sessions');
 await actor(partner,()=>rpc('chefos_mobile_action',["'partner.me'"]));
 assert.equal((await db.query('select count(*)::int n from chefos_private.service_sessions where subscription_id=$1',[sub.id])).rows[0].n,7,'legacy lazy materialization must not duplicate combined visits');
 await actor(customer,()=>assert.rejects(()=>rpc('chefos_household',['$1'],[{building_id:building.id,flat:'103',code:'test-community-code'}]),/locked/i));
 // 08:30 is available only after this chef explicitly confirms 30 minutes in
 // this verified building on this date. It remains unavailable on other days.
 const first=rows[0],starts=new Date(new Date(first.ends_at).getTime()+30*60000).toISOString(),ends=new Date(new Date(first.ends_at).getTime()+90*60000).toISOString();
 assert.equal(await rpc('chefos_private.capacity_conflict',['$1','$2','$3','$4'],[chef,starts,ends,building.id]),true);
 await actor(partner,()=>rpc('chefos_partner_schedule',["'confirm_gap'",'$1'],[{date:day,building_id:building.id}]));
 assert.equal(await rpc('chefos_private.capacity_conflict',['$1','$2','$3','$4'],[chef,starts,ends,building.id]),false);
 assert.equal(await rpc('chefos_private.capacity_conflict',['$1','$2','$3','null'],[chef,starts,ends]),true);
 // A hold may expire while the provider captures a payment. A conflicting new
 // hold must win its reservation; the late capture cannot double-book it.
 const later={...booking,meal_type:['dinner'],visits:[{meals:['dinner'],start_minute:1080}]};
 Object.assign(later,await menuPreview(actor,rpc,other,later));
 const late=await rpc('chefos_server_prepare_order',['$1','$2'],[other,later]);
 await rpc('chefos_server_record_order',['$1',"'order_latev2'",'$2'],[other,late]);
 await db.query("update chefos_private.booking_holds set expires_at=now()-interval '1 minute' where id=$1",[late.hold_id]);
 const third='00000000-0000-0000-0000-000000000014';
 await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,'third@example.test','{"username":"visit-third"}')`,[third]);
 await actor(third,async()=>{await rpc('chefos_diet_profile',['$1','0'],[diet]);await rpc('chefos_household',['$1'],[{building_id:building.id,flat:'104',code:'test-community-code'}]);});
 const thirdBooking={...later,...await menuPreview(actor,rpc,third,later)};
 await rpc('chefos_server_prepare_order',['$1','$2'],[third,thirdBooking]);
 await rpc('chefos_server_capture',["'order_latev2'","'pay_latev2'",'$1',"'INR'"],[late.quote.amount_paise]);
 await actor(other,()=>assert.rejects(()=>rpc('chefos_activate_order',["'order_latev2'"]),/during payment|overlap/i));
 assert.equal((await db.query("select subscription_id from chefos_private.payments where order_id='order_latev2'")).rows[0].subscription_id,null);
 await testMenuJobs(db,actor,rpc,{customer,other,partner,sub,booking,day,diet});
 console.log('PASS: verified households; 63 default starts; combined two-hour visits; seven-day holds; overlap rollback; atomic activation/replay; legacy isolation; booked-slot/leave protection; chef-confirmed building gaps; late-capture conflict');
}
