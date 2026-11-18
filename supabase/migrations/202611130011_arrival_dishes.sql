create function public.chefos_arrival_menu(p_session uuid,p_action text default 'get',p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=chefos_private.require_actor(); ss chefos_private.service_sessions%rowtype; c public.chefos_chefs%rowtype;
 ctx chefos_private.instant_bookings%rowtype; agreed_recipes jsonb; recipe jsonb; meal text; ingredient jsonb;
begin
 select * into ss from chefos_private.service_sessions where id=p_session;
 select * into c from public.chefos_chefs where id=ss.chef_id;
 if ss.id is null or (actor<>ss.user_id and actor<>c.user_id) then raise exception 'This session is not assigned to you' using errcode='42501'; end if;
 if actor=c.user_id and (not c.is_active or not c.is_verified) then raise exception 'Verified active chef required' using errcode='42501'; end if;
 perform 1 from public.chefos_chefs where id=c.id for update;
 select * into ss from chefos_private.service_sessions where id=p_session for update;
 select * into ctx from chefos_private.instant_bookings where request_id=ss.instant_request_id for update;
 if ctx.request_id is null then raise exception 'This is not an instant visit'; end if;
 if p_action<>'get' then
  if ss.started_at is not null or ss.status in ('started','paused','end_otp','completed') then raise exception 'The cooking recipes are already locked'; end if;
  if not exists(select 1 from chefos_private.session_evidence where session_id=ss.id and arrived_at is not null) then raise exception 'Agree on the dishes together after chef arrival'; end if;
  if (p_data->>'version')::integer is distinct from ctx.version then raise exception 'Dishes changed. Reload before confirming.' using errcode='40001'; end if;
  if p_action='save' then
   if actor<>c.user_id then raise exception 'The assigned chef records the agreed dishes' using errcode='42501'; end if;
   if p_data->'restrictions_reviewed' is distinct from 'true'::jsonb then raise exception 'Review the customer allergy and food notes together'; end if;
   agreed_recipes:=p_data->'recipes';
   if jsonb_typeof(agreed_recipes) is distinct from 'object' or (select count(*) from jsonb_object_keys(agreed_recipes))<>cardinality(ctx.meals) then raise exception 'Record a recipe for each booked meal'; end if;
   foreach meal in array ctx.meals loop
    recipe:=agreed_recipes->meal;
    if jsonb_typeof(recipe) is distinct from 'object' or length(trim(coalesce(recipe->>'title',''))) not between 2 and 160
     or jsonb_typeof(recipe->'ingredients') is distinct from 'array' or jsonb_typeof(recipe->'steps') is distinct from 'array' then raise exception 'Each dish needs a title, ingredients and cooking steps'; end if;
    if jsonb_array_length(recipe->'ingredients') not between 1 and 50 or jsonb_array_length(recipe->'steps') not between 1 and 30
     or length(coalesce(recipe->>'storage_notes',''))>1000 or (recipe->>'servings')::integer is distinct from ctx.people_count
     or (recipe->>'cooking_minutes')::integer is null or (recipe->>'cooking_minutes')::integer not between 1 and 60 then raise exception 'Check servings, duration and recipe details'; end if;
    for ingredient in select value from jsonb_array_elements(recipe->'ingredients') loop
     if jsonb_typeof(ingredient) is distinct from 'string' or length(trim(ingredient#>>'{}')) not between 2 and 200 then raise exception 'List ingredients and quantities in plain text'; end if;
    end loop;
    for ingredient in select value from jsonb_array_elements(recipe->'steps') loop
     if jsonb_typeof(ingredient) is distinct from 'string' or length(trim(ingredient#>>'{}')) not between 2 and 1000 then raise exception 'List the cooking steps in plain text'; end if;
    end loop;
    -- Store only the fields the cooking screen uses.
    agreed_recipes:=jsonb_set(agreed_recipes,array[meal],jsonb_build_object('title',trim(recipe->>'title'),'servings',ctx.people_count,'cooking_minutes',(recipe->>'cooking_minutes')::integer,
     'ingredients',recipe->'ingredients','steps',recipe->'steps','storage_notes',coalesce(recipe->>'storage_notes','')));
   end loop;
   update chefos_private.instant_bookings set recipes=agreed_recipes,version=version+1,accepted_version=null,updated_at=now() where request_id=ctx.request_id returning * into ctx;
  elsif p_action='accept' then
   if actor<>ss.user_id then raise exception 'Only this customer can confirm the dishes' using errcode='42501'; end if;
   if ctx.recipes is null then raise exception 'Wait for your chef to record the agreed dishes'; end if;
   update chefos_private.instant_bookings set accepted_version=version where request_id=ctx.request_id returning * into ctx;
  else raise exception 'Unknown arrival-menu action'; end if;
 end if;
 return jsonb_build_object('instant',true,'version',ctx.version,'accepted',ctx.accepted_version=ctx.version,'recipes',ctx.recipes,'food_notes',ctx.food_notes,'meals',ctx.meals,'people_count',ctx.people_count);
end $$;
revoke all on function public.chefos_arrival_menu(uuid,text,jsonb) from public,anon;
grant execute on function public.chefos_arrival_menu(uuid,text,jsonb) to authenticated;

-- Instant visits use the chef/customer agreement; subscriptions keep AI menus.
alter function chefos_private.session_menu(uuid) rename to subscription_session_menu;
create function chefos_private.session_menu(p_session uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare ss chefos_private.service_sessions%rowtype; ctx chefos_private.instant_bookings%rowtype;
begin
 select * into ss from chefos_private.service_sessions where id=p_session;
 if ss.recipe_snapshot is not null then return ss.recipe_snapshot; end if;
 if ss.instant_request_id is null then return chefos_private.subscription_session_menu(p_session); end if;
 select * into ctx from chefos_private.instant_bookings where request_id=ss.instant_request_id;
 if ctx.recipes is null or ctx.accepted_version is distinct from ctx.version then raise exception 'Agree on the dishes with the customer and request their confirmation before cooking'; end if;
 return jsonb_build_object('menu_id',ctx.request_id,'version',ctx.version,'recipes',ctx.recipes,'needs_review',false,'food_notes',jsonb_build_object('instructions',ctx.food_notes),'source','arrival_agreement');
end $$;
revoke all on function chefos_private.session_menu(uuid) from public,anon,authenticated,service_role;

-- A delay or early instant arrival must never create overlap with another home.
create function chefos_private.check_actual_start(p_session uuid,p_commit boolean default false) returns void language plpgsql set search_path='' as $$
declare ss chefos_private.service_sessions%rowtype; v chefos_private.visits%rowtype; finish timestamptz;
begin
 select * into ss from chefos_private.service_sessions where id=p_session;
 if ss.started_at is not null then return; end if;
 select * into v from chefos_private.visits where id=ss.visit_id for update;
 if ss.instant_request_id is null and now()<v.starts_at then raise exception 'It is not the booked cooking start time yet'; end if;
 finish:=now()+cardinality(v.meals)*interval '1 hour';
 if chefos_private.capacity_conflict(ss.chef_id,now(),finish,v.building_id,v.hold_id) then raise exception 'The available cooking window changed. Contact support before starting.'; end if;
 if p_commit then update chefos_private.visits set starts_at=now(),ends_at=finish where id=v.id; end if;
end $$;
revoke all on function chefos_private.check_actual_start(uuid,boolean) from public,anon,authenticated,service_role;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.chefos_service_action(uuid,text,text)'::regprocedure);
 definition:=replace(definition,'menu:=chefos_private.session_menu(ss.id);','if p_action in (''start.request'',''start.verify'') then perform chefos_private.check_actual_start(ss.id); end if; menu:=chefos_private.session_menu(ss.id);');
 definition:=replace(definition,'update chefos_private.service_sessions set recipe_snapshot=coalesce(recipe_snapshot,menu) where id=ss.id;',
  'if ss.started_at is null then perform chefos_private.check_actual_start(ss.id,true); end if; update chefos_private.service_sessions set recipe_snapshot=coalesce(recipe_snapshot,menu) where id=ss.id;');
 execute definition;
end $$;
