create function chefos_private.distance_km(a numeric,b numeric,c numeric,d numeric) returns numeric language sql immutable set search_path='' as $$
 select round((6371*2*asin(least(1::double precision,sqrt(power(sin(radians((c-a)::double precision)/2),2)+cos(radians(a::double precision))*cos(radians(c::double precision))*power(sin(radians((d-b)::double precision)/2),2)))))::numeric,2)
$$;
revoke all on function chefos_private.distance_km(numeric,numeric,numeric,numeric) from public;

create function chefos_private.customer_services(actor uuid,on_day date) returns jsonb language sql stable security definer set search_path='' set timezone='Asia/Kolkata' as $$
 select coalesce(jsonb_agg(jsonb_build_object('service_session_id',s.id,'meal',s.meal,'wave',s.wave,'status',s.status,
   'chef_id',s.chef_id,'chef_name',c.name,'journey_started',s.journey_started_at is not null,
   'start_otp',case when s.status='start_otp' and s.otp_expires_at>now() then s.otp_code end,
   'end_otp',case when s.status='end_otp' and s.otp_expires_at>now() then s.otp_code end,
   'chef_latitude',case when s.journey_started_at is not null and s.status<>'completed' then l.latitude end,
   'chef_longitude',case when s.journey_started_at is not null and s.status<>'completed' then l.longitude end)), '[]')
 from chefos_private.service_sessions s join public.chefos_chefs c on c.id=s.chef_id
 left join chefos_private.chef_locations l on l.chef_id=s.chef_id where s.user_id=actor and s.service_date=on_day
$$;
revoke all on function chefos_private.customer_services(uuid,date) from public;

create function public.chefos_mobile_action(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare
  actor uuid:=chefos_private.require_actor(); actor_role text; own_chef public.chefos_chefs%rowtype;
  plan public.chefos_subscriptions%rowtype; instant public.chefos_instant_requests%rowtype;
  target public.chefos_chefs%rowtype; session_row chefos_private.service_sessions%rowtype;
  result jsonb; preference jsonb; menu jsonb; offers jsonb; services jsonb; selected_meal text;
  lat numeric; lng numeric; radius numeric; meal_wave text; day_index integer;
  today date; zone text:=coalesce(p_data->>'timezone','Asia/Kolkata'); requested_id uuid;
begin
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then zone:='Asia/Kolkata'; end if;
  today:=(now() at time zone zone)::date;
  select role into actor_role from public.chefos_profiles where id=actor;
  select * into own_chef from public.chefos_chefs where user_id=actor;
  select data into preference from public.chefos_preferences where user_id=actor;
  preference:=coalesce(preference,'{}');
  select * into plan from public.chefos_subscriptions where user_id=actor and is_active and end_date>=today;

  if p_action='preference.get' then return preference;
  elsif p_action='preference.save' then
    if actor_role<>'customer' then raise exception 'Customer account required' using errcode='42501'; end if;
    if p_data ? 'people_count' and ((p_data->>'people_count')::numeric<>trunc((p_data->>'people_count')::numeric) or (p_data->>'people_count')::integer not between 1 and 100) then raise exception 'Invalid household size'; end if;
    -- A preference edit cannot resize an already paid household mid-plan.
    if plan.id is not null and p_data ? 'people_count' and (p_data->>'people_count')::integer<>plan.people_count then raise exception 'Update household size at renewal'; end if;
    insert into public.chefos_preferences(user_id,data) values(actor,preference||p_data)
      on conflict(user_id) do update set data=excluded.data,updated_at=now() returning data into result;
    return result;
  elsif p_action='menu.weekly' then
    select dishes||jsonb_build_object('generation',generation,'id',id) into result from public.chefos_weekly_menus where user_id=actor order by created_at desc limit 1;
    return coalesce(result,'{}');
  elsif p_action='subscription.active' then
    if plan.id is null then return null; end if;
    return to_jsonb(plan)||jsonb_build_object('chef',plan.chef_id,'service_otps_today',chefos_private.customer_services(actor,today));
  elsif p_action='chef.assigned' then
    select jsonb_build_object('chef',to_jsonb(c)) into result from public.chefos_assignments a join public.chefos_chefs c on c.id=a.chef_id where a.user_id=actor;
    return coalesce(result,'{"chef":null}');
  elsif p_action='chefs.list' then
    lat:=(p_data->>'lat')::numeric; lng:=(p_data->>'lng')::numeric;
    radius:=least(5,greatest(0.5,coalesce((p_data->>'radius_km')::numeric,5)));
    select coalesce(jsonb_agg(to_jsonb(q) order by q.distance_km nulls last,q.name),'[]') into result from (
      select c.*,case when lat is not null and lng is not null then chefos_private.distance_km(lat,lng,l.latitude,l.longitude) end distance_km
      from public.chefos_chefs c left join chefos_private.chef_locations l on c.id=l.chef_id
      where c.is_verified and c.is_available and c.is_active
      and (lat is null or lng is null or chefos_private.distance_km(lat,lng,l.latitude,l.longitude)<=radius)
    ) q;
    return result;
  elsif p_action='chef.assign' then
    if actor_role<>'customer' then raise exception 'Customer account required' using errcode='42501'; end if;
    select * into target from public.chefos_chefs where id=(p_data->>'chef_id')::uuid and is_verified and is_active and is_available;
    if not found then raise exception 'Chef is not available'; end if;
    if plan.id is not null and plan.chef_id<>target.id then raise exception 'A paid chef change requires a remaining-selected_meal adjustment'; end if;
    insert into public.chefos_assignments(user_id,chef_id) values(actor,target.id) on conflict(user_id) do update set chef_id=excluded.chef_id,assigned_at=now();
    return jsonb_build_object('chef',to_jsonb(target));
  elsif p_action='menu.today' or p_action='service.my' then
    if plan.id is not null and today between plan.start_date and plan.end_date then
      foreach selected_meal in array plan.meal_type loop
        insert into chefos_private.service_sessions(user_id,chef_id,subscription_id,service_date,meal,wave)
        values(actor,plan.chef_id,plan.id,today,selected_meal,coalesce(plan.meal_wave->>selected_meal,case selected_meal when 'breakfast' then 'B2' when 'lunch' then 'L2' else 'D2' end)) on conflict(subscription_id,service_date,meal) do nothing;
      end loop;
    end if;
    services:=chefos_private.customer_services(actor,today);
    if p_action='service.my' then return jsonb_build_object('service_otps',services); end if;
    select dishes into menu from public.chefos_weekly_menus where user_id=actor order by created_at desc limit 1;
    day_index:=extract(isodow from today)::integer-1;
    result:=jsonb_build_object('selected_meals',coalesce(to_jsonb(plan.meal_type),'[]'),'service_otps',services,'date',today,
      'breakfast',menu#>>array['breakfast',day_index::text],'lunch',menu#>>array['lunch',day_index::text],'dinner',menu#>>array['dinner',day_index::text]);
    return result||jsonb_build_object('time_context',jsonb_build_object('meal_phase',jsonb_build_object(
      'breakfast',case when (now() at time zone zone)::time<'11:30'::time then 'upcoming' else 'past' end,
      'lunch',case when (now() at time zone zone)::time<'17:30'::time then 'upcoming' else 'past' end,
      'dinner',case when (now() at time zone zone)::time<'23:00'::time then 'upcoming' else 'past' end)));
  elsif p_action='partner.me' then
    if own_chef.id is null then raise exception 'Chef partner account required' using errcode='42501'; end if;
    insert into chefos_private.service_sessions(user_id,chef_id,subscription_id,service_date,meal,wave)
      select s.user_id,s.chef_id,s.id,today,m.value,coalesce(s.meal_wave->>m.value,case m.value when 'breakfast' then 'B2' when 'lunch' then 'L2' else 'D2' end)
      from public.chefos_subscriptions s cross join lateral unnest(s.meal_type) m(value)
      where s.chef_id=own_chef.id and s.is_active and today between s.start_date and s.end_date
      on conflict(subscription_id,service_date,meal) do nothing;
    select coalesce(jsonb_agg(jsonb_build_object('request_id',r.id,'username',p.username,'meal',r.meal,'wave',r.wave,
      'seconds_left',greatest(0,extract(epoch from o.expires_at-now())::integer))), '[]') into offers
      from public.chefos_instant_offers o join public.chefos_instant_requests r on r.id=o.request_id
      join public.chefos_profiles p on p.id=r.user_id where o.chef_id=own_chef.id and o.status='pending' and o.expires_at>now() and r.status='searching';
    select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'meal',s.meal,'wave',s.wave,'status',s.status,'username',p.username)),'[]') into services
      from chefos_private.service_sessions s join public.chefos_profiles p on p.id=s.user_id where s.chef_id=own_chef.id and s.status<>'completed';
    return jsonb_build_object('partner_profile',jsonb_build_object('chef',to_jsonb(own_chef),'is_verified',own_chef.is_verified),
      'pending_instant_offers',offers,'service_sessions',services);
  elsif p_action='partner.availability' then
    if own_chef.id is null or not own_chef.is_verified or not own_chef.is_active then raise exception 'A verified active chef profile is required' using errcode='42501'; end if;
    if jsonb_typeof(p_data->'is_available')<>'boolean' then raise exception 'is_available must be true or false'; end if;
    update public.chefos_chefs set is_available=(p_data->>'is_available')::boolean where id=own_chef.id;
    return jsonb_build_object('is_available',(p_data->>'is_available')::boolean);
  elsif p_action='partner.location' then
    if own_chef.id is null then raise exception 'Chef partner account required' using errcode='42501'; end if;
    lat:=(p_data->>'latitude')::numeric; lng:=(p_data->>'longitude')::numeric;
    if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then raise exception 'Invalid location coordinates'; end if;
    insert into chefos_private.chef_locations(chef_id,latitude,longitude) values(own_chef.id,lat,lng)
    on conflict(chef_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,updated_at=now();
    return '{"updated":true}';
  elsif p_action='instant.latest' or p_action='instant.detail' then
    select * into instant from public.chefos_instant_requests where user_id=actor
      and (p_action='instant.latest' or id=(p_data->>'request_id')::uuid) order by created_at desc limit 1;
    if instant.id is null then return null; end if;
    if instant.status='searching' and not exists(select 1 from public.chefos_instant_offers where request_id=instant.id and status='pending' and expires_at>now()) then
      update public.chefos_instant_requests set status='no_chef' where id=instant.id returning * into instant;
    end if;
    return to_jsonb(instant);
  elsif p_action='instant.create' then
    if actor_role<>'customer' then raise exception 'Customer account required' using errcode='42501'; end if;
    lat:=(p_data->>'latitude')::numeric; lng:=(p_data->>'longitude')::numeric;
    if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then raise exception 'Invalid location coordinates'; end if;
    update public.chefos_instant_requests r set status='no_chef' where user_id=actor and status='searching' and not exists(select 1 from public.chefos_instant_offers where request_id=r.id and status='pending' and expires_at>now());
    selected_meal:=coalesce(p_data->>'meal',case when (now() at time zone zone)::time<'10:00' then 'breakfast' when (now() at time zone zone)::time<'16:00' then 'lunch' else 'dinner' end);
    meal_wave:=coalesce(p_data->>'wave',case selected_meal when 'breakfast' then 'B2' when 'lunch' then 'L2' else 'D2' end);
    if meal_wave not in ('B1','B2','B3','B4','B5','L1','L2','L3','L4','L5','D1','D2','D3','D4','D5') or left(meal_wave,1)<>upper(left(selected_meal,1)) then raise exception 'Invalid selected_meal slot'; end if;
    insert into public.chefos_instant_requests(user_id,meal,wave) values(actor,selected_meal,meal_wave) returning * into instant;
    insert into chefos_private.instant_details(request_id,latitude,longitude) values(instant.id,lat,lng);
    insert into public.chefos_instant_offers(request_id,chef_id)
      select instant.id,c.id from public.chefos_chefs c join chefos_private.chef_locations l on l.chef_id=c.id
      where c.is_verified and c.is_active and c.is_available and chefos_private.distance_km(lat,lng,l.latitude,l.longitude)<=5
      order by chefos_private.distance_km(lat,lng,l.latitude,l.longitude) limit 10;
    if not found then update public.chefos_instant_requests set status='no_chef' where id=instant.id returning * into instant; end if;
    return to_jsonb(instant);
  elsif p_action='instant.respond' then
    if own_chef.id is null or not own_chef.is_verified or not own_chef.is_active then raise exception 'Verified chef account required' using errcode='42501'; end if;
    requested_id:=(p_data->>'request_id')::uuid;
    select * into instant from public.chefos_instant_requests where id=requested_id for update;
    if not found or instant.status<>'searching' then raise exception 'Request is no longer available'; end if;
    if not exists(select 1 from public.chefos_instant_offers where chef_id=own_chef.id and request_id=instant.id and status='pending' and expires_at>now()) then raise exception 'This offer is not available to your account' using errcode='42501'; end if;
    if p_data->>'action'='decline' then
      update public.chefos_instant_offers set status='declined' where request_id=instant.id and chef_id=own_chef.id;
      return '{"declined":true}';
    end if;
    if p_data->>'action'<>'accept' then raise exception 'Invalid offer action'; end if;
    -- One chef cannot accept two homes in the same selected_meal wave.
    perform 1 from public.chefos_chefs where id=own_chef.id for update;
    if exists(select 1 from chefos_private.service_sessions where chef_id=own_chef.id and service_date=today and wave=instant.wave and status<>'completed') then raise exception 'This selected_meal slot is already occupied'; end if;
    if exists(select 1 from public.chefos_subscriptions s where s.chef_id=own_chef.id and s.is_active and today between s.start_date and s.end_date
      and coalesce(s.meal_wave->>instant.meal,case instant.meal when 'breakfast' then 'B2' when 'lunch' then 'L2' else 'D2' end)=instant.wave and instant.meal=any(s.meal_type)) then raise exception 'This selected_meal slot is reserved for a subscription'; end if;
    update public.chefos_instant_requests set status='accepted',accepted_chef=own_chef.id where id=instant.id returning * into instant;
    update public.chefos_instant_offers set status=case when chef_id=own_chef.id then 'accepted' else 'skipped' end where request_id=instant.id and status='pending';
    select data into preference from public.chefos_preferences where user_id=instant.user_id;
    update chefos_private.instant_details set quote=chefos_private.quote_rate(own_chef.id,coalesce((preference->>'people_count')::integer,3),'instant',1) where chefos_private.instant_details.request_id=instant.id;
    insert into chefos_private.service_sessions(user_id,chef_id,instant_request_id,service_date,meal,wave) values(instant.user_id,own_chef.id,instant.id,today,instant.meal,instant.wave);
    return to_jsonb(instant);
  elsif p_action='feedback.submit' then
    if not exists(select 1 from public.chefos_subscriptions where id=(p_data->>'subscription')::uuid and user_id=actor) then raise exception 'Subscription not found' using errcode='42501'; end if;
    insert into public.chefos_feedback(user_id,subscription_id,rating,comment) values(actor,(p_data->>'subscription')::uuid,(p_data->>'rating')::integer,left(coalesce(p_data->>'comment',''),500))
      on conflict(user_id,subscription_id) do update set rating=excluded.rating,comment=excluded.comment;
    return '{"saved":true}';
  elsif p_action='history.instant' then
    select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('chef_name',c.name,'rating',d.rating,'comment',d.comment)),'[]') into result
      from public.chefos_instant_requests r left join public.chefos_chefs c on c.id=r.accepted_chef left join chefos_private.instant_details d on d.request_id=r.id
      where r.user_id=actor and r.status in ('completed','cancelled','no_chef');
    return result;
  elsif p_action='history.partner' then
    if own_chef.id is null then raise exception 'Chef partner account required' using errcode='42501'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'meal',s.meal,'completed_at',s.completed_at,'username',p.username,
      'earning',coalesce((t.quote->>'chef_payout_per_meal')::numeric,(d.quote->>'chef_payout_total')::numeric))),'[]') into result
      from chefos_private.service_sessions s join public.chefos_profiles p on p.id=s.user_id
      left join chefos_private.subscription_terms t on t.subscription_id=s.subscription_id
      left join chefos_private.instant_details d on d.request_id=s.instant_request_id
      where s.chef_id=own_chef.id and s.status='completed';
    return result;
  end if;
  raise exception 'Unknown Chefos operation';
end $$;
revoke all on function public.chefos_mobile_action(text,jsonb) from public;
grant execute on function public.chefos_mobile_action(text,jsonb) to authenticated;

-- OTP request and verification are one database transaction. Never return a
-- customer's code to a chef, and never advance state on an expired/wrong code.
create function public.chefos_service_action(p_id uuid,p_action text,p_code text default null) returns jsonb language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid:=chefos_private.require_actor(); s chefos_private.service_sessions%rowtype;
begin
  select * into s from chefos_private.service_sessions where id=p_id for update;
  if not found or not exists(select 1 from public.chefos_chefs where id=s.chef_id and user_id=actor and is_verified and is_active) then raise exception 'Service is not assigned to this chef' using errcode='42501'; end if;
  if p_action='journey' then
    if s.status='completed' then raise exception 'Service is already complete'; end if;
    update chefos_private.service_sessions set journey_started_at=coalesce(journey_started_at,now()) where id=s.id;
  elsif p_action in ('start.request','end.request') then
    if (p_action='start.request' and not(s.status='assigned' or (s.status='start_otp' and s.otp_expires_at<=now()))) or (p_action='end.request' and not(s.status='started' or (s.status='end_otp' and s.otp_expires_at<=now()))) then raise exception 'Service is not ready for a new code. Existing codes expire after ten minutes.'; end if;
    update chefos_private.service_sessions set status=case when p_action='start.request' then 'start_otp' else 'end_otp' end,
      otp_code=lpad(((('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint)%1000000)::text,6,'0'),otp_attempts=0,otp_expires_at=now()+interval '10 minutes' where id=s.id;
  elsif p_action in ('start.verify','end.verify') then
    if (p_action='start.verify' and s.status<>'start_otp') or (p_action='end.verify' and s.status<>'end_otp') then raise exception 'Verification is not expected'; end if;
    if s.otp_expires_at<now() or s.otp_attempts>=5 then raise exception 'Code expired or attempt limit reached'; end if;
    if p_code is null or p_code<>s.otp_code then
      update chefos_private.service_sessions set otp_attempts=otp_attempts+1 where id=s.id;
      -- Returning an error object preserves the attempt increment (RAISE would
      -- roll it back), and the Edge boundary converts this to an HTTP error.
      return '{"error":true,"status":400,"detail":"Incorrect verification code"}';
    end if;
    update chefos_private.service_sessions set status=case when p_action='start.verify' then 'started' else 'completed' end,
      started_at=case when p_action='start.verify' then now() else started_at end,
      completed_at=case when p_action='end.verify' then now() else completed_at end,otp_code=null,otp_expires_at=null where id=s.id;
    if p_action='end.verify' and s.instant_request_id is not null then update public.chefos_instant_requests set status='completed' where id=s.instant_request_id; end if;
  else raise exception 'Invalid service action'; end if;
  return '{"updated":true}';
end $$;
revoke all on function public.chefos_service_action(uuid,text,text) from public;
grant execute on function public.chefos_service_action(uuid,text,text) to authenticated;
