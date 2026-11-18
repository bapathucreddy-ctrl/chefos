begin;
do $$begin
 if to_regclass('public.chefos_chefs_test') is null or to_regclass('chefos_test_private.chef_locations_test') is null then
  raise exception 'Apply the isolated _test table migration before seeding';
 end if;
end $$;

insert into public.chefos_profiles_test(id,username,email,phone,role,is_active)
 select id,username,email,phone,role,is_active from public.chefos_profiles where role='admin' on conflict(id) do nothing;

insert into chefos_test_private.buildings_test(id,name,latitude,longitude,code_hash) values
 ('eeee1000-0000-4000-8000-000000000001','TEST Whitefield Homes',12.9698,77.7499,encode(sha256(convert_to('CHEFOS-TEST-WHITEFIELD-2026','UTF8')),'hex')),
 ('eeee1000-0000-4000-8000-000000000002','TEST Kodigehalli Road Homes',13.0275,77.7090,encode(sha256(convert_to('CHEFOS-TEST-KODIGEHALLI-2026','UTF8')),'hex')),
 ('eeee1000-0000-4000-8000-000000000003','TEST KR Puram Homes',13.0086,77.6950,encode(sha256(convert_to('CHEFOS-TEST-KRPURAM-2026','UTF8')),'hex'))
 on conflict(id) do update set name=excluded.name,latitude=excluded.latitude,longitude=excluded.longitude;

with people as (
 select i,('eeee0000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid id,
  (array['Asha Rao','Ravi Kumar','Meera Nair','Arjun Singh','Fatima Khan','Vikram Das','Anita Sharma','Suresh Reddy','Neha Patel','Rahul Nair','Sana Ali','Kiran Rao','Divya Menon','Manoj Kumar','Priya Shah','Deepak Singh','Farah Ahmed','Rohit Reddy'])[i] name,
  (array['South Indian','North Indian','Hyderabadi','Asian','Kerala','Andhra'])[((i-1)%6)+1] speciality,
  (array['south_indian','north_indian','hyderabadi','asian','kerala','andhra'])[((i-1)%6)+1] cuisine,
  case when i<=6 then 'Whitefield' when i<=12 then 'Kodigehalli Road, KR Puram' else 'KR Puram' end area
 from generate_series(1,18) i
)
insert into public.chefos_chefs_test(id,name,speciality,rating,is_verified,is_available,is_active,cuisines,photo_url,bio)
 select id,'Test '||name,speciality,4.4+((i-1)%6)*0.1,true,true,true,array[cuisine],
  '',
  'Synthetic chef for Chefos testing in '||area||'. GPS movement in test mode may be simulated.' from people
 on conflict(id) do update set name=excluded.name,speciality=excluded.speciality,rating=excluded.rating,cuisines=excluded.cuisines,photo_url=excluded.photo_url,bio=excluded.bio;

insert into chefos_test_private.chef_rate_inputs_test(chef_id,subscriber_ratings,tenure_months,meals_served,certified_specialty)
 select id,40,6,300,true from public.chefos_chefs_test where id::text like 'eeee0000-%' on conflict(chef_id) do nothing;

select setseed(0.314159);
insert into chefos_test_private.chef_locations_test(chef_id,latitude,longitude,recorded_at,accuracy,heading,speed)
 select c.id,b.latitude+(random()-0.5)*0.006,b.longitude+(random()-0.5)*0.006,now(),8,0,0
 from public.chefos_chefs_test c join chefos_test_private.buildings_test b
 on b.id=('eeee1000-0000-4000-8000-'||lpad((case when right(c.id::text,12)::integer<=6 then 1 when right(c.id::text,12)::integer<=12 then 2 else 3 end)::text,12,'0'))::uuid
 where c.id::text like 'eeee0000-%'
 on conflict(chef_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,recorded_at=now(),updated_at=now(),accuracy=8;
insert into public.chefos_live_locations_test(chef_id,latitude,longitude,recorded_at,accuracy,heading,speed,source)
 select chef_id,latitude,longitude,now(),accuracy,heading,speed,'test_simulation' from chefos_test_private.chef_locations_test where chef_id::text like 'eeee0000-%'
 on conflict(chef_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,recorded_at=now(),updated_at=now(),source='test_simulation';
commit;

select count(*) as synthetic_chefs from public.chefos_chefs_test where id::text like 'eeee0000-%';
