-- Dated reservations coexist with legacy waves; no paid timestamps are rewritten.
alter table public.chefos_subscriptions add column schedule_version integer not null default 1;
create table chefos_private.buildings (
 id uuid primary key default gen_random_uuid(), name text not null,
 latitude numeric not null check(latitude between -90 and 90),
 longitude numeric not null check(longitude between -180 and 180),
 code_hash text not null, active boolean not null default true
);
create table chefos_private.households (
 user_id uuid primary key references public.chefos_profiles(id),
 building_id uuid not null references chefos_private.buildings(id),
 flat text not null, verified_at timestamptz not null default now()
);
create table chefos_private.address_attempts (
 user_id uuid primary key references public.chefos_profiles(id),
 attempts integer not null default 0, window_start timestamptz not null default now()
);
create table chefos_private.chef_slots (
 id uuid primary key default gen_random_uuid(), chef_id uuid not null references public.chefos_chefs(id),
 weekday integer not null check(weekday between 0 and 6),
 meal text not null check(meal in ('breakfast','lunch','dinner')),
 start_minute integer not null check(start_minute between 360 and 1379),
 latest_end_minute integer not null check(latest_end_minute between 420 and 1380),
 enabled boolean not null default true, check(latest_end_minute>=start_minute+60),
 unique(chef_id,weekday,meal,start_minute)
);
create table chefos_private.chef_leave (
 chef_id uuid not null references public.chefos_chefs(id), day date not null,
 primary key(chef_id,day)
);
create table chefos_private.chef_building_gaps (
 chef_id uuid not null references public.chefos_chefs(id), building_id uuid not null references chefos_private.buildings(id),
 day date not null, confirmed_at timestamptz not null default now(), primary key(chef_id,building_id,day)
);
create table chefos_private.booking_holds (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.chefos_profiles(id),
 chef_id uuid not null references public.chefos_chefs(id), booking jsonb not null, quote jsonb not null,
 expires_at timestamptz not null default now()+interval '10 minutes',
 order_id text unique, subscription_id uuid unique references public.chefos_subscriptions(id),
 status text not null default 'held' check(status in ('held','confirmed','cancelled')),
 created_at timestamptz not null default now()
);
create table chefos_private.visits (
 id uuid primary key default gen_random_uuid(), hold_id uuid not null references chefos_private.booking_holds(id),
 chef_id uuid not null references public.chefos_chefs(id), user_id uuid not null references public.chefos_profiles(id),
 building_id uuid not null references chefos_private.buildings(id), flat text not null,
 starts_at timestamptz not null, ends_at timestamptz not null,
 meals text[] not null check(cardinality(meals) between 1 and 3),
 state text not null default 'held' check(state in ('held','confirmed','cooking','completed','cancelled')),
 actual_ended_at timestamptz, check(ends_at>starts_at),
 check(ends_at=starts_at+cardinality(meals)*interval '1 hour'),
 unique(hold_id,starts_at)
);
create index chefos_visit_capacity on chefos_private.visits(chef_id,starts_at,ends_at);
alter table chefos_private.service_sessions add column visit_id uuid unique references chefos_private.visits(id);
alter table chefos_private.service_sessions add column meal_types text[];

do $$declare name text; begin
 foreach name in array array['buildings','households','address_attempts','chef_slots','chef_leave','chef_building_gaps','booking_holds','visits'] loop
  execute format('alter table chefos_private.%I enable row level security',name);
  execute format('revoke all on chefos_private.%I from public,anon,authenticated,service_role',name);
 end loop;
end $$;

create function chefos_private.seed_slots() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into chefos_private.chef_slots(chef_id,weekday,meal,start_minute,latest_end_minute)
 select new.id,d,case when m<660 then 'breakfast' when m<1020 then 'lunch' else 'dinner' end,
 m,case when m<660 then 660 when m<1020 then 1020 else 1380 end
 from generate_series(0,6) d cross join unnest(array[360,480,600,720,840,960,1080,1200,1320]) m;
 return new;
end $$;
revoke all on function chefos_private.seed_slots() from public,anon,authenticated,service_role;
create trigger chefos_seed_slots after insert on public.chefos_chefs for each row execute function chefos_private.seed_slots();
insert into chefos_private.chef_slots(chef_id,weekday,meal,start_minute,latest_end_minute)
select c.id,d,case when m<660 then 'breakfast' when m<1020 then 'lunch' else 'dinner' end,
 m,case when m<660 then 660 when m<1020 then 1020 else 1380 end
from public.chefos_chefs c cross join generate_series(0,6) d cross join unnest(array[360,480,600,720,840,960,1080,1200,1320]) m;

create function public.chefos_ops_building(p_name text,p_lat numeric,p_lng numeric,p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$declare item chefos_private.buildings%rowtype;begin
 if not public.chefos_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if length(trim(p_name)) not between 2 and 120 or length(p_code) not between 12 and 100 then raise exception 'Building name and a code of at least 12 characters are required'; end if;
 insert into chefos_private.buildings(name,latitude,longitude,code_hash)
 values(trim(p_name),p_lat,p_lng,encode(sha256(convert_to(p_code,'UTF8')),'hex')) returning * into item;
 insert into chefos_private.audit_log(actor,action,object_id,changes) values(auth.uid(),'building.created',item.id::text,jsonb_build_object('name',item.name));
 return jsonb_build_object('id',item.id,'name',item.name);
end $$;
revoke all on function public.chefos_ops_building(text,numeric,numeric,text) from public,anon;
grant execute on function public.chefos_ops_building(text,numeric,numeric,text) to authenticated;

create function public.chefos_household(p_data jsonb default null) returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid:=chefos_private.require_actor(); home chefos_private.households%rowtype; b chefos_private.buildings%rowtype; tries chefos_private.address_attempts%rowtype; result jsonb;
begin
 if not exists(select 1 from public.chefos_profiles where id=actor and role='customer') then raise exception 'Customer account required' using errcode='42501'; end if;
 perform 1 from public.chefos_profiles where id=actor for update;
 select * into home from chefos_private.households where user_id=actor;
 if p_data is not null then
  if home.user_id is not null and (exists(select 1 from public.chefos_subscriptions where user_id=actor and is_active and end_date>=current_date)
   or exists(select 1 from chefos_private.booking_holds where user_id=actor and status='held' and expires_at>now())
   or exists(select 1 from public.chefos_instant_requests where user_id=actor and status in ('searching','accepted'))) then
   raise exception 'Your booked home is locked until the plan or checkout ends'; end if;
  insert into chefos_private.address_attempts(user_id) values(actor) on conflict do nothing;
  select * into tries from chefos_private.address_attempts where user_id=actor for update;
  if tries.window_start<now()-interval '1 hour' then update chefos_private.address_attempts set attempts=0,window_start=now() where user_id=actor; tries.attempts:=0; end if;
  if tries.attempts>=5 then return '{"error":true,"status":429,"detail":"Too many community-code attempts. Try again in one hour."}'; end if;
  select * into b from chefos_private.buildings where id=(p_data->>'building_id')::uuid and active;
  if b.id is null or b.code_hash<>encode(sha256(convert_to(coalesce(p_data->>'code',''),'UTF8')),'hex') then
   update chefos_private.address_attempts set attempts=attempts+1 where user_id=actor;
   return '{"error":true,"status":400,"detail":"The community code is incorrect."}';
  end if;
  if length(trim(coalesce(p_data->>'flat',''))) not between 1 and 80 then raise exception 'Enter your flat number'; end if;
  insert into chefos_private.households(user_id,building_id,flat) values(actor,b.id,trim(p_data->>'flat'))
   on conflict(user_id) do update set building_id=excluded.building_id,flat=excluded.flat,verified_at=now() returning * into home;
  update chefos_private.address_attempts set attempts=0 where user_id=actor;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') into result from chefos_private.buildings where active;
 return jsonb_build_object('buildings',result,'household',case when home.user_id is null then null else jsonb_build_object('building_id',home.building_id,'flat',home.flat,'verified',true) end);
end $$;
revoke all on function public.chefos_household(jsonb) from public,anon;
grant execute on function public.chefos_household(jsonb) to authenticated;

-- Legacy labels retain the exact original start/end times, including D5 next day.
create function chefos_private.legacy_wave(p_wave text,p_day date) returns tstzrange language sql immutable set search_path='' as $$
 select tstzrange((p_day+x.start_m*interval '1 minute') at time zone 'Asia/Kolkata',
 (p_day+x.end_m*interval '1 minute') at time zone 'Asia/Kolkata','[)')
 from (values('B1',360,440),('B2',450,530),('B3',540,620),('B4',630,690),('B5',690,750),
 ('L1',720,800),('L2',810,890),('L3',900,980),('L4',990,1050),('L5',1050,1110),
 ('D1',1110,1190),('D2',1200,1280),('D3',1290,1370),('D4',1380,1439),('D5',1440,1500)) x(w,start_m,end_m) where x.w=p_wave
$$;
revoke all on function chefos_private.legacy_wave(text,date) from public,anon,authenticated,service_role;

create function chefos_private.capacity_conflict(p_chef uuid,p_start timestamptz,p_end timestamptz,p_building uuid default null,p_ignore_hold uuid default null,p_legacy boolean default true)
returns boolean language plpgsql stable set search_path='' set timezone='Asia/Kolkata' as $$
declare v record; actual_end timestamptz; gap interval; legacy_range tstzrange; d date;
begin
 if p_end<=p_start then raise exception 'Invalid visit duration'; end if;
 for v in select x.*,h.expires_at from chefos_private.visits x join chefos_private.booking_holds h on h.id=x.hold_id
  where x.chef_id=p_chef and x.state<>'cancelled' and (p_ignore_hold is null or x.hold_id<>p_ignore_hold)
  and (x.state<>'held' or h.expires_at>now())
  and x.starts_at<p_end+interval '1 hour' and (x.ends_at>p_start-interval '1 day' or x.state='cooking' or x.actual_ended_at>p_start-interval '1 hour') loop
  actual_end:=case when v.state='completed' then coalesce(v.actual_ended_at,v.ends_at) when v.state='cooking' and v.ends_at<now() then 'infinity'::timestamptz else v.ends_at end;
  gap:=interval '1 hour';
  if v.building_id=p_building and exists(select 1 from chefos_private.chef_building_gaps g where g.chef_id=p_chef and g.building_id=p_building and g.day=(greatest(v.starts_at,p_start) at time zone 'Asia/Kolkata')::date) then gap:=interval '30 minutes'; end if;
  if p_start<actual_end+gap and v.starts_at<p_end+gap then return true; end if;
 end loop;
 if not p_legacy then return false; end if;
 for d in select tick::date from generate_series((p_start at time zone 'Asia/Kolkata')::date-1,(p_end at time zone 'Asia/Kolkata')::date,interval '1 day') tick loop
  for v in select s.id,m.meal,coalesce(s.meal_wave->>m.meal,case m.meal when 'breakfast' then 'B2' when 'lunch' then 'L2' else 'D2' end) wave
   from public.chefos_subscriptions s cross join lateral unnest(s.meal_type) m(meal)
   where s.chef_id=p_chef and s.schedule_version=1 and s.is_active and d between s.start_date and s.end_date loop
   if exists(select 1 from chefos_private.service_sessions ss where ss.subscription_id=v.id and ss.service_date=d and ss.meal=v.meal and ss.status='completed') then continue; end if;
   legacy_range:=chefos_private.legacy_wave(v.wave,d);
   if legacy_range is null then raise exception 'Unrecognised legacy slot requires ops review'; end if;
   if p_start<upper(legacy_range)+interval '1 hour' and lower(legacy_range)<p_end+interval '1 hour' then return true; end if;
  end loop;
  for v in select * from chefos_private.service_sessions where chef_id=p_chef and service_date=d and visit_id is null loop
   legacy_range:=chefos_private.legacy_wave(v.wave,d);
   if legacy_range is null then raise exception 'Unrecognised legacy session requires ops review'; end if;
   actual_end:=case when v.status='completed' then coalesce(v.completed_at,upper(legacy_range)) when v.status in ('started','end_otp') and upper(legacy_range)<now() then 'infinity'::timestamptz else upper(legacy_range) end;
   if p_start<actual_end+interval '1 hour' and lower(legacy_range)<p_end+interval '1 hour' then return true; end if;
  end loop;
 end loop;
 return false;
end $$;
revoke all on function chefos_private.capacity_conflict(uuid,timestamptz,timestamptz,uuid,uuid,boolean) from public,anon,authenticated,service_role;

create function public.chefos_partner_schedule(p_action text default 'list',p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid:=chefos_private.require_actor(); c public.chefos_chefs%rowtype; slot chefos_private.chef_slots%rowtype; d date; n integer; finish integer; result jsonb;
begin
 select * into c from public.chefos_chefs where user_id=actor and is_active;
 if c.id is null then raise exception 'Chef account required' using errcode='42501'; end if;
 perform 1 from public.chefos_chefs where id=c.id for update;
 if p_action<>'list' and not c.is_verified then raise exception 'Chef verification is required' using errcode='42501'; end if;
 d:=coalesce((p_data->>'date')::date,current_date);
 if d<current_date or d>current_date+90 then raise exception 'Choose a date in the next 90 days'; end if;
 if p_action='save' then
  n:=(p_data->>'start_minute')::integer; finish:=(p_data->>'latest_end_minute')::integer;
  if n is null or finish is null or (p_data->>'weekday')::integer not between 0 and 6
   or coalesce(p_data->>'meal','') not in ('breakfast','lunch','dinner') then raise exception 'Select a weekday, meal and valid time'; end if;
  if n not between 360 and 1320 or finish not between n+60 and 1380 then raise exception 'Allow at least one cooking hour between 6 AM and 11 PM'; end if;
  insert into chefos_private.chef_slots(chef_id,weekday,meal,start_minute,latest_end_minute)
   values(c.id,(p_data->>'weekday')::integer,p_data->>'meal',n,finish)
   on conflict(chef_id,weekday,meal,start_minute) do update set enabled=true,latest_end_minute=greatest(chef_slots.latest_end_minute,excluded.latest_end_minute);
 elsif p_action='remove' then
  select * into slot from chefos_private.chef_slots where id=(p_data->>'slot_id')::uuid and chef_id=c.id for update;
  if slot.id is null then raise exception 'Slot not found'; end if;
  if exists(select 1 from chefos_private.visits v join chefos_private.booking_holds h on h.id=v.hold_id
   where v.chef_id=c.id and v.starts_at>now() and extract(isodow from v.starts_at at time zone 'Asia/Kolkata')::integer-1=slot.weekday
   and extract(hour from v.starts_at at time zone 'Asia/Kolkata')*60+extract(minute from v.starts_at at time zone 'Asia/Kolkata')=slot.start_minute
   and v.state<>'cancelled' and (v.state<>'held' or h.expires_at>now())) then raise exception 'This time has a confirmed booking or checkout hold'; end if;
  update chefos_private.chef_slots set enabled=false where id=slot.id;
 elsif p_action='leave' then
  if exists(select 1 from chefos_private.visits v join chefos_private.booking_holds h on h.id=v.hold_id where v.chef_id=c.id and (v.starts_at at time zone 'Asia/Kolkata')::date=d and v.state<>'cancelled' and (v.state<>'held' or h.expires_at>now()))
   or exists(select 1 from public.chefos_subscriptions s where s.chef_id=c.id and s.is_active and d between s.start_date and s.end_date) then raise exception 'Bookings must be reassigned before taking leave'; end if;
  insert into chefos_private.chef_leave(chef_id,day) values(c.id,d) on conflict do nothing;
 elsif p_action='clear_leave' then delete from chefos_private.chef_leave where chef_id=c.id and day=d;
 elsif p_action='confirm_gap' then
  if not exists(select 1 from chefos_private.buildings where id=(p_data->>'building_id')::uuid and active) then raise exception 'Verified building required'; end if;
  insert into chefos_private.chef_building_gaps(chef_id,building_id,day) values(c.id,(p_data->>'building_id')::uuid,d) on conflict do nothing;
 elsif p_action<>'list' then raise exception 'Unknown schedule action'; end if;
 if p_action<>'list' then insert into chefos_private.audit_log(actor,action,object_id,changes) values(actor,'schedule.'||p_action,c.id::text,p_data-'code'); end if;
 select jsonb_build_object('slots',(select coalesce(jsonb_agg(to_jsonb(s) order by weekday,start_minute),'[]') from chefos_private.chef_slots s where chef_id=c.id and enabled),
  'leave_dates',(select coalesce(jsonb_agg(day order by day),'[]') from chefos_private.chef_leave where chef_id=c.id and day>=current_date),
  'buildings',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') from chefos_private.buildings where active),
  'gap_confirmations',(select coalesce(jsonb_agg(jsonb_build_object('date',day,'building_id',building_id,'minutes',30)),'[]') from chefos_private.chef_building_gaps where chef_id=c.id and day>=current_date),
  'visits',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'starts_at',v.starts_at,'ends_at',v.ends_at,'meals',v.meals,'state',v.state) order by v.starts_at),'[]') from chefos_private.visits v join chefos_private.booking_holds h on h.id=v.hold_id
   where v.chef_id=c.id and v.starts_at>=current_date at time zone 'Asia/Kolkata' and v.state<>'cancelled' and (v.state<>'held' or h.expires_at>now()))) into result;
 return result;
end $$;
revoke all on function public.chefos_partner_schedule(text,jsonb) from public,anon;
grant execute on function public.chefos_partner_schedule(text,jsonb) to authenticated;
