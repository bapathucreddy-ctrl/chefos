-- Health measurements stay private. Clients use the owner-scoped RPC only.
create table chefos_private.diet_profiles (
 user_id uuid primary key references public.chefos_profiles(id) on delete cascade,
 profile jsonb not null,
 bmi numeric(5,1) not null,
 review_required boolean not null,
 revision integer not null default 1 check(revision>0),
 consented_at timestamptz not null,
 updated_at timestamptz not null default now()
);
alter table chefos_private.diet_profiles enable row level security;
revoke all on chefos_private.diet_profiles from public,anon,authenticated,service_role;

create function public.chefos_diet_profile(p_profile jsonb default null,p_expected_revision integer default null)
returns jsonb language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare
 actor uuid:=chefos_private.require_actor(); saved chefos_private.diet_profiles%rowtype;
 age_value integer; height_value numeric; weight_value numeric; body jsonb;
 field text; item jsonb; needs_review boolean;
begin
 if not exists(select 1 from public.chefos_profiles where id=actor and role='customer') then
  raise exception 'Customer account required' using errcode='42501';
 end if;
 -- Serialize first saves as well as updates; an absent diet row cannot be locked.
 perform 1 from public.chefos_profiles where id=actor for update;
 select * into saved from chefos_private.diet_profiles where user_id=actor for update;
 if p_profile is null then
  if saved.user_id is null then return jsonb_build_object('profile',null,'revision',0,'ready',false); end if;
  return jsonb_build_object('profile',saved.profile,'bmi',saved.bmi,'review_required',saved.review_required,
   'revision',saved.revision,'ready',true,'updated_at',saved.updated_at);
 end if;
 if coalesce(p_expected_revision,-1)<>coalesce(saved.revision,0) then
  raise exception 'Your food profile changed elsewhere. Reload it before saving.' using errcode='40001';
 end if;
 if jsonb_typeof(p_profile)<>'object' then raise exception 'Food profile must be an object'; end if;
 if exists(select 1 from jsonb_object_keys(p_profile) k where k not in
  ('age','height_cm','weight_kg','activity_level','goal','diet','cuisines','allergens',
   'other_restrictions','dislikes','non_veg_days','cheat_meal_day','allergies_confirmed','personalisation_consent')) then
  raise exception 'Unsupported food profile field';
 end if;
 if coalesce(p_profile->>'age','') !~ '^[0-9]{1,3}$'
  or coalesce(p_profile->>'height_cm','') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$'
  or coalesce(p_profile->>'weight_kg','') !~ '^[0-9]{1,3}(\.[0-9]{1,2})?$' then
  raise exception 'Enter age, height in centimetres and weight in kilograms';
 end if;
 age_value:=(p_profile->>'age')::integer;
 height_value:=(p_profile->>'height_cm')::numeric; weight_value:=(p_profile->>'weight_kg')::numeric;
 if age_value not between 1 and 120 or height_value not between 50 and 250 or weight_value not between 10 and 500 then
  raise exception 'Check your age, height and weight';
 end if;
 if coalesce(p_profile->>'activity_level','') not in ('sedentary','light','moderate','active')
  or coalesce(p_profile->>'goal','') not in ('healthy_eating','maintenance','fat_loss','muscle_gain')
  or coalesce(p_profile->>'diet','') not in ('vegetarian','non_vegetarian','vegan','pescatarian') then
  raise exception 'Choose your activity level, food goal and diet';
 end if;
 foreach field in array array['cuisines','allergens','non_veg_days'] loop
  if coalesce(jsonb_typeof(p_profile->field),'null')<>'array' then raise exception 'Invalid % selection',field; end if;
  if jsonb_array_length(p_profile->field)>20 then raise exception 'Too many % selections',field; end if;
  if exists(select 1 from jsonb_array_elements(p_profile->field) x group by x having count(*)>1) then raise exception 'Duplicate % selection',field; end if;
 end loop;
 if jsonb_array_length(p_profile->'cuisines')=0 then raise exception 'Choose at least one cuisine'; end if;
 for item in select value from jsonb_array_elements(p_profile->'cuisines') loop
  if jsonb_typeof(item)<>'string' or item#>>'{}' not in
   ('south_indian','north_indian','hyderabadi','andhra','kerala','tamil','punjabi','gujarati','maharashtrian','bengali','asian','continental') then
   raise exception 'Unsupported cuisine';
  end if;
 end loop;
 for item in select value from jsonb_array_elements(p_profile->'allergens') loop
  if jsonb_typeof(item)<>'string' or item#>>'{}' not in
   ('milk','eggs','fish','shellfish','peanuts','tree_nuts','wheat','soy','sesame') then raise exception 'Unsupported allergen'; end if;
 end loop;
 for item in select value from jsonb_array_elements(p_profile->'non_veg_days') loop
  if jsonb_typeof(item)<>'number' or item#>>'{}' !~ '^[0-6]$' then raise exception 'Invalid non-vegetarian day'; end if;
 end loop;
 if p_profile->>'diet' in ('vegetarian','vegan') and jsonb_array_length(p_profile->'non_veg_days')<>0 then
  raise exception 'Vegetarian and vegan profiles cannot include non-vegetarian days';
 end if;
 if p_profile->>'diet' in ('non_vegetarian','pescatarian') and jsonb_array_length(p_profile->'non_veg_days')=0 then
  raise exception 'Choose your non-vegetarian days';
 end if;
 if p_profile ? 'cheat_meal_day' and p_profile->'cheat_meal_day'<>'null'::jsonb
  and (jsonb_typeof(p_profile->'cheat_meal_day')<>'number' or p_profile->>'cheat_meal_day' !~ '^[0-6]$') then
  raise exception 'Invalid cheat-meal day';
 end if;
 if coalesce(jsonb_typeof(p_profile->'other_restrictions'),'string')<>'string'
  or coalesce(jsonb_typeof(p_profile->'dislikes'),'string')<>'string'
  or length(coalesce(p_profile->>'other_restrictions',''))>1000 or length(coalesce(p_profile->>'dislikes',''))>500 then
  raise exception 'Keep restrictions under 1000 characters and dislikes under 500';
 end if;
 if p_profile->'allergies_confirmed' is distinct from 'true'::jsonb
  or p_profile->'personalisation_consent' is distinct from 'true'::jsonb then
  raise exception 'Confirm your allergy selections and consent to personalised menu planning';
 end if;
 body:=p_profile||jsonb_build_object('age',age_value,'height_cm',height_value,'weight_kg',weight_value,
  'other_restrictions',trim(coalesce(p_profile->>'other_restrictions','')),
  'dislikes',trim(coalesce(p_profile->>'dislikes','')),'cheat_meal_day',p_profile->'cheat_meal_day');
 needs_review:=age_value<18 or jsonb_array_length(body->'allergens')>0 or length(body->>'other_restrictions')>0;
 insert into chefos_private.diet_profiles(user_id,profile,bmi,review_required,revision,consented_at)
 values(actor,body,round(weight_value/power(height_value/100,2),1),needs_review,1,now())
 on conflict(user_id) do update set profile=excluded.profile,bmi=excluded.bmi,
  review_required=excluded.review_required,revision=diet_profiles.revision+1,
  consented_at=case when diet_profiles.profile->'personalisation_consent'='true'::jsonb then diet_profiles.consented_at else now() end,
  updated_at=now()
 returning * into saved;
 return jsonb_build_object('profile',saved.profile,'bmi',saved.bmi,'review_required',saved.review_required,
  'revision',saved.revision,'ready',true,'updated_at',saved.updated_at);
end $$;
revoke all on function public.chefos_diet_profile(jsonb,integer) from public,anon,authenticated;
grant execute on function public.chefos_diet_profile(jsonb,integer) to authenticated;

-- Existing paid plans and captured orders are unchanged. Only preparation of a
-- new subscription order now requires the typed profile, including on old APKs.
alter function public.chefos_server_prepare_order(uuid,jsonb) set schema chefos_private;
revoke all on function chefos_private.chefos_server_prepare_order(uuid,jsonb) from public,anon,authenticated,service_role;
create function public.chefos_server_prepare_order(p_actor uuid,p_booking jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
begin
 if not exists(select 1 from public.chefos_profiles where id=p_actor and role='customer' and is_active) then
  raise exception 'Active customer required' using errcode='42501';
 end if;
 if not exists(select 1 from chefos_private.diet_profiles where user_id=p_actor) then
  raise exception 'Complete your food and health preferences before subscribing';
 end if;
 return chefos_private.chefos_server_prepare_order(p_actor,p_booking);
end $$;
revoke all on function public.chefos_server_prepare_order(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.chefos_server_prepare_order(uuid,jsonb) to service_role;
