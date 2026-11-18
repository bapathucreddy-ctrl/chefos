alter table chefos_private.chef_locations add column recorded_at timestamptz;
alter table chefos_private.chef_locations add column accuracy numeric;
alter table chefos_private.chef_locations add column heading numeric;
alter table chefos_private.chef_locations add column speed numeric;

create table public.chefos_live_locations (
 chef_id uuid primary key references public.chefos_chefs(id) on delete cascade,
 latitude numeric not null check(latitude between -90 and 90),
 longitude numeric not null check(longitude between -180 and 180),
 accuracy numeric, heading numeric, speed numeric,
 recorded_at timestamptz not null, updated_at timestamptz not null default now(),
 source text not null default 'gps' check(source in ('gps','test_simulation'))
);
alter table public.chefos_live_locations enable row level security;
revoke all on public.chefos_live_locations from public,anon,authenticated;
grant select on public.chefos_live_locations to authenticated;
grant all on public.chefos_live_locations to service_role;

create function public.chefos_can_read_location(p_chef uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.chefos_profiles p join public.chefos_chefs c on c.id=p_chef
  where p.id=auth.uid() and p.is_active and c.is_active and c.is_verified
   and (c.user_id=p.id or p.role='admin' or (p.role='customer' and (
    c.is_available or exists(select 1 from chefos_private.service_sessions ss
     where ss.chef_id=c.id and ss.user_id=p.id and ss.journey_started_at is not null
      and ss.status<>'completed' and ss.service_date=(now() at time zone 'Asia/Kolkata')::date)))))
$$;
revoke all on function public.chefos_can_read_location(uuid) from public,anon;
grant execute on function public.chefos_can_read_location(uuid) to authenticated;
create policy chefos_location_read on public.chefos_live_locations for select to authenticated
 using(public.chefos_can_read_location(chef_id));

create function public.chefos_update_location(p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid:=chefos_private.require_actor(); chef public.chefos_chefs%rowtype;
 lat numeric:=(p_data->>'latitude')::numeric; lng numeric:=(p_data->>'longitude')::numeric;
 stamp timestamptz:=coalesce((p_data->>'recorded_at')::timestamptz,now());
 session_id uuid:=(p_data->>'session_id')::uuid; changed integer;
 acc numeric:=(p_data->>'accuracy')::numeric; direction numeric:=(p_data->>'heading')::numeric; velocity numeric:=(p_data->>'speed')::numeric;
begin
 select * into chef from public.chefos_chefs where user_id=actor and is_verified and is_active for update;
 if chef.id is null then raise exception 'Verified chef account required' using errcode='42501'; end if;
 if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180
  or acc<0 or acc>10000 or direction<0 or direction>=360 or velocity<0 or velocity>150 then raise exception 'Invalid GPS location'; end if;
 if stamp>now()+interval '30 seconds' then raise exception 'Location timestamp is ahead of server time'; end if;
 if stamp<now()-interval '2 minutes' then return '{"accepted":false,"reason":"stale"}'; end if;
 if session_id is not null and not exists(select 1 from chefos_private.service_sessions
  where id=session_id and chef_id=chef.id and status<>'completed' and journey_started_at is not null and service_date=current_date) then
  raise exception 'Location sharing is not active for this visit' using errcode='42501';
 end if;
 insert into public.chefos_live_locations as current_position(chef_id,latitude,longitude,accuracy,heading,speed,recorded_at)
 values(chef.id,lat,lng,acc,direction,velocity,stamp)
 on conflict(chef_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,accuracy=excluded.accuracy,
  heading=excluded.heading,speed=excluded.speed,recorded_at=excluded.recorded_at,updated_at=now(),source='gps'
  where current_position.recorded_at<excluded.recorded_at;
 get diagnostics changed=row_count;
 if changed=0 then return '{"accepted":false,"reason":"out_of_order"}'; end if;
 insert into chefos_private.chef_locations(chef_id,latitude,longitude,accuracy,heading,speed,recorded_at)
 values(chef.id,lat,lng,acc,direction,velocity,stamp)
 on conflict(chef_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,accuracy=excluded.accuracy,
  heading=excluded.heading,speed=excluded.speed,recorded_at=excluded.recorded_at,updated_at=now();
 return jsonb_build_object('accepted',true,'recorded_at',stamp);
end $$;
revoke all on function public.chefos_update_location(jsonb) from public,anon;
grant execute on function public.chefos_update_location(jsonb) to authenticated;

create function public.chefos_live_tracking(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid:=chefos_private.require_actor(); ss chefos_private.service_sessions%rowtype; result jsonb;
begin
 select * into ss from chefos_private.service_sessions where id=p_session;
 if ss.id is null or not exists(select 1 from public.chefos_chefs c where c.id=ss.chef_id and c.is_active and c.is_verified
  and (ss.user_id=actor or c.user_id=actor)) then raise exception 'This visit is not assigned to you' using errcode='42501'; end if;
 select jsonb_build_object('session_id',ss.id,'status',ss.status,'journey_started',ss.journey_started_at is not null,
  'chef',jsonb_build_object('id',c.id,'name',c.name,'photo_url',c.photo_url),
  'destination',case when b.id is null then null else jsonb_build_object('id',b.id,'name',b.name,'latitude',b.latitude,'longitude',b.longitude,'kind','home') end,
  'location',case when ss.journey_started_at is not null and ss.status<>'completed' and ss.service_date=current_date and l.chef_id is not null
   then to_jsonb(l)||jsonb_build_object('id',c.id,'name',c.name,'kind','chef','is_live',l.recorded_at>now()-interval '30 seconds') else null end)
 into result from public.chefos_chefs c left join public.chefos_live_locations l on l.chef_id=c.id
 left join chefos_private.visits v on v.id=ss.visit_id left join chefos_private.buildings b on b.id=v.building_id where c.id=ss.chef_id;
 return result;
end $$;
revoke all on function public.chefos_live_tracking(uuid) from public,anon;
grant execute on function public.chefos_live_tracking(uuid) to authenticated;

create or replace function public.chefos_discovery_map(p_lat numeric default null,p_lng numeric default null,p_radius numeric default 5)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=chefos_private.require_actor(); radius numeric; result jsonb;
begin
 if (p_lat is null)<>(p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Choose a valid map location'; end if;
 radius:=least(5,greatest(0.5,coalesce(p_radius,5)));
 select jsonb_build_object('chefs',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,
  'latitude',l.latitude,'longitude',l.longitude,'recorded_at',coalesce(l.recorded_at,l.updated_at),
  'is_live',l.recorded_at>now()-interval '30 seconds','heading',l.heading,'accuracy',l.accuracy)),'[]')
  from public.chefos_chefs c join chefos_private.chef_locations l on l.chef_id=c.id
  where c.is_active and c.is_verified and c.is_available and l.updated_at>now()-interval '2 minutes'
   and (p_lat is null or chefos_private.distance_km(p_lat,p_lng,l.latitude,l.longitude)<=radius)),
  'buildings',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'latitude',b.latitude,'longitude',b.longitude,'kind','home') order by b.name),'[]') from chefos_private.buildings b where b.active)) into result;
 return result;
end $$;

do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.chefos_live_locations;
 end if;
end $$;
