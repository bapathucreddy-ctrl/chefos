import assert from 'node:assert/strict';
import { menuPreview } from './menu-fixtures.mjs';
import { testSelfieIdentity } from './test-selfie-identity.mjs';
export async function testSessionSafety(db,actor,rpc,admin,diet){
 const customer='00000000-0000-0000-0000-000000000021',chefUser='00000000-0000-0000-0000-000000000022',other='00000000-0000-0000-0000-000000000023';
 await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,'safety@example.test','{"username":"safety-user"}'),($2,'safety-chef@example.test','{"username":"safety-chef","account_type":"chef"}'),($3,'safety-other@example.test','{"username":"safety-other"}')`,[customer,chefUser,other]);
 const chef=(await db.query('update chefos_chefs set is_verified=true,is_available=true where user_id=$1 returning id',[chefUser])).rows[0].id;
 const building=await actor(admin,()=>rpc('chefos_ops_building',["'Safety Tower'",'15','78',"'safe-community-code'"]));
 await actor(customer,async()=>{await rpc('chefos_diet_profile',['$1','0'],[diet]);await rpc('chefos_household',['$1'],[{building_id:building.id,flat:'201',code:'safe-community-code'}]);});
 const today=(await db.query("select (now() at time zone 'Asia/Kolkata')::date::text d")).rows[0].d;
 const preview=await menuPreview(actor,rpc,customer,{start_date:today,meal_type:['lunch'],people_count:3});
 const quote=await rpc('chefos_private.quote_rate',['$1','3',"'weekly'",'1'],[chef]);
 // Synthetic already-paid arrival fixture. Production clients cannot insert
 // any of these private records or claim that a provider payment was captured.
 const sub=(await db.query(`insert into public.chefos_subscriptions(user_id,chef_id,meal_type,meal_wave,people_count,plan_cycle,start_date,end_date,price,pricing,schedule_version)
 values($1,$2,array['lunch'],'{"lunch":"V2"}',3,'weekly',$3::date,$3::date+6,$4,$5,2) returning id`,[customer,chef,today,quote.price_inr,quote])).rows[0].id;
 const hold=(await db.query(`insert into chefos_private.booking_holds(user_id,chef_id,booking,quote) values($1,$2,$3,$4) returning id`,[customer,chef,{chef,menu_id:preview.menu_id,menu_version:1,start_date:today,meal_type:['lunch']},quote])).rows[0].id;
 await rpc('chefos_server_record_order',['$1',"'order_safety'",'$2'],[customer,{hold_id:hold}]);
 await rpc('chefos_server_capture',["'order_safety'","'pay_safety'",'$1',"'INR'"],[quote.amount_paise]);
 await db.query('update chefos_private.payments set subscription_id=$1 where order_id=$2',[sub,'order_safety']);
 await db.query("update chefos_private.booking_holds set subscription_id=$1,status='confirmed' where id=$2",[sub,hold]);
 const visit=(await db.query(`insert into chefos_private.visits(hold_id,chef_id,user_id,building_id,flat,starts_at,ends_at,meals,state)
 values($1,$2,$3,$4,'201',now(),now()+interval '1 hour',array['lunch'],'confirmed') returning id`,[hold,chef,customer,building.id])).rows[0].id;
 const session=(await db.query(`insert into chefos_private.service_sessions(user_id,chef_id,subscription_id,service_date,meal,wave,visit_id,meal_types)
 values($1,$2,$3,$4,'lunch','V2',$5,array['lunch']) returning id`,[customer,chef,sub,today,visit])).rows[0].id;
 const evidence=(who,action,data={})=>actor(who,()=>rpc('chefos_session_evidence',['$1','$2','$3'],[session,action,data]));
 await assert.rejects(()=>evidence(other,'get'),/not assigned/i);
 await assert.rejects(()=>evidence(chefUser,'customer_consent',{consent:true}),/Only this customer/i);
 await assert.rejects(()=>evidence(customer,'chef_consent',{consent:true}),/Assigned chef/i);
 await actor(chefUser,()=>assert.rejects(()=>rpc('chefos_service_action',['$1',"'start.request'"],[session]),/consents|hygiene/i));
 await assert.rejects(()=>evidence(chefUser,'arrived',{latitude:16,longitude:78}),/must be at/i);
 await evidence(chefUser,'arrived',{latitude:15,longitude:78});
 await evidence(customer,'customer_consent',{consent:true});await evidence(chefUser,'chef_consent',{consent:true});
 await assert.rejects(()=>evidence(chefUser,'hygiene',{hand_wash:true,gloves:true,apron:true,cap:true}),/recording/i);
 await assert.rejects(()=>evidence(chefUser,'capture_begin'),/face/i);
 await testSelfieIdentity(db,actor,rpc,chefUser,chef,customer,session,admin);
 await actor(chefUser,()=>assert.rejects(()=>rpc('chefos_server_face',['$1','$2',"'begin'"],[chefUser,session]),/permission denied/i));
 await actor(admin,()=>rpc('chefos_ops_identity',['$1',"'enrolled-chef-safety'"],[chef]));
 const challenge=await rpc('chefos_server_face',['$1','$2',"'begin'"],[chefUser,session]);
 await rpc('chefos_server_face',['$1','$2',"'provider_session'",'$3'],[chefUser,session,{challenge_id:challenge.challenge_id,provider_session:'face-safety'}]);
 await assert.rejects(()=>rpc('chefos_server_face_result',['$1'],[{challenge_id:challenge.challenge_id,provider_session:'wrong',enrollment_reference:'enrolled-chef-safety',event_id:'face-event',match:true,liveness:true}]),/mismatch/i);
 const event={challenge_id:challenge.challenge_id,provider_session:'face-safety',enrollment_reference:'enrolled-chef-safety',event_id:'face-event',match:true,liveness:true};
 await rpc('chefos_server_face_result',['$1'],[event]);await rpc('chefos_server_face_result',['$1'],[event]);
 const capture=await evidence(chefUser,'capture_begin');assert(capture.capture_token);
 await actor(chefUser,()=>assert.rejects(()=>rpc('chefos_service_action',['$1',"'start.request'"],[session]),/hygiene/i));
 await evidence(chefUser,'hygiene',{hand_wash:true,gloves:true,apron:true,cap:true});
 await actor(chefUser,()=>assert.rejects(()=>rpc('chefos_service_action',['$1',"'start.request'"],[session]),/recording/i));
 async function uploadProof(token){
  const times=(await db.query("select now() as start,now()+interval '5 seconds' as finish,gen_random_uuid() as id")).rows[0];
  const ticket=await rpc('chefos_server_recording',['$1',"'ticket'",'$2'],[chefUser,{id:times.id,capture_token:token,started_at:times.start,ended_at:times.finish,bytes:1000}]);
  await rpc('chefos_server_recording',['$1',"'confirm'",'$2'],[chefUser,{id:ticket.id,actual_bytes:1000}]);return ticket;
 }
 const clip=await uploadProof(capture.capture_token);
 const state=await evidence(customer,'get');assert.equal(state.recording_active,true);assert(!Object.hasOwn(state,'capture_token'));assert(!JSON.stringify(state).includes('weight_kg'));
 await actor(chefUser,()=>rpc('chefos_service_action',['$1',"'start.request'"],[session]));
 const code=(await db.query('select otp_code from chefos_private.service_sessions where id=$1',[session])).rows[0].otp_code;
 const wrong=await actor(chefUser,()=>rpc('chefos_service_action',['$1',"'start.verify'","'wrong'"],[session]));assert.equal(wrong.error,true);
 assert.equal((await db.query('select otp_attempts from chefos_private.service_sessions where id=$1',[session])).rows[0].otp_attempts,1);
 assert(!JSON.stringify(await actor(chefUser,()=>rpc('chefos_mobile_action',["'partner.me'"]))).includes(code));
 const ownCodes=await actor(customer,()=>rpc('chefos_mobile_action',["'service.my'"]));assert.equal(ownCodes.service_otps.find(s=>s.service_session_id===session).start_otp,code);
 await actor(chefUser,()=>rpc('chefos_service_action',['$1',"'start.verify'",'$2'],[session,code]));
 const snapshot=(await db.query('select recipe_snapshot from chefos_private.service_sessions where id=$1',[session])).rows[0].recipe_snapshot;assert(snapshot.recipes.lunch);
 await evidence(chefUser,'capture_end',{capture_token:capture.capture_token});
 assert.equal((await evidence(chefUser,'get')).status,'paused');
 await actor(chefUser,()=>assert.rejects(()=>rpc('chefos_service_action',['$1',"'end.request'"],[session]),/recording/i));
 const resumed=await evidence(chefUser,'capture_begin');await uploadProof(resumed.capture_token);
 await actor(chefUser,()=>rpc('chefos_service_action',['$1',"'start.request'"],[session]));
 const resumeCode=(await db.query('select otp_code from chefos_private.service_sessions where id=$1',[session])).rows[0].otp_code;
 await actor(chefUser,()=>rpc('chefos_service_action',['$1',"'start.verify'",'$2'],[session,resumeCode]));
 await actor(chefUser,()=>rpc('chefos_service_action',['$1',"'end.request'"],[session]));
 const endCode=(await db.query('select otp_code from chefos_private.service_sessions where id=$1',[session])).rows[0].otp_code;
 await actor(chefUser,()=>rpc('chefos_service_action',['$1',"'end.verify'",'$2'],[session,endCode]));
 assert.equal((await db.query('select state from chefos_private.visits where id=$1',[visit])).rows[0].state,'completed');
 await assert.rejects(()=>rpc('chefos_server_recording',['$1',"'view'",'$2'],[other,{id:clip.id}]),/Only the customer/i);
 await assert.rejects(()=>rpc('chefos_server_recording',['$1',"'view'",'$2'],[admin,{id:clip.id}]),/open dispute/i);
 const complaint=await actor(customer,()=>rpc('chefos_complaint',['$1',"'Please review the hygiene during this session'"],[session]));
 await rpc('chefos_server_recording',['$1',"'view'",'$2'],[admin,{id:clip.id,complaint_id:complaint.id}]);
 await db.query("update chefos_private.recording_segments set expires_at=now()-interval '1 minute' where session_id=$1",[session]);
 assert(!(await rpc('chefos_server_purge_recordings')).some(r=>r.id===clip.id),'open complaints hold footage');
 await actor(admin,()=>rpc('chefos_ops_complaints',['$1',"'Reviewed and resolved with both parties'"],[complaint.id]));
 assert((await rpc('chefos_server_purge_recordings')).some(r=>r.id===clip.id));
 assert((await db.query("select count(*)::int n from chefos_private.audit_log where action='recording.view' and actor=$1",[admin])).rows[0].n>0);
 console.log('PASS: consent/identity/hygiene/recording/payment start gates; face result binding; private upload ownership; OTP privacy; pause/resume; recipe snapshots; audited dispute-only ops viewing; retention holds');
}
