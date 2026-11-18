create table chefos_private.menus (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.chefos_profiles(id),
 subscription_id uuid references public.chefos_subscriptions(id), start_date date not null, end_date date not null,
 meals text[] not null, people_count integer not null check(people_count between 1 and 8),
 profile_revision integer not null, document jsonb not null, provider text not null,
 version integer not null default 1, accepted_version integer, needs_review boolean not null default false,
 chef_reviewed_version integer, stale boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(subscription_id,start_date)
);
create table chefos_private.menu_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.chefos_profiles(id),
 subscription_id uuid references public.chefos_subscriptions(id), target_menu uuid references chefos_private.menus(id),
 request_key text not null unique, kind text not null check(kind in ('preview','weekly','swap')),
 start_date date not null, end_date date not null, meals text[] not null, people_count integer not null,
 profile_revision integer not null, expected_version integer, replacement_request text,
 state text not null default 'pending' check(state in ('pending','running','ready','retry','failed')),
 attempts integer not null default 0, claim_token uuid, lease_until timestamptz,
 next_attempt_at timestamptz not null default now(), last_error text,
 result_menu uuid references chefos_private.menus(id), created_at timestamptz not null default now()
);
create index chefos_due_menu_jobs on chefos_private.menu_jobs(state,next_attempt_at);
alter table chefos_private.menus enable row level security;
alter table chefos_private.menu_jobs enable row level security;
revoke all on chefos_private.menus,chefos_private.menu_jobs from public,anon,authenticated,service_role;

create function chefos_private.menu_result(p_job uuid,p_actor uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('job_id',j.id,'state',j.state,'detail',j.last_error,
 'menu',case when m.id is null then null else jsonb_build_object('id',m.id,'version',m.version,'accepted',m.accepted_version=m.version,
 'start_date',m.start_date,'end_date',m.end_date,'document',m.document,'provider',m.provider,'needs_chef_review',m.needs_review and m.chef_reviewed_version is distinct from m.version,'stale',m.stale) end)
 from chefos_private.menu_jobs j left join chefos_private.menus m on m.id=j.result_menu where j.id=p_job and j.user_id=p_actor
$$;
revoke all on function chefos_private.menu_result(uuid,uuid) from public,anon,authenticated,service_role;

create function public.chefos_menu_request(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid:=chefos_private.require_actor(); profile chefos_private.diet_profiles%rowtype; m chefos_private.menus%rowtype;
 j chefos_private.menu_jobs%rowtype; start_on date; stop_on date; chosen_meals text[]; people integer; key text; result jsonb; current_sub public.chefos_subscriptions%rowtype;
begin
 if not exists(select 1 from public.chefos_profiles where id=actor and role='customer') then raise exception 'Customer account required' using errcode='42501'; end if;
 perform 1 from public.chefos_profiles where id=actor for update;
 select * into profile from chefos_private.diet_profiles where user_id=actor;
 if p_action='job' then
  result:=chefos_private.menu_result((p_data->>'job_id')::uuid,actor);
  if result is null then raise exception 'Menu request not found' using errcode='42501'; end if; return result;
 elsif p_action='current' then
  select * into current_sub from public.chefos_subscriptions where user_id=actor and is_active and end_date>=current_date order by start_date limit 1;
  if current_sub.id is null then return jsonb_build_object('menu',null,'detail','Your personalised menu appears here with an active plan.'); end if;
  select * into m from chefos_private.menus where subscription_id=current_sub.id and greatest(current_date,current_sub.start_date) between start_date and end_date;
  if m.id is null then return jsonb_build_object('menu',null,'detail','Your menu is being prepared.'); end if;
  return jsonb_build_object('menu',jsonb_build_object('id',m.id,'version',m.version,'accepted',m.accepted_version=m.version,'start_date',m.start_date,'end_date',m.end_date,'document',m.document,'provider',m.provider,'stale',m.stale,'needs_chef_review',m.needs_review and m.chef_reviewed_version is distinct from m.version));
 elsif p_action='accept' then
  select * into m from chefos_private.menus where id=(p_data->>'menu_id')::uuid and user_id=actor for update;
  if m.id is null or m.version is distinct from (p_data->>'version')::integer or m.stale or profile.revision is distinct from m.profile_revision then raise exception 'Menu changed. Reload it before confirming.' using errcode='40001'; end if;
  update chefos_private.menus set accepted_version=version where id=m.id;
  return jsonb_build_object('accepted',true,'menu_id',m.id,'version',m.version);
 end if;
 if profile.user_id is null then raise exception 'Complete your food and health profile first'; end if;
 if p_action='preview' then
  start_on:=(p_data->>'start_date')::date;
  if start_on is null or start_on<current_date or start_on>current_date+90 then raise exception 'Invalid menu start date'; end if;
  stop_on:=start_on+6; people:=(p_data->>'people_count')::integer;
  select array_agg(value order by value) into chosen_meals from jsonb_array_elements_text(p_data->'meal_type');
  if people is null or people not between 1 and 8 or chosen_meals is null or cardinality(chosen_meals) not between 1 and 3 or not chosen_meals <@ array['breakfast','lunch','dinner']::text[] or cardinality(chosen_meals)<>(select count(distinct x) from unnest(chosen_meals) x) then raise exception 'Choose valid chosen_meals and household size'; end if;
  key:='preview:'||actor||':'||profile.revision||':'||start_on||':'||people||':'||array_to_string(chosen_meals,',');
  if not exists(select 1 from chefos_private.menu_jobs where request_key=key) and (select count(*) from chefos_private.menu_jobs where user_id=actor and kind<>'weekly' and created_at>now()-interval '1 hour')>=8 then raise exception 'Please wait before requesting more menu changes'; end if;
  insert into chefos_private.menu_jobs(user_id,request_key,kind,start_date,end_date,meals,people_count,profile_revision)
   values(actor,key,'preview',start_on,stop_on,chosen_meals,people,profile.revision) on conflict(request_key) do update set request_key=excluded.request_key returning * into j;
 elsif p_action='swap' then
  select * into m from chefos_private.menus where id=(p_data->>'menu_id')::uuid and user_id=actor for update;
  if m.id is null or m.version is distinct from (p_data->>'version')::integer or m.stale then raise exception 'Menu changed. Reload before replacing a dish.' using errcode='40001'; end if;
  start_on:=(p_data->>'date')::date; chosen_meals:=array[p_data->>'meal'];
  if start_on not between m.start_date and m.end_date or start_on<current_date or not chosen_meals<@m.meals then raise exception 'Choose a future meal in this menu'; end if;
  if m.subscription_id is not null and not exists(select 1 from chefos_private.visits v join chefos_private.booking_holds h on h.id=v.hold_id where h.subscription_id=m.subscription_id and (v.starts_at at time zone 'Asia/Kolkata')::date=start_on and chosen_meals[1]=any(v.meals) and v.starts_at>now() and v.state='confirmed') then raise exception 'Cooking has started or this meal is no longer editable'; end if;
  if length(trim(coalesce(p_data->>'request',''))) not between 2 and 300 then raise exception 'Describe your preferred replacement in 2 to 300 characters'; end if;
  key:='swap:'||m.id||':'||m.version||':'||start_on||':'||chosen_meals[1];
  if not exists(select 1 from chefos_private.menu_jobs where request_key=key) and (select count(*) from chefos_private.menu_jobs where user_id=actor and kind<>'weekly' and created_at>now()-interval '1 hour')>=8 then raise exception 'Please wait before requesting more menu changes'; end if;
  insert into chefos_private.menu_jobs(user_id,subscription_id,target_menu,request_key,kind,start_date,end_date,meals,people_count,profile_revision,expected_version,replacement_request)
   values(actor,m.subscription_id,m.id,key,'swap',start_on,start_on,chosen_meals,m.people_count,profile.revision,m.version,trim(p_data->>'request'))
   on conflict(request_key) do update set request_key=excluded.request_key returning * into j;
 else raise exception 'Unknown menu action'; end if;
 return chefos_private.menu_result(j.id,actor);
end $$;
revoke all on function public.chefos_menu_request(text,jsonb) from public,anon;
grant execute on function public.chefos_menu_request(text,jsonb) to authenticated;

create function public.chefos_server_claim_menu(p_job uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j chefos_private.menu_jobs%rowtype; profile chefos_private.diet_profiles%rowtype;
begin
 update chefos_private.menu_jobs set state='failed',last_error='Menu planning reached its retry limit. Contact Chefos.'
  where attempts>=5 and (state in ('pending','retry') or (state='running' and lease_until<now()));
 select * into j from chefos_private.menu_jobs where (p_job is null or id=p_job)
  and ((state in ('pending','retry') and next_attempt_at<=now()) or (state='running' and lease_until<now()))
  and attempts<5 order by created_at for update skip locked limit 1;
 if j.id is null then return null; end if;
 select * into profile from chefos_private.diet_profiles where user_id=j.user_id;
 if profile.user_id is null then update chefos_private.menu_jobs set state='failed',last_error='Food profile is unavailable' where id=j.id; return null; end if;
 update chefos_private.menu_jobs set state='running',claim_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',attempts=attempts+1,
  profile_revision=profile.revision where id=j.id returning * into j;
 return jsonb_build_object('id',j.id,'claim_token',j.claim_token,'input',jsonb_build_object('start_date',j.start_date,'end_date',j.end_date,'meals',j.meals,'people_count',j.people_count,
  'profile',profile.profile||jsonb_build_object('bmi',profile.bmi),'replacement_request',j.replacement_request,
  'previous_titles',case when j.kind='weekly' then (select coalesce(jsonb_agg(item.value->>'title'),'[]') from chefos_private.menus previous_menu cross join lateral jsonb_array_elements(previous_menu.document->'days') day cross join lateral jsonb_each(day->'meals') item where previous_menu.subscription_id=j.subscription_id and previous_menu.start_date=j.start_date-7) else '[]'::jsonb end),
  'profile_revision',profile.revision);
end $$;

create function public.chefos_server_finish_menu(p_job uuid,p_claim uuid,p_document jsonb default null,p_provider text default null,p_failed boolean default false) returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare j chefos_private.menu_jobs%rowtype; m chefos_private.menus%rowtype; profile chefos_private.diet_profiles%rowtype; idx integer; day jsonb; expected date;
begin
 select * into j from chefos_private.menu_jobs where id=p_job for update;
 if j.id is null or j.claim_token is distinct from p_claim or j.state<>'running' or j.lease_until<=now() then raise exception 'Menu worker lease expired'; end if;
 if p_failed then
  update chefos_private.menu_jobs set state=case when attempts>=5 then 'failed' else 'retry' end,
   next_attempt_at=now()+least(attempts*5,30)*interval '1 minute',last_error='Menu planning could not finish. It will retry; contact Chefos if this continues.',claim_token=null,lease_until=null where id=j.id;
  return '{"saved":false}';
 end if;
 select * into profile from chefos_private.diet_profiles where user_id=j.user_id;
 if profile.revision<>j.profile_revision then
  update chefos_private.menu_jobs set state='pending',next_attempt_at=now(),last_error='Preferences changed; replanning',claim_token=null,lease_until=null where id=j.id;
  return '{"saved":false}';
 end if;
 if coalesce(jsonb_typeof(p_document->'days'),'null')<>'array' or jsonb_array_length(p_document->'days')<>j.end_date-j.start_date+1
  or coalesce(p_provider,'') not in ('openai','custom') then raise exception 'Invalid validated menu document'; end if;
 idx:=0;
 for day in select value from jsonb_array_elements(p_document->'days') loop
  expected:=j.start_date+idx;
  if day->>'date' is distinct from expected::text or jsonb_typeof(day->'meals')<>'object' then raise exception 'Menu service dates do not match'; end if;
  idx:=idx+1;
 end loop;
 if j.kind='swap' then
  select * into m from chefos_private.menus where id=j.target_menu for update;
  if m.version<>j.expected_version or m.stale then
   update chefos_private.menu_jobs set state='failed',last_error='Menu changed while the replacement was being prepared. Reload and try again.',claim_token=null where id=j.id; return '{"saved":false}';
  end if;
  if m.subscription_id is not null and not exists(select 1 from chefos_private.visits v join chefos_private.booking_holds h on h.id=v.hold_id where h.subscription_id=m.subscription_id and (v.starts_at at time zone 'Asia/Kolkata')::date=j.start_date and j.meals[1]=any(v.meals) and v.starts_at>now() and v.state='confirmed') then
   update chefos_private.menu_jobs set state='failed',last_error='Cooking has started; this meal is locked.',claim_token=null where id=j.id; return '{"saved":false}';
  end if;
  update chefos_private.menus set document=jsonb_set(document,array['days',(j.start_date-start_date)::text,'meals',j.meals[1]],p_document#>array['days','0','meals',j.meals[1]]),
   version=version+1,accepted_version=null,chef_reviewed_version=null,needs_review=profile.review_required,profile_revision=profile.revision,updated_at=now() where id=m.id returning * into m;
 else
  select * into m from chefos_private.menus where subscription_id=j.subscription_id and start_date=j.start_date for update;
  if m.id is not null then
   update chefos_private.menus set document=p_document,provider=p_provider,profile_revision=profile.revision,version=version+1,accepted_version=case when j.kind='weekly' then version+1 else null end,
    needs_review=profile.review_required,chef_reviewed_version=null,stale=false,updated_at=now() where id=m.id returning * into m;
  else
   insert into chefos_private.menus(user_id,subscription_id,start_date,end_date,meals,people_count,profile_revision,document,provider,needs_review,accepted_version)
    values(j.user_id,j.subscription_id,j.start_date,j.end_date,j.meals,j.people_count,profile.revision,p_document,p_provider,profile.review_required,case when j.kind='weekly' then 1 else null end) returning * into m;
  end if;
 end if;
 update chefos_private.menu_jobs set state='ready',result_menu=m.id,last_error=null,claim_token=null,lease_until=null where id=j.id;
 return jsonb_build_object('saved',true,'menu_id',m.id);
end $$;
revoke all on function public.chefos_server_claim_menu(uuid),public.chefos_server_finish_menu(uuid,uuid,jsonb,text,boolean) from public,anon,authenticated;
grant execute on function public.chefos_server_claim_menu(uuid),public.chefos_server_finish_menu(uuid,uuid,jsonb,text,boolean) to service_role;

create function public.chefos_server_enqueue_weeks() returns jsonb language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare sub public.chefos_subscriptions%rowtype; d date; profile chefos_private.diet_profiles%rowtype; key text; count_jobs integer:=0;
begin
 for sub in select * from public.chefos_subscriptions where schedule_version=2 and is_active and end_date>=current_date loop
  select * into profile from chefos_private.diet_profiles where user_id=sub.user_id;
  if profile.user_id is null then continue; end if;
  -- Prepare the current and next service week, including while both apps close.
  for d in select sub.start_date+7*i from generate_series(0,((sub.end_date-sub.start_date)/7)) i
   where sub.start_date+7*i<=current_date+7 and sub.start_date+7*i+6>=current_date loop
   key:='week:'||sub.id||':'||d||':'||profile.revision;
   if exists(select 1 from chefos_private.menus where subscription_id=sub.id and start_date=d and profile_revision=profile.revision and not stale) then continue; end if;
   insert into chefos_private.menu_jobs(user_id,subscription_id,request_key,kind,start_date,end_date,meals,people_count,profile_revision)
   values(sub.user_id,sub.id,key,'weekly',d,least(sub.end_date,d+6),sub.meal_type,sub.people_count,profile.revision) on conflict(request_key) do nothing;
   if found then count_jobs:=count_jobs+1; end if;
  end loop;
 end loop;
 return jsonb_build_object('enqueued',count_jobs);
end $$;
revoke all on function public.chefos_server_enqueue_weeks() from public,anon,authenticated;
grant execute on function public.chefos_server_enqueue_weeks() to service_role;

create function chefos_private.require_preview(p_actor uuid,p_booking jsonb) returns void language plpgsql set search_path='' as $$
declare m chefos_private.menus%rowtype; revision integer; meals text[];begin
 if coalesce((p_booking->>'schedule_version')::integer,1)<>2 then return; end if;
 select * into m from chefos_private.menus where id=(p_booking->>'menu_id')::uuid and user_id=p_actor;
 select p.revision into revision from chefos_private.diet_profiles p where p.user_id=p_actor;
 select array_agg(value order by value) into meals from jsonb_array_elements_text(p_booking->'meal_type');
 if m.id is null or m.subscription_id is not null or m.accepted_version is distinct from m.version or m.version is distinct from (p_booking->>'menu_version')::integer or m.stale or m.profile_revision is distinct from revision
  or m.start_date is distinct from (p_booking->>'start_date')::date or m.people_count is distinct from (p_booking->>'people_count')::integer
  or m.meals is distinct from meals then raise exception 'Preview and confirm your current personalised menu before paying'; end if;
end $$;
revoke all on function chefos_private.require_preview(uuid,jsonb) from public,anon,authenticated,service_role;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.chefos_server_prepare_order(uuid,jsonb)'::regprocedure);
 definition:=replace(definition,'select * into home from chefos_private.households where user_id=p_actor;',
  'perform chefos_private.require_preview(p_actor,p_booking); select * into home from chefos_private.households where user_id=p_actor;');
 definition:=replace(definition,'''start_date'',start_on,''visits'',visits);','''start_date'',start_on,''visits'',visits,''menu_id'',p_booking->''menu_id'',''menu_version'',p_booking->''menu_version'');');
 execute definition;
end $$;

create function chefos_private.attach_initial_menu() returns trigger language plpgsql security definer set search_path='' as $$
declare m chefos_private.menus%rowtype;begin
 if new.subscription_id is not null and old.subscription_id is null then
  select * into m from chefos_private.menus where id=(new.booking->>'menu_id')::uuid and user_id=new.user_id for update;
  if m.id is null then raise exception 'The confirmed menu is unavailable; contact support'; end if;
  update chefos_private.menus set subscription_id=new.subscription_id where id=m.id;
  perform public.chefos_server_enqueue_weeks();
 end if;
 return new;
end $$;
revoke all on function chefos_private.attach_initial_menu() from public,anon,authenticated,service_role;
create trigger chefos_attach_menu after update of subscription_id on chefos_private.booking_holds for each row execute function chefos_private.attach_initial_menu();

create function chefos_private.invalidate_diet_menus() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.revision<>old.revision then
  update chefos_private.menus set stale=true,chef_reviewed_version=null where user_id=new.user_id and end_date>=(now() at time zone 'Asia/Kolkata')::date;
  perform public.chefos_server_enqueue_weeks();
 end if;
 return new;
end $$;
revoke all on function chefos_private.invalidate_diet_menus() from public,anon,authenticated,service_role;
create trigger chefos_diet_menu_revision after update on chefos_private.diet_profiles for each row execute function chefos_private.invalidate_diet_menus();
