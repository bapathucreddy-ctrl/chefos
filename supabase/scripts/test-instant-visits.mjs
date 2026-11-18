import assert from 'node:assert/strict';
export async function testInstantVisits(db,actor,rpc,admin){
 const customer='00000000-0000-0000-0000-000000000031',chefUser='00000000-0000-0000-0000-000000000032',other='00000000-0000-0000-0000-000000000033';
 await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,'instant-v2@example.test','{"username":"instant-v2"}'),($2,'instant-chef-v2@example.test','{"username":"instant-chef-v2","account_type":"chef"}'),($3,'instant-other@example.test','{"username":"instant-other"}')`,[customer,chefUser,other]);
 const chef=(await db.query("update chefos_chefs set is_verified=true,is_available=true,cuisines=array['south_indian'] where user_id=$1 returning id",[chefUser])).rows[0].id;
 const building=await actor(admin,()=>rpc('chefos_ops_building',["'Instant Tower'",'15','78',"'instant-community-code'"]));
 await actor(customer,()=>rpc('chefos_household',['$1'],[{building_id:building.id,flat:'301',code:'instant-community-code'}]));
 await actor(chefUser,()=>rpc('chefos_mobile_action',["'partner.location'",'$1'],[{latitude:15,longitude:78}]));
 // Exercise acceptance/payment at any test-run hour. Only the opening-hours
 // branch is disabled in this disposable DB; radius/capacity/leave stay real.
 const original=(await db.query("select pg_get_functiondef('chefos_private.instant_available(uuid,uuid,text[],uuid)'::regprocedure) d")).rows[0].d;
 const testDefinition=original.replace("if (start_at at time zone 'Asia/Kolkata')::time<'06:00' or (finish at time zone 'Asia/Kolkata')::date<>current_date\n  or (finish at time zone 'Asia/Kolkata')::time>'23:00' then return false; end if;",'');
 assert.notEqual(original,testDefinition);await db.exec(testDefinition);
 const input={cuisine:'south_indian',people_count:3,meals:['breakfast','lunch'],chef,food_notes:'Vegetarian. No known allergies.',allergies_confirmed:true};
 const action=(who,name,data={})=>actor(who,()=>rpc('chefos_instant',['$1','$2'],[name,data]));
 const list=await action(customer,'available',input);assert(list.chefs.some(c=>c.id===chef));
 assert(!(await action(customer,'available',{...input,cuisine:'asian'})).chefs.some(c=>c.id===chef));
 const request=await action(customer,'create',input);assert.equal(request.status,'searching');
 await assert.rejects(()=>rpc('chefos_server_prepare_order',['$1','$2'],[customer,{instant_request_id:request.id}]),/acceptance/i);
 await assert.rejects(()=>action(other,'respond',{request_id:request.id,action:'accept'}),/Verified chef/i);
 await action(chefUser,'respond',{request_id:request.id,action:'accept'});
 assert.equal((await db.query('select count(*)::int n from chefos_private.service_sessions where instant_request_id=$1',[request.id])).rows[0].n,0,'no cooking session before payment');
 assert.equal((await action(customer,'get')).status,'accepted');assert.equal(await action(other,'get'),null);
 const prepared=await rpc('chefos_server_prepare_order',['$1','$2'],[customer,{instant_request_id:request.id,people_count:1}]);
 assert.equal(prepared.booking.people_count,3);assert.equal(prepared.quote.meal_count,2);
 const saved=await rpc('chefos_server_record_order',['$1',"'order_instantv2'",'$2'],[customer,prepared]);
 await actor(customer,()=>assert.rejects(()=>rpc('chefos_activate_order',["'order_instantv2'"]),/captured payment/i));
 await rpc('chefos_server_capture',["'order_instantv2'","'pay_instantv2'",'$1',"'INR'"],[saved.amount]);
 const paid=await actor(customer,()=>rpc('chefos_activate_order',["'order_instantv2'"]));
 assert.equal((await actor(customer,()=>rpc('chefos_activate_order',["'order_instantv2'"]))).session_id,paid.session_id);
 assert.equal((await db.query('select count(*)::int n from chefos_subscriptions where user_id=$1',[customer])).rows[0].n,0,'instant is not a subscription');
 const dish=(who,action,data={})=>actor(who,()=>rpc('chefos_arrival_menu',['$1','$2','$3'],[paid.session_id,action,data]));
 await assert.rejects(()=>dish(other,'get'),/not assigned/i);
 const recipe={title:'Vegetable dosa',servings:3,cooking_minutes:45,ingredients:['Dosa batter 500 g','Vegetables 200 g'],steps:['Prepare the batter','Cook the dosa thoroughly'],storage_notes:'Serve fresh'};
 await assert.rejects(()=>dish(chefUser,'save',{version:0,recipes:{breakfast:recipe,lunch:recipe},restrictions_reviewed:true}),/after chef arrival/i);
 await actor(chefUser,()=>rpc('chefos_session_evidence',['$1',"'arrived'",'$2'],[paid.session_id,{latitude:15,longitude:78}]));
 await assert.rejects(()=>dish(customer,'save',{version:0}),/assigned chef/i);
 const menu=await dish(chefUser,'save',{version:0,recipes:{breakfast:recipe,lunch:recipe},restrictions_reviewed:true});assert.equal(menu.version,1);
 await assert.rejects(()=>rpc('chefos_private.session_menu',['$1'],[paid.session_id]),/confirmation/i);
 await assert.rejects(()=>dish(customer,'accept',{version:0}),/changed/i);
 await dish(customer,'accept',{version:1});
 assert.equal((await rpc('chefos_private.session_menu',['$1'],[paid.session_id])).source,'arrival_agreement');
 await dish(chefUser,'save',{version:1,recipes:{breakfast:recipe,lunch:{...recipe,title:'Vegetable rice'}},restrictions_reviewed:true});
 await assert.rejects(()=>rpc('chefos_private.session_menu',['$1'],[paid.session_id]),/confirmation/i);
 await dish(customer,'accept',{version:2});
 const sessions=await actor(chefUser,()=>rpc('chefos_sessions'));assert(sessions.rows.some(r=>r.instant_request_id===request.id));assert(!JSON.stringify(sessions).includes('otp_code'));
 assert.equal((await action(customer,'get')).paid,true);
 // Chef acceptance held two cooking hours, and the real booking prevents reuse.
 assert(!(await action(customer,'available',input)).chefs.some(c=>c.id===chef));
 await db.exec(original);
 console.log('PASS: targeted cuisine/radius matching; accept-before-pay; two-hour instant capacity; canonical locked price; capture-only activation/replay; no fake subscription; arrival dish agreement/customer confirmation/version invalidation');
}
