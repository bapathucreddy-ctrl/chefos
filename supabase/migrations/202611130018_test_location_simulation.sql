-- Simulation is confined to the explicitly seeded chef IDs in the test tables.
create function public.chefos_simulate_locations_test() returns jsonb
language plpgsql security definer set search_path='' as $$
declare changed integer; tick double precision:=extract(epoch from clock_timestamp());
begin
 if not public.chefos_is_admin_test() then raise exception 'Test administrator access required' using errcode='42501'; end if;
 with positions as (
  select c.id,b.latitude+sin(tick/90+right(c.id::text,12)::integer)*0.0025 latitude,
   b.longitude+cos(tick/90+right(c.id::text,12)::integer)*0.0025 longitude,
   mod((tick/90*180/pi()+right(c.id::text,12)::integer*20)::numeric,360) heading
  from public.chefos_chefs_test c join chefos_test_private.buildings_test b
   on b.id=('eeee1000-0000-4000-8000-'||lpad((case when right(c.id::text,12)::integer<=6 then 1 when right(c.id::text,12)::integer<=12 then 2 else 3 end)::text,12,'0'))::uuid
  where c.id::text like 'eeee0000-%'
 ), updated as (
  update chefos_test_private.chef_locations_test l set latitude=p.latitude,longitude=p.longitude,heading=p.heading,
   recorded_at=now(),updated_at=now(),accuracy=8,speed=3 from positions p where l.chef_id=p.id returning l.*
 ) insert into public.chefos_live_locations_test(chef_id,latitude,longitude,heading,accuracy,speed,recorded_at,source)
 select chef_id,latitude,longitude,heading,accuracy,speed,recorded_at,'test_simulation' from updated
 on conflict(chef_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,heading=excluded.heading,
  recorded_at=now(),updated_at=now(),source='test_simulation';
 get diagnostics changed=row_count;
 return jsonb_build_object('updated',changed,'source','test_simulation');
end $$;
revoke all on function public.chefos_simulate_locations_test() from public,anon;
grant execute on function public.chefos_simulate_locations_test() to authenticated;

do $$declare definition text;begin
 definition:=pg_get_functiondef('public.chefos_discovery_map_test(numeric,numeric,numeric)'::regprocedure);
 definition:=replace(definition,'and l.updated_at>now()-interval ''2 minutes''',
  'and (l.updated_at>now()-interval ''2 minutes'' or exists(select 1 from public.chefos_live_locations_test simulation where simulation.chef_id=c.id and simulation.source=''test_simulation''))');
 definition:=replace(definition,'''accuracy'',l.accuracy','''accuracy'',l.accuracy,''is_simulated'',exists(select 1 from public.chefos_live_locations_test simulation where simulation.chef_id=c.id and simulation.source=''test_simulation'')');
 if definition not like '%is_simulated%' then raise exception 'Could not configure test map simulation'; end if;
 execute definition;
 definition:=pg_get_functiondef('chefos_test_private.instant_available(uuid,uuid,text[],uuid)'::regprocedure);
 definition:=replace(definition,'loc.updated_at<now()-interval ''30 minutes''',
  '(loc.updated_at<now()-interval ''30 minutes'' and not exists(select 1 from public.chefos_live_locations_test simulation where simulation.chef_id=c.id and simulation.source=''test_simulation''))');
 execute definition;
end $$;
