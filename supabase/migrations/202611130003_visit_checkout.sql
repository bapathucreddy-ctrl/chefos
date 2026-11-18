-- Availability is advisory; preparation and activation lock the chef and recheck.
create function chefos_private.visit_options(p_chef uuid,p_day date,p_days integer,p_meals text[],p_building uuid,p_ignore uuid default null)
returns jsonb language plpgsql stable set search_path='' set timezone='Asia/Kolkata' as $$
declare slot record; d date; start_at timestamptz; end_at timestamptz; good boolean; result jsonb:='[]'; first_meal text;
begin
 if p_days not in (1,7,30,90) or p_meals is null or cardinality(p_meals) not between 1 and 3
  or not p_meals <@ array['breakfast','lunch','dinner']::text[]
  or cardinality(p_meals)<>(select count(distinct m) from unnest(p_meals) m) then raise exception 'Choose valid meals and duration'; end if;
 first_meal:=case when 'breakfast'=any(p_meals) then 'breakfast' when 'lunch'=any(p_meals) then 'lunch' else 'dinner' end;
 for slot in select distinct start_minute from chefos_private.chef_slots where chef_id=p_chef and weekday=extract(isodow from p_day)::integer-1 and meal=first_meal and enabled order by start_minute loop
  good:=true;
  for d in select tick::date from generate_series(p_day,p_day+p_days-1,interval '1 day') tick loop
   start_at:=(d+slot.start_minute*interval '1 minute') at time zone 'Asia/Kolkata';
   end_at:=start_at+cardinality(p_meals)*interval '1 hour';
   if start_at<=now() or exists(select 1 from chefos_private.chef_leave where chef_id=p_chef and day=d)
    or not exists(select 1 from chefos_private.chef_slots where chef_id=p_chef and weekday=extract(isodow from d)::integer-1 and meal=first_meal and enabled and start_minute=slot.start_minute and latest_end_minute>=slot.start_minute+60*cardinality(p_meals))
    or chefos_private.capacity_conflict(p_chef,start_at,end_at,p_building,p_ignore) then good:=false; exit; end if;
  end loop;
  if good then result:=result||jsonb_build_array(jsonb_build_object('start_minute',slot.start_minute,'cooking_minutes',cardinality(p_meals)*60,'meals',p_meals)); end if;
 end loop;
 return result;
end $$;
revoke all on function chefos_private.visit_options(uuid,date,integer,text[],uuid,uuid) from public,anon,authenticated,service_role;

create function public.chefos_visit_options(p_chef uuid,p_day date,p_cycle text,p_meals text[]) returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid:=chefos_private.require_actor(); building uuid; duration integer;
begin
 if not exists(select 1 from public.chefos_profiles where id=actor and role='customer') then raise exception 'Customer account required' using errcode='42501'; end if;
 select building_id into building from chefos_private.households where user_id=actor;
 if building is null then raise exception 'Verify your community and flat before booking'; end if;
 if not exists(select 1 from public.chefos_chefs where id=p_chef and is_active and is_available and is_verified) then raise exception 'Chef is unavailable'; end if;
 if not exists(select 1 from chefos_private.chef_locations l join chefos_private.buildings b on b.id=building and b.active where l.chef_id=p_chef and chefos_private.distance_km(l.latitude,l.longitude,b.latitude,b.longitude)<=5) then raise exception 'This chef does not serve your verified community'; end if;
 duration:=case p_cycle when 'weekly' then 7 when 'monthly' then 30 when 'quarterly' then 90 when 'instant' then 1 end;
 if duration is null or p_day is null or p_day<current_date or p_day>current_date+90 then raise exception 'Invalid plan or start date'; end if;
 return chefos_private.visit_options(p_chef,p_day,duration,p_meals,building);
end $$;
revoke all on function public.chefos_visit_options(uuid,date,text,text[]) from public,anon;
grant execute on function public.chefos_visit_options(uuid,date,text,text[]) to authenticated;

create or replace function public.chefos_server_prepare_order(p_actor uuid,p_booking jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare c public.chefos_chefs%rowtype; home chefos_private.households%rowtype; hold chefos_private.booking_holds%rowtype;
 prepared jsonb; quote jsonb; visits jsonb; selection jsonb; v jsonb; options jsonb; booking jsonb;
 meals text[]; all_meals text[]:='{}'; group_meals text[]; first_meal text; cycle text; people integer; n integer; days integer;
 start_on date; d date; starts timestamptz; ends timestamptz; legacy_range tstzrange;
begin
 if not exists(select 1 from public.chefos_profiles where id=p_actor and role='customer' and is_active) then raise exception 'Active customer required' using errcode='42501'; end if;
 perform 1 from public.chefos_profiles where id=p_actor for update;
 if not exists(select 1 from chefos_private.diet_profiles where user_id=p_actor) then raise exception 'Complete your food and health preferences before subscribing'; end if;
 select * into c from public.chefos_chefs where id=(p_booking->>'chef')::uuid and is_verified and is_active and is_available for update;
 if c.id is null then raise exception 'Chef is unavailable'; end if;
 if coalesce((p_booking->>'schedule_version')::integer,1)<>2 then
  -- Compatibility for unchanged chefs; a schedule edit requires the new client.
  if exists(select 1 from chefos_private.audit_log where object_id=c.id::text and action like 'schedule.%') then raise exception 'Update Chefos to use this chef''s current schedule'; end if;
  prepared:=chefos_private.chefos_server_prepare_order(p_actor,p_booking);
  for d in select tick::date from generate_series((prepared#>>'{booking,start_date}')::date,(prepared#>>'{booking,start_date}')::date+(prepared#>>'{quote,days}')::integer-1,interval '1 day') tick loop
   foreach first_meal in array array['breakfast','lunch','dinner'] loop
    if prepared#>'{booking,meal_wave}' ? first_meal then
     legacy_range:=chefos_private.legacy_wave(prepared#>>array['booking','meal_wave',first_meal],d);
     if chefos_private.capacity_conflict(c.id,lower(legacy_range),upper(legacy_range),null,null,false) then raise exception 'This time is reserved by another visit'; end if;
    end if;
   end loop;
  end loop;
  return prepared;
 end if;
 select * into home from chefos_private.households where user_id=p_actor;
 if home.user_id is null then raise exception 'Verify your community and flat before booking'; end if;
 if not exists(select 1 from chefos_private.chef_locations l join chefos_private.buildings b on b.id=home.building_id and b.active where l.chef_id=c.id and chefos_private.distance_km(l.latitude,l.longitude,b.latitude,b.longitude)<=5) then raise exception 'This chef does not serve your verified community'; end if;
 if coalesce(p_booking->>'coupon_code','')<>'' then raise exception 'Promotions require configured eligibility'; end if;
 if exists(select 1 from public.chefos_subscriptions where user_id=p_actor and is_active and end_date>=current_date) then raise exception 'Your paid plan is already active'; end if;
 if jsonb_typeof(p_booking->'meal_type')<>'array' or jsonb_typeof(p_booking->'visits')<>'array' then raise exception 'Select meals and cooking visits'; end if;
 select array_agg(value order by case value when 'breakfast' then 1 when 'lunch' then 2 else 3 end) into meals from jsonb_array_elements_text(p_booking->'meal_type');
 if meals is null or cardinality(meals) not between 1 and 3 or cardinality(meals)<>(select count(distinct m) from unnest(meals) m) or not meals <@ array['breakfast','lunch','dinner']::text[] then raise exception 'Choose each meal once'; end if;
 cycle:=p_booking->>'plan_cycle'; people:=(p_booking->>'people_count')::integer; start_on:=(p_booking->>'start_date')::date;
 if cycle not in ('weekly','monthly','quarterly') or cycle is null or people is null or start_on is null or start_on<current_date or start_on>current_date+90 then raise exception 'Choose a valid plan and start date'; end if;
 quote:=chefos_private.quote_rate(c.id,people,cycle,cardinality(meals)); days:=(quote->>'days')::integer;
 visits:=p_booking->'visits';
 if jsonb_array_length(visits) not between 1 and 3 then raise exception 'Choose one to three cooking visits'; end if;
 selection:=jsonb_build_object('chef',c.id,'meal_type',meals,'people_count',people,'plan_cycle',cycle,'start_date',start_on,'visits',visits);
 select * into hold from chefos_private.booking_holds where user_id=p_actor and status='held' and expires_at>now() order by created_at desc limit 1;
 if hold.id is not null then
  if hold.booking->'selection'=selection then return jsonb_build_object('booking',hold.booking,'quote',hold.quote,'hold_id',hold.id,'existing_order_id',hold.order_id,'hold_expires_at',hold.expires_at); end if;
  raise exception 'Finish or cancel your current checkout before creating another';
 end if;
 booking:=selection||jsonb_build_object('schedule_version',2,'selection',selection,'building_id',home.building_id,'flat',home.flat);
 insert into chefos_private.booking_holds(user_id,chef_id,booking,quote) values(p_actor,c.id,booking,quote) returning * into hold;
 for v in select value from jsonb_array_elements(visits) loop
  if jsonb_typeof(v)<>'object' or exists(select 1 from jsonb_object_keys(v) k where k not in ('meals','start_minute')) then raise exception 'Invalid visit fields'; end if;
  if coalesce(jsonb_typeof(v->'meals'),'null')<>'array' or coalesce(v->>'start_minute','') !~ '^[0-9]{1,4}$' then raise exception 'Invalid visit selection'; end if;
  select array_agg(value order by case value when 'breakfast' then 1 when 'lunch' then 2 else 3 end) into group_meals from jsonb_array_elements_text(v->'meals');
  if group_meals is null or cardinality(group_meals) not between 1 and 3 or not group_meals <@ meals then raise exception 'Every visit must contain selected meals'; end if;
  all_meals:=all_meals||group_meals; first_meal:=group_meals[1]; n:=(v->>'start_minute')::integer;
  for d in select tick::date from generate_series(start_on,start_on+days-1,interval '1 day') tick loop
   starts:=(d+n*interval '1 minute') at time zone 'Asia/Kolkata'; ends:=starts+cardinality(group_meals)*interval '1 hour';
   if starts<=now() or exists(select 1 from chefos_private.chef_leave where chef_id=c.id and day=d)
    or not exists(select 1 from chefos_private.chef_slots where chef_id=c.id and enabled and weekday=extract(isodow from d)::integer-1 and meal=first_meal and start_minute=n and latest_end_minute>=n+cardinality(group_meals)*60) then raise exception 'Chef is not available for every selected visit'; end if;
   if chefos_private.capacity_conflict(c.id,starts,ends,home.building_id) then raise exception 'The visit overlaps cooking or the required travel gap'; end if;
   insert into chefos_private.visits(hold_id,chef_id,user_id,building_id,flat,starts_at,ends_at,meals)
   values(hold.id,c.id,p_actor,home.building_id,home.flat,starts,ends,group_meals);
  end loop;
 end loop;
 if cardinality(all_meals)<>cardinality(meals) or cardinality(all_meals)<>(select count(distinct m) from unnest(all_meals) m) then raise exception 'Each meal must belong to exactly one visit'; end if;
 return jsonb_build_object('booking',booking,'quote',quote,'hold_id',hold.id,'hold_expires_at',hold.expires_at);
end $$;

alter function public.chefos_server_record_order(uuid,text,jsonb) set schema chefos_private;
revoke all on function chefos_private.chefos_server_record_order(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.chefos_server_record_order(p_actor uuid,p_order text,p_prepared jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare h chefos_private.booking_holds%rowtype; saved jsonb;
begin
 if p_prepared->>'hold_id' is null then return chefos_private.chefos_server_record_order(p_actor,p_order,p_prepared); end if;
 select * into h from chefos_private.booking_holds where id=(p_prepared->>'hold_id')::uuid and user_id=p_actor for update;
 if h.id is null or h.status<>'held' or (h.order_id is null and h.expires_at<=now()) then raise exception 'Checkout hold is not available'; end if;
 if h.order_id is not null then
  select jsonb_build_object('order_id',order_id,'amount',amount,'currency',currency,'pricing',chefos_private.customer_quote(quote),'hold_expires_at',h.expires_at) into saved from chefos_private.payments where order_id=h.order_id and user_id=p_actor;
  return saved;
 end if;
 saved:=chefos_private.chefos_server_record_order(p_actor,p_order,jsonb_build_object('booking',h.booking||jsonb_build_object('hold_id',h.id),'quote',h.quote));
 update chefos_private.booking_holds set order_id=p_order where id=h.id;
 return saved||jsonb_build_object('hold_expires_at',h.expires_at);
end $$;
revoke all on function public.chefos_server_record_order(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.chefos_server_record_order(uuid,text,jsonb) to service_role;

alter function public.chefos_activate_order(text) set schema chefos_private;
revoke all on function chefos_private.chefos_activate_order(text) from public,anon,authenticated,service_role;
create function public.chefos_activate_order(p_order text) returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid:=chefos_private.require_actor(); entry chefos_private.payments%rowtype; h chefos_private.booking_holds%rowtype;
 sub public.chefos_subscriptions%rowtype; c public.chefos_chefs%rowtype; v record; meals text[]; start_on date; waves jsonb:='{}'; legacy_range tstzrange; d date; meal text;
begin
 perform 1 from public.chefos_profiles where id=actor for update;
 select * into entry from chefos_private.payments where order_id=p_order and user_id=actor for update;
 if entry.id is null or entry.status<>'paid' then raise exception 'A captured payment for this account is required' using errcode='42501'; end if;
 if entry.subscription_id is not null then select * into sub from public.chefos_subscriptions where id=entry.subscription_id; return to_jsonb(sub); end if;
 select * into c from public.chefos_chefs where id=(entry.booking->>'chef')::uuid for update;
 if not c.is_verified or not c.is_active then raise exception 'Chef is unavailable; contact support'; end if;
 if coalesce((entry.booking->>'schedule_version')::integer,1)<>2 then
  for d in select tick::date from generate_series((entry.booking->>'start_date')::date,(entry.booking->>'start_date')::date+(entry.quote->>'days')::integer-1,interval '1 day') tick loop
   for meal in select jsonb_array_elements_text(entry.booking->'meal_type') loop
    legacy_range:=chefos_private.legacy_wave(entry.booking#>>array['meal_wave',meal],d);
    if chefos_private.capacity_conflict(c.id,lower(legacy_range),upper(legacy_range),null,null,false) then raise exception 'The slot was reserved during payment; contact support for reassignment or refund'; end if;
   end loop;
  end loop;
  return chefos_private.chefos_activate_order(p_order);
 end if;
 select * into h from chefos_private.booking_holds where id=(entry.booking->>'hold_id')::uuid and user_id=actor and order_id=p_order for update;
 if h.id is null or h.status='cancelled' then raise exception 'Checkout is unavailable; contact support for payment reconciliation'; end if;
 start_on:=(entry.booking->>'start_date')::date;
 if start_on<current_date then raise exception 'Service date passed; contact support for adjustment or refund'; end if;
 update public.chefos_subscriptions set is_active=false where user_id=actor and is_active and end_date<current_date;
 if exists(select 1 from public.chefos_subscriptions where user_id=actor and is_active) then raise exception 'An active paid subscription already exists'; end if;
 for v in select * from chefos_private.visits where hold_id=h.id order by starts_at loop
  if v.starts_at<=now() or chefos_private.capacity_conflict(c.id,v.starts_at,v.ends_at,v.building_id,h.id) then raise exception 'The visit was booked during payment; contact support for reassignment or refund'; end if;
 end loop;
 select array_agg(value) into meals from jsonb_array_elements_text(entry.booking->'meal_type');
 for meal in select unnest(meals) loop waves:=waves||jsonb_build_object(meal,'V2'); end loop;
 insert into public.chefos_subscriptions(user_id,chef_id,meal_type,meal_wave,people_count,plan_cycle,start_date,end_date,price,pricing,schedule_version)
 values(actor,c.id,meals,waves,(entry.booking->>'people_count')::integer,entry.booking->>'plan_cycle',start_on,start_on+(entry.quote->>'days')::integer-1,(entry.quote->>'price_inr')::integer,chefos_private.customer_quote(entry.quote),2) returning * into sub;
 insert into chefos_private.subscription_terms(subscription_id,quote) values(sub.id,entry.quote);
 update chefos_private.payments set subscription_id=sub.id where id=entry.id;
 update chefos_private.booking_holds set status='confirmed',subscription_id=sub.id where id=h.id;
 update chefos_private.visits set state='confirmed' where hold_id=h.id;
 insert into chefos_private.service_sessions(user_id,chef_id,subscription_id,service_date,meal,wave,visit_id,meal_types)
 select actor,c.id,sub.id,(scheduled.starts_at at time zone 'Asia/Kolkata')::date,scheduled.meals[1],'V2',scheduled.id,scheduled.meals from chefos_private.visits scheduled where scheduled.hold_id=h.id;
 insert into public.chefos_assignments(user_id,chef_id) values(actor,c.id) on conflict(user_id) do update set chef_id=excluded.chef_id,assigned_at=now();
 return to_jsonb(sub);
end $$;
revoke all on function public.chefos_activate_order(text) from public,anon;
grant execute on function public.chefos_activate_order(text) to authenticated;

-- Keep the old service queries but stop their lazy materialisation of v2 waves.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.chefos_mobile_action(text,jsonb)'::regprocedure);
 definition:=replace(definition,'if plan.id is not null and today between plan.start_date and plan.end_date then','if plan.schedule_version=1 and plan.id is not null and today between plan.start_date and plan.end_date then');
 definition:=replace(definition,'where s.chef_id=own_chef.id and s.is_active and today between','where s.schedule_version=1 and s.chef_id=own_chef.id and s.is_active and today between');
 definition:=replace(definition,'''id'',s.id,''meal'',s.meal,''wave'',s.wave,''status'',s.status,''username'',p.username',
  '''id'',s.id,''meal'',s.meal,''meals'',coalesce(s.meal_types,array[s.meal]),''visit_id'',s.visit_id,''wave'',s.wave,''status'',s.status,''username'',p.username');
 definition:=replace(definition,'perform 1 from public.chefos_chefs where id=own_chef.id for update;',
  'perform 1 from public.chefos_chefs where id=own_chef.id for update;
   if chefos_private.capacity_conflict(own_chef.id,lower(chefos_private.legacy_wave(instant.wave,today)),upper(chefos_private.legacy_wave(instant.wave,today)),null,null,false) then raise exception ''This time is reserved by another visit''; end if;');
 execute definition;
end $$;

create function chefos_private.sync_visit_session() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.visit_id is not null and new.status is distinct from old.status then
  if new.status='started' then update chefos_private.visits set state='cooking' where id=new.visit_id;
  elsif new.status='completed' then update chefos_private.visits set state='completed',actual_ended_at=new.completed_at where id=new.visit_id; end if;
 end if;
 return new;
end $$;
revoke all on function chefos_private.sync_visit_session() from public,anon,authenticated,service_role;
create trigger chefos_sync_visit after update of status on chefos_private.service_sessions for each row execute function chefos_private.sync_visit_session();
