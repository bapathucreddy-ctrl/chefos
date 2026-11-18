-- Targeted instant requests reserve real capacity only after chef acceptance.
-- Internal arrival allowance is capacity accounting, never a promised ETA.
create table chefos_private.instant_bookings (
 request_id uuid primary key references public.chefos_instant_requests(id),
 chef_id uuid not null references public.chefos_chefs(id), building_id uuid not null references chefos_private.buildings(id), flat text not null,
 cuisine text not null, meals text[] not null, people_count integer not null check(people_count between 1 and 8),
 food_notes text not null check(length(food_notes) between 2 and 2000),
 hold_id uuid unique references chefos_private.booking_holds(id), recipes jsonb, version integer not null default 0,
 accepted_version integer, updated_at timestamptz not null default now()
);
alter table chefos_private.instant_bookings enable row level security;
revoke all on chefos_private.instant_bookings from public,anon,authenticated,service_role;
alter table chefos_private.payments add column instant_request_id uuid unique references public.chefos_instant_requests(id);

create function chefos_private.instant_available(p_chef uuid,p_building uuid,p_meals text[],p_ignore uuid default null) returns boolean
language plpgsql stable set search_path='' set timezone='Asia/Kolkata' as $$
declare b chefos_private.buildings%rowtype; c public.chefos_chefs%rowtype; loc chefos_private.chef_locations%rowtype; start_at timestamptz:=now(); finish timestamptz;
begin
 select * into b from chefos_private.buildings where id=p_building and active;
 select * into c from public.chefos_chefs where id=p_chef and is_verified and is_active and is_available;
 select * into loc from chefos_private.chef_locations where chef_id=p_chef;
 if b.id is null or c.id is null or loc.chef_id is null or loc.updated_at<now()-interval '30 minutes'
  or chefos_private.distance_km(b.latitude,b.longitude,loc.latitude,loc.longitude)>5 then return false; end if;
 finish:=start_at+(cardinality(p_meals)+1)*interval '1 hour';
 if (start_at at time zone 'Asia/Kolkata')::time<'06:00' or (finish at time zone 'Asia/Kolkata')::date<>current_date
  or (finish at time zone 'Asia/Kolkata')::time>'23:00' then return false; end if;
 if exists(select 1 from chefos_private.chef_leave where chef_id=p_chef and day=current_date) then return false; end if;
 -- Include the travel/arrival allowance as well as cooking in the capacity check.
 return not chefos_private.capacity_conflict(p_chef,start_at,finish,p_building,p_ignore);
end $$;
revoke all on function chefos_private.instant_available(uuid,uuid,text[],uuid) from public,anon,authenticated,service_role;

create function public.chefos_instant(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid:=chefos_private.require_actor(); r public.chefos_instant_requests%rowtype; ctx chefos_private.instant_bookings%rowtype;
 c public.chefos_chefs%rowtype; home chefos_private.households%rowtype; b chefos_private.buildings%rowtype; h chefos_private.booking_holds%rowtype;
 meals text[]; cuisine text; people integer; quote jsonb; result jsonb; chosen uuid; start_at timestamptz;
begin
 -- Use one lock order (actor, chef, request) for acceptance and checkout.
 perform 1 from public.chefos_profiles where id=actor for update;
 if p_action='respond' then
  select * into c from public.chefos_chefs where user_id=actor and is_active and is_verified for update;
  if c.id is null then raise exception 'Verified chef account required' using errcode='42501'; end if;
  select * into r from public.chefos_instant_requests where id=(p_data->>'request_id')::uuid for update;
  select * into ctx from chefos_private.instant_bookings where request_id=r.id;
  if ctx.request_id is null then raise exception 'This request requires the previous app version'; end if;
  if ctx.chef_id<>c.id or r.status<>'searching' or not exists(select 1 from public.chefos_instant_offers where request_id=r.id and chef_id=c.id and status='pending' and expires_at>now()) then raise exception 'This offer is no longer available'; end if;
  if p_data->>'action'='decline' then
   update public.chefos_instant_offers set status='declined' where request_id=r.id and chef_id=c.id;
   update public.chefos_instant_requests set status='no_chef' where id=r.id;
   return '{"declined":true}';
  end if;
  if p_data->>'action'<>'accept' then raise exception 'Choose accept or decline'; end if;
  if not ctx.cuisine=any(c.cuisines) or not chefos_private.instant_available(c.id,ctx.building_id,ctx.meals) then raise exception 'Chef is no longer available for this visit'; end if;
  quote:=chefos_private.quote_rate(c.id,ctx.people_count,'instant',cardinality(ctx.meals));
  insert into chefos_private.booking_holds(user_id,chef_id,booking,quote)
   values(r.user_id,c.id,jsonb_build_object('instant_request_id',r.id,'chef',c.id,'plan_cycle','instant','schedule_version',2,'meal_type',ctx.meals,'people_count',ctx.people_count),quote) returning * into h;
  start_at:=now()+interval '1 hour';
  insert into chefos_private.visits(hold_id,chef_id,user_id,building_id,flat,starts_at,ends_at,meals)
   values(h.id,c.id,r.user_id,ctx.building_id,ctx.flat,start_at,start_at+cardinality(ctx.meals)*interval '1 hour',ctx.meals);
  update chefos_private.instant_bookings set hold_id=h.id where request_id=r.id;
  update chefos_private.instant_details set quote=h.quote where request_id=r.id;
  update public.chefos_instant_requests set status='accepted',accepted_chef=c.id where id=r.id returning * into r;
  update public.chefos_instant_offers set status='accepted' where request_id=r.id and chef_id=c.id;
  return to_jsonb(r);
 end if;
 if not exists(select 1 from public.chefos_profiles where id=actor and role='customer') then raise exception 'Customer account required' using errcode='42501'; end if;
 if p_action in ('available','create') then
  select * into home from chefos_private.households where user_id=actor;
  if home.user_id is null then raise exception 'Verify your community and flat first'; end if;
  select * into b from chefos_private.buildings where id=home.building_id and active;
  if b.id is null then raise exception 'This community is not available'; end if;
  cuisine:=p_data->>'cuisine'; people:=(p_data->>'people_count')::integer;
  select array_agg(value order by value) into meals from jsonb_array_elements_text(p_data->'meals');
  if cuisine is null or cuisine not in ('south_indian','north_indian','hyderabadi','andhra','kerala','tamil','punjabi','gujarati','maharashtrian','bengali','asian','continental')
   or people is null or people not between 1 and 8 or meals is null or cardinality(meals) not between 1 and 2
   or not meals<@array['breakfast','lunch','dinner']::text[] or cardinality(meals)<>(select count(distinct x) from unnest(meals)x) then raise exception 'Choose cuisine, meals and household size'; end if;
  if p_action='available' then
   select coalesce(jsonb_agg(jsonb_build_object('id',ch.id,'name',ch.name,'rating',ch.rating,'cuisines',ch.cuisines,
    'pricing',chefos_private.customer_quote(chefos_private.quote_rate(ch.id,people,'instant',cardinality(meals)))) order by ch.rating desc),'[]') into result
    from public.chefos_chefs ch where cuisine=any(ch.cuisines) and chefos_private.instant_available(ch.id,b.id,meals);
   return jsonb_build_object('chefs',result);
  end if;
  chosen:=(p_data->>'chef')::uuid;
  select * into c from public.chefos_chefs where id=chosen for update;
  if c.id is null or not cuisine=any(c.cuisines) or not chefos_private.instant_available(c.id,b.id,meals) then raise exception 'Chef is unavailable. Refresh available chefs.'; end if;
  if p_data->'allergies_confirmed' is distinct from 'true'::jsonb or length(trim(coalesce(p_data->>'food_notes',''))) not between 2 and 2000 then raise exception 'Confirm allergies and food restrictions before requesting a chef'; end if;
  if (select count(*) from public.chefos_instant_requests where user_id=actor and created_at>now()-interval '1 hour')>=8 then raise exception 'Please wait before requesting another chef'; end if;
  update public.chefos_instant_requests old set status='no_chef' where user_id=actor and status='searching' and not exists(select 1 from public.chefos_instant_offers where request_id=old.id and status='pending' and expires_at>now());
  insert into public.chefos_instant_requests(user_id,meal,wave) values(actor,meals[1],'V2') returning * into r;
  insert into chefos_private.instant_bookings(request_id,chef_id,building_id,flat,cuisine,meals,people_count,food_notes) values(r.id,c.id,b.id,home.flat,cuisine,meals,people,trim(p_data->>'food_notes'));
  insert into chefos_private.instant_details(request_id,latitude,longitude) values(r.id,b.latitude,b.longitude);
  insert into public.chefos_instant_offers(request_id,chef_id) values(r.id,c.id);
  return to_jsonb(r);
 elsif p_action in ('get','cancel') then
  select * into r from public.chefos_instant_requests where user_id=actor and (p_data->>'request_id' is null or id=(p_data->>'request_id')::uuid) order by created_at desc limit 1;
  if r.id is null then return null; end if;
  select * into ctx from chefos_private.instant_bookings where request_id=r.id;
  if ctx.request_id is null then return to_jsonb(r); end if;
  perform 1 from public.chefos_chefs where id=ctx.chef_id for update;
  select * into r from public.chefos_instant_requests where id=r.id for update;
  select * into h from chefos_private.booking_holds where id=ctx.hold_id for update;
  if p_action='cancel' then
   if exists(select 1 from chefos_private.payments where order_id=h.order_id and status='paid') or h.order_id is not null then raise exception 'Payment has been initiated; contact support for cancellation and reconciliation'; end if;
   if r.status not in ('searching','accepted') then raise exception 'Request is already closed'; end if;
   update public.chefos_instant_requests set status='cancelled' where id=r.id returning * into r;
   update public.chefos_instant_offers set status='skipped' where request_id=r.id and status='pending';
   update chefos_private.booking_holds set status='cancelled' where id=h.id;
   update chefos_private.visits set state='cancelled' where hold_id=h.id;
  elsif r.status='searching' and not exists(select 1 from public.chefos_instant_offers where request_id=r.id and status='pending' and expires_at>now()) then
   update public.chefos_instant_requests set status='no_chef' where id=r.id returning * into r;
  end if;
  return to_jsonb(r)||jsonb_build_object('cuisine',ctx.cuisine,'meals',ctx.meals,'people_count',ctx.people_count,
   'pricing',case when h.id is null then null else chefos_private.customer_quote(h.quote) end,'checkout_expires_at',h.expires_at,
   'paid',h.status='confirmed','order_id',h.order_id,'session_id',(select id from chefos_private.service_sessions where instant_request_id=r.id));
 end if;
 raise exception 'Unknown instant action';
end $$;
revoke all on function public.chefos_instant(text,jsonb) from public,anon;
grant execute on function public.chefos_instant(text,jsonb) to authenticated;

alter function public.chefos_server_prepare_order(uuid,jsonb) rename to chefos_prepare_subscription;
alter function public.chefos_prepare_subscription(uuid,jsonb) set schema chefos_private;
revoke all on function chefos_private.chefos_prepare_subscription(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.chefos_server_prepare_order(p_actor uuid,p_booking jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx chefos_private.instant_bookings%rowtype; r public.chefos_instant_requests%rowtype; h chefos_private.booking_holds%rowtype; v chefos_private.visits%rowtype;
begin
 if p_booking->>'instant_request_id' is null then return chefos_private.chefos_prepare_subscription(p_actor,p_booking); end if;
 if not exists(select 1 from public.chefos_profiles where id=p_actor and is_active and role='customer') then raise exception 'Customer account required'; end if;
 perform 1 from public.chefos_profiles where id=p_actor for update;
 select * into ctx from chefos_private.instant_bookings where request_id=(p_booking->>'instant_request_id')::uuid;
 perform 1 from public.chefos_chefs where id=ctx.chef_id for update;
 select * into r from public.chefos_instant_requests where id=ctx.request_id and user_id=p_actor for update;
 select * into h from chefos_private.booking_holds where id=ctx.hold_id and user_id=p_actor for update;
 select * into v from chefos_private.visits where hold_id=h.id;
 if r.id is null or r.status<>'accepted' or h.id is null or h.status='cancelled' then raise exception 'Chef acceptance is required before payment'; end if;
 if h.order_id is null and (h.expires_at<=now() or v.id is null or chefos_private.capacity_conflict(ctx.chef_id,greatest(now(),v.starts_at-interval '1 hour'),v.ends_at,ctx.building_id,h.id)) then raise exception 'The checkout reservation expired. Contact support or request another chef.'; end if;
 return jsonb_build_object('hold_id',h.id,'booking',h.booking,'quote',h.quote,'existing_order_id',h.order_id);
end $$;
revoke all on function public.chefos_server_prepare_order(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.chefos_server_prepare_order(uuid,jsonb) to service_role;

alter function public.chefos_activate_order(text) rename to chefos_activate_subscription;
alter function public.chefos_activate_subscription(text) set schema chefos_private;
revoke all on function chefos_private.chefos_activate_subscription(text) from public,anon,authenticated,service_role;
create function public.chefos_activate_order(p_order text) returns jsonb language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid:=chefos_private.require_actor(); pay chefos_private.payments%rowtype; ctx chefos_private.instant_bookings%rowtype;
 h chefos_private.booking_holds%rowtype; v chefos_private.visits%rowtype; sid uuid;
begin
 perform 1 from public.chefos_profiles where id=actor for update;
 select * into pay from chefos_private.payments where order_id=p_order and user_id=actor;
 if pay.booking->>'instant_request_id' is null then return chefos_private.chefos_activate_subscription(p_order); end if;
 select * into ctx from chefos_private.instant_bookings where request_id=(pay.booking->>'instant_request_id')::uuid;
 perform 1 from public.chefos_chefs where id=ctx.chef_id for update;
 select * into pay from chefos_private.payments where id=pay.id for update;
 if pay.status<>'paid' then raise exception 'A captured payment for this account is required' using errcode='42501'; end if;
 select id into sid from chefos_private.service_sessions where instant_request_id=ctx.request_id;
 if sid is not null then return jsonb_build_object('instant_request_id',ctx.request_id,'session_id',sid,'activated',true); end if;
 select * into h from chefos_private.booking_holds where id=ctx.hold_id and order_id=p_order for update;
 select * into v from chefos_private.visits where hold_id=h.id for update;
 if h.id is null or h.status<>'held' or v.id is null or v.starts_at<=now()
  or not exists(select 1 from public.chefos_chefs where id=ctx.chef_id and is_active and is_verified)
  or chefos_private.capacity_conflict(ctx.chef_id,greatest(now(),v.starts_at-interval '1 hour'),v.ends_at,ctx.building_id,h.id) then raise exception 'Capacity changed during payment. Contact support for reassignment or refund.'; end if;
 update chefos_private.payments set instant_request_id=ctx.request_id where id=pay.id;
 update chefos_private.booking_holds set status='confirmed' where id=h.id;
 update chefos_private.visits set state='confirmed' where id=v.id;
 insert into chefos_private.service_sessions(user_id,chef_id,instant_request_id,service_date,meal,wave,visit_id,meal_types)
 values(actor,ctx.chef_id,ctx.request_id,current_date,ctx.meals[1],'V2',v.id,ctx.meals) returning id into sid;
 return jsonb_build_object('instant_request_id',ctx.request_id,'session_id',sid,'activated',true);
end $$;
revoke all on function public.chefos_activate_order(text) from public,anon;
grant execute on function public.chefos_activate_order(text) to authenticated;

-- Route new targeted acceptances through the capacity-aware implementation.
alter function public.chefos_mobile_action(text,jsonb) rename to chefos_mobile_legacy;
alter function public.chefos_mobile_legacy(text,jsonb) set schema chefos_private;
revoke all on function chefos_private.chefos_mobile_legacy(text,jsonb) from public,anon,authenticated,service_role;
create function public.chefos_mobile_action(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; offers jsonb;begin
 if p_action='instant.respond' and exists(select 1 from chefos_private.instant_bookings where request_id=(p_data->>'request_id')::uuid) then return public.chefos_instant('respond',p_data); end if;
 result:=chefos_private.chefos_mobile_legacy(p_action,p_data);
 if p_action='partner.me' then
  select coalesce(jsonb_agg(o.value||case when ctx.request_id is null then '{}'::jsonb else jsonb_build_object('cuisine',ctx.cuisine,'meals',ctx.meals,'people_count',ctx.people_count,'building_name',b.name) end),'[]') into offers
   from jsonb_array_elements(result->'pending_instant_offers') o left join chefos_private.instant_bookings ctx on ctx.request_id=(o.value->>'request_id')::uuid
   left join chefos_private.buildings b on b.id=ctx.building_id;
  result:=jsonb_set(result,'{pending_instant_offers}',offers);
 end if;
 return result;
end $$;
revoke all on function public.chefos_mobile_action(text,jsonb) from public,anon;
grant execute on function public.chefos_mobile_action(text,jsonb) to authenticated;
