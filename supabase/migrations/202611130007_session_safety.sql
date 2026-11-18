create table chefos_private.chef_identities (
 chef_id uuid primary key references public.chefos_chefs(id), provider_reference text not null unique,
 enrolled_by uuid not null references public.chefos_profiles(id), updated_at timestamptz not null default now()
);
create table chefos_private.face_checks (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references chefos_private.service_sessions(id),
 chef_id uuid not null references public.chefos_chefs(id), provider_reference text not null,
 provider_session text unique, state text not null default 'pending' check(state in ('pending','passed','failed')),
 expires_at timestamptz not null default now()+interval '10 minutes', verified_at timestamptz,
 event_id text unique, created_at timestamptz not null default now()
);
create table chefos_private.session_evidence (
 session_id uuid primary key references chefos_private.service_sessions(id), arrived_at timestamptz,
 latitude numeric, longitude numeric, customer_consented_at timestamptz, chef_consented_at timestamptz,
 consent_version text, hygiene jsonb, face_check uuid references chefos_private.face_checks(id),
 current_capture uuid, capturing boolean not null default false, heartbeat_at timestamptz, last_segment_at timestamptz,
 requested_menu_id uuid, requested_menu_version integer
);
create table chefos_private.recording_runs (
 token uuid primary key default gen_random_uuid(), session_id uuid not null references chefos_private.service_sessions(id),
 started_at timestamptz not null default now(), ended_at timestamptz
);
create table chefos_private.recording_segments (
 id uuid primary key, run_token uuid not null references chefos_private.recording_runs(token),
 session_id uuid not null references chefos_private.service_sessions(id), object_key text not null unique,
 started_at timestamptz not null, ended_at timestamptz not null,
 bytes bigint not null check(bytes between 100 and 15728640), uploaded_at timestamptz, purged_at timestamptz,
 expires_at timestamptz not null default now()+interval '14 days',
 check(ended_at>started_at and ended_at<=started_at+interval '90 seconds')
);
create table chefos_private.complaints (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references chefos_private.service_sessions(id),
 user_id uuid not null references public.chefos_profiles(id), reason text not null,
 state text not null default 'open' check(state in ('open','closed')), resolution text, created_at timestamptz not null default now()
);
alter table chefos_private.service_sessions add column recipe_snapshot jsonb;
alter table chefos_private.service_sessions drop constraint service_sessions_status_check;
alter table chefos_private.service_sessions add constraint service_sessions_status_check check(status in ('assigned','start_otp','started','paused','end_otp','completed'));
do $$declare name text;begin
 foreach name in array array['chef_identities','face_checks','session_evidence','recording_runs','recording_segments','complaints'] loop
  execute format('alter table chefos_private.%I enable row level security',name);
  execute format('revoke all on chefos_private.%I from public,anon,authenticated,service_role',name);
 end loop;
end $$;

create function public.chefos_ops_identity(p_chef uuid,p_reference text) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not public.chefos_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if length(trim(p_reference)) not between 2 and 200 or not exists(select 1 from public.chefos_chefs where id=p_chef and is_verified and is_active) then raise exception 'A verified chef and enrolled provider identity are required'; end if;
 insert into chefos_private.chef_identities(chef_id,provider_reference,enrolled_by) values(p_chef,trim(p_reference),auth.uid())
 on conflict(chef_id) do update set provider_reference=excluded.provider_reference,enrolled_by=auth.uid(),updated_at=now();
 insert into chefos_private.audit_log(actor,action,object_id,changes) values(auth.uid(),'chef.identity_enrolled',p_chef::text,'{}');
 return '{"enrolled":true}';
end $$;
revoke all on function public.chefos_ops_identity(uuid,text) from public,anon;
grant execute on function public.chefos_ops_identity(uuid,text) to authenticated;

create function chefos_private.session_menu(p_session uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare ss chefos_private.service_sessions%rowtype; m chefos_private.menus%rowtype; food jsonb; recipes jsonb:='{}'; meal text; idx integer;
begin
 select * into ss from chefos_private.service_sessions where id=p_session;
 if ss.recipe_snapshot is not null then return ss.recipe_snapshot; end if;
 select p.profile into food from chefos_private.diet_profiles p where p.user_id=ss.user_id;
 select * into m from chefos_private.menus where subscription_id=ss.subscription_id and ss.service_date between start_date and end_date;
 if m.id is null or m.stale or m.accepted_version is distinct from m.version then raise exception 'A confirmed personalised menu is required before cooking'; end if;
 idx:=ss.service_date-m.start_date;
 foreach meal in array coalesce(ss.meal_types,array[ss.meal]) loop
  if m.document#>array['days',idx::text,'meals',meal] is null then raise exception 'A selected recipe is unavailable'; end if;
  recipes:=recipes||jsonb_build_object(meal,m.document#>array['days',idx::text,'meals',meal]);
 end loop;
 return jsonb_build_object('menu_id',m.id,'version',m.version,'recipes',recipes,'needs_review',m.needs_review and m.chef_reviewed_version is distinct from m.version,
  'food_notes',jsonb_build_object('allergens',coalesce(food->'allergens','[]'),'other_restrictions',coalesce(food->>'other_restrictions',''),'diet',food->>'diet'));
end $$;
revoke all on function chefos_private.session_menu(uuid) from public,anon,authenticated,service_role;

create function public.chefos_session_evidence(p_session uuid,p_action text default 'get',p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid:=chefos_private.require_actor(); ss chefos_private.service_sessions%rowtype; c public.chefos_chefs%rowtype;
 e chefos_private.session_evidence%rowtype; home chefos_private.households%rowtype; b chefos_private.buildings%rowtype;
 lat numeric; lng numeric; token uuid; menu jsonb; face_ok boolean; result jsonb;
begin
 select * into ss from chefos_private.service_sessions where id=p_session;
 if ss.id is null then raise exception 'Session not found' using errcode='42501'; end if;
 select * into c from public.chefos_chefs where id=ss.chef_id;
 if actor<>ss.user_id and actor<>c.user_id then raise exception 'Session not assigned to this account' using errcode='42501'; end if;
 if actor=c.user_id and (not c.is_verified or not c.is_active) then raise exception 'Verified active chef required' using errcode='42501'; end if;
 perform 1 from public.chefos_chefs where id=c.id for update;
 select * into ss from chefos_private.service_sessions where id=p_session for update;
 insert into chefos_private.session_evidence(session_id) values(ss.id) on conflict do nothing;
 select * into e from chefos_private.session_evidence where session_id=ss.id for update;
 if p_action='customer_consent' then
  if actor<>ss.user_id then raise exception 'Only this customer can consent' using errcode='42501'; end if;
  if p_data->'consent' is distinct from 'true'::jsonb then raise exception 'Explicit kitchen-recording consent is required'; end if;
  update chefos_private.session_evidence set customer_consented_at=now(),consent_version='kitchen-video-no-audio-v1' where session_id=ss.id;
 elsif p_action<>'get' then
  if actor<>c.user_id then raise exception 'Assigned chef action required' using errcode='42501'; end if;
  if ss.status='completed' and p_action not in ('capture_end','heartbeat') then raise exception 'Session is already complete'; end if;
  if p_action='arrived' then
   select ss.user_id,v.building_id,v.flat,now() into home from chefos_private.visits v where v.id=ss.visit_id;
   select * into b from chefos_private.buildings where id=home.building_id and active;
   lat:=(p_data->>'latitude')::numeric; lng:=(p_data->>'longitude')::numeric;
   if b.id is null or lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then raise exception 'A verified home and current location are required'; end if;
   if chefos_private.distance_km(lat,lng,b.latitude,b.longitude)>0.25 then raise exception 'You must be at the customer''s building to mark arrival'; end if;
   update chefos_private.session_evidence set arrived_at=now(),latitude=lat,longitude=lng where session_id=ss.id;
  elsif p_action='chef_consent' then
   if p_data->'consent' is distinct from 'true'::jsonb then raise exception 'Explicit chef recording consent is required'; end if;
   update chefos_private.session_evidence set chef_consented_at=now(),consent_version='kitchen-video-no-audio-v1' where session_id=ss.id;
  elsif p_action='hygiene' then
   if not e.capturing or e.heartbeat_at is null or e.heartbeat_at<now()-interval '30 seconds' then raise exception 'Start kitchen recording before the hygiene checklist'; end if;
   if p_data->'hand_wash' is distinct from 'true'::jsonb or p_data->'gloves' is distinct from 'true'::jsonb or p_data->'apron' is distinct from 'true'::jsonb or p_data->'cap' is distinct from 'true'::jsonb then raise exception 'Complete hand wash, gloves, apron and cap checks'; end if;
   update chefos_private.session_evidence set hygiene=jsonb_build_object('hand_wash',true,'gloves',true,'apron',true,'cap',true,'at',now()) where session_id=ss.id;
  elsif p_action='review_menu' then
   menu:=chefos_private.session_menu(ss.id);
   if menu->>'menu_id' is null or (p_data->>'version')::integer is distinct from (menu->>'version')::integer then raise exception 'Reload and review the current recipes'; end if;
   update chefos_private.menus set chef_reviewed_version=version where id=(menu->>'menu_id')::uuid and version=(menu->>'version')::integer;
  elsif p_action='capture_begin' then
   if e.arrived_at is null or e.customer_consented_at is null or e.chef_consented_at is null then raise exception 'Arrival and both recording consents are required'; end if;
   if not exists(select 1 from chefos_private.face_checks f where f.id=e.face_check and f.state='passed' and (f.expires_at>now() or ss.started_at is not null)) then raise exception 'Complete chef face verification before recording'; end if;
   if exists(select 1 from chefos_private.session_evidence x join chefos_private.service_sessions s on s.id=x.session_id where s.chef_id=c.id and x.session_id<>ss.id and x.capturing and s.status<>'completed') then raise exception 'Another kitchen recording is active'; end if;
   update chefos_private.recording_runs set ended_at=now() where recording_runs.token=e.current_capture and ended_at is null;
   insert into chefos_private.recording_runs(session_id) values(ss.id) returning recording_runs.token into token;
   update chefos_private.session_evidence set current_capture=token,capturing=true,heartbeat_at=now(),last_segment_at=null where session_id=ss.id;
  elsif p_action='heartbeat' then
   if not e.capturing or e.current_capture is distinct from (p_data->>'capture_token')::uuid then raise exception 'Recording session changed; restart the camera'; end if;
   update chefos_private.session_evidence set heartbeat_at=now() where session_id=ss.id;
  elsif p_action='capture_end' then
   if e.current_capture is distinct from (p_data->>'capture_token')::uuid then raise exception 'Recording session changed'; end if;
   update chefos_private.recording_runs set ended_at=now() where recording_runs.token=e.current_capture and ended_at is null;
   update chefos_private.session_evidence set capturing=false where session_id=ss.id;
   update chefos_private.service_sessions set status=case when status in ('started','end_otp') then 'paused' when status='start_otp' then 'assigned' else status end,otp_code=null,otp_expires_at=null where id=ss.id and status<>'completed';
  else raise exception 'Unknown evidence action'; end if;
 end if;
 select * into e from chefos_private.session_evidence where session_id=ss.id;
 face_ok:=exists(select 1 from chefos_private.face_checks f where f.id=e.face_check and f.state='passed' and (f.expires_at>now() or ss.started_at is not null));
 begin menu:=chefos_private.session_menu(ss.id); exception when others then menu:=null; end;
 result:=jsonb_build_object('session_id',ss.id,'status',(select status from chefos_private.service_sessions where id=ss.id),'server_time',now(),
  'arrived',e.arrived_at is not null,'customer_consent',e.customer_consented_at is not null,'chef_consent',e.chef_consented_at is not null,
  'hygiene_complete',e.hygiene is not null,'face_verified',face_ok,
  'recording_active',coalesce(e.capturing and e.heartbeat_at>now()-interval '30 seconds' and e.last_segment_at>now()-interval '100 seconds',false),
  'menu',menu,'clips',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'started_at',r.started_at,'ended_at',r.ended_at,'uploaded',r.uploaded_at is not null)),'[]') from chefos_private.recording_segments r where r.session_id=ss.id and r.purged_at is null));
 if actor=c.user_id then result:=result||jsonb_build_object('capture_token',e.current_capture,'capture_started',e.capturing); end if;
 return result;
end $$;
revoke all on function public.chefos_session_evidence(uuid,text,jsonb) from public,anon;
grant execute on function public.chefos_session_evidence(uuid,text,jsonb) to authenticated;

create function public.chefos_server_face(p_actor uuid,p_session uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare ss chefos_private.service_sessions%rowtype; c public.chefos_chefs%rowtype; identity chefos_private.chef_identities%rowtype; f chefos_private.face_checks%rowtype;
begin
 select * into ss from chefos_private.service_sessions where id=p_session;
 select * into c from public.chefos_chefs where id=ss.chef_id and user_id=p_actor and is_verified and is_active;
 if c.id is null then raise exception 'Assigned verified chef required' using errcode='42501'; end if;
 if ss.status='completed' or ss.service_date<>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Verify your face on the assigned cooking date'; end if;
 if p_action='begin' then
  select * into identity from chefos_private.chef_identities where chef_id=c.id;
  if identity.chef_id is null then raise exception 'Your verified face identity needs enrolment by Chefos'; end if;
  if not exists(select 1 from chefos_private.session_evidence where session_id=ss.id and arrived_at is not null and customer_consented_at is not null and chef_consented_at is not null) then raise exception 'Arrival and both recording consents are required'; end if;
  if (select count(*) from chefos_private.face_checks where session_id=ss.id and created_at>now()-interval '1 hour')>=5
   or (select count(*) from chefos_private.face_checks where chef_id=c.id and created_at>now()-interval '1 hour')>=20 then raise exception 'Face verification retry limit reached'; end if;
  insert into chefos_private.face_checks(session_id,chef_id,provider_reference) values(ss.id,c.id,identity.provider_reference) returning * into f;
  update chefos_private.session_evidence set face_check=f.id where session_id=ss.id;
  return jsonb_build_object('challenge_id',f.id,'enrollment_reference',identity.provider_reference,'expires_at',f.expires_at);
 elsif p_action='provider_session' then
  update chefos_private.face_checks set provider_session=p_data->>'provider_session'
   where id=(p_data->>'challenge_id')::uuid and session_id=ss.id and chef_id=c.id and state='pending' and expires_at>now() returning * into f;
  if f.id is null then raise exception 'Verification challenge expired'; end if;
  return '{"updated":true}';
 end if;
 raise exception 'Unknown face operation';
end $$;
create function public.chefos_server_face_result(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare f chefos_private.face_checks%rowtype;begin
 select * into f from chefos_private.face_checks where id=(p_data->>'challenge_id')::uuid for update;
 if f.id is null or f.provider_session is distinct from p_data->>'provider_session' or f.provider_reference is distinct from p_data->>'enrollment_reference' then raise exception 'Verification identity mismatch'; end if;
 if f.event_id=p_data->>'event_id' then return '{"recorded":true}'; end if;
 if f.state<>'pending' or f.expires_at<=now() then raise exception 'Verification challenge is no longer valid'; end if;
 if length(coalesce(p_data->>'event_id','')) not between 1 and 200 then raise exception 'Provider event identity required'; end if;
 update chefos_private.face_checks set state=case when p_data->'match'='true'::jsonb and p_data->'liveness'='true'::jsonb then 'passed' else 'failed' end,
  verified_at=now(),event_id=p_data->>'event_id' where id=f.id;
 return '{"recorded":true}';
end $$;
revoke all on function public.chefos_server_face(uuid,uuid,text,jsonb),public.chefos_server_face_result(jsonb) from public,anon,authenticated;
grant execute on function public.chefos_server_face(uuid,uuid,text,jsonb),public.chefos_server_face_result(jsonb) to service_role;

alter function public.chefos_service_action(uuid,text,text) set schema chefos_private;
revoke all on function chefos_private.chefos_service_action(uuid,text,text) from public,anon,authenticated,service_role;
create function public.chefos_service_action(p_id uuid,p_action text,p_code text default null) returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid:=chefos_private.require_actor(); ss chefos_private.service_sessions%rowtype; e chefos_private.session_evidence%rowtype; menu jsonb; result jsonb;
begin
 select * into ss from chefos_private.service_sessions where id=p_id;
 if not exists(select 1 from public.chefos_chefs where id=ss.chef_id and user_id=actor and is_verified and is_active) then raise exception 'Service is not assigned to this chef' using errcode='42501'; end if;
 perform 1 from public.chefos_chefs where id=ss.chef_id for update;
 select * into ss from chefos_private.service_sessions where id=p_id for update;
 if p_action='journey' then return chefos_private.chefos_service_action(p_id,p_action,p_code); end if;
 if ss.visit_id is null then raise exception 'This legacy service needs a verified visit assignment before cooking'; end if;
 if not exists(select 1 from chefos_private.visits v join chefos_private.booking_holds h on h.id=v.hold_id join chefos_private.payments pay on pay.order_id=h.order_id
  where v.id=ss.visit_id and h.status='confirmed' and pay.status='paid' and v.state<>'cancelled') then raise exception 'Confirmed payment is required before cooking'; end if;
 select * into e from chefos_private.session_evidence where session_id=ss.id for update;
 if e.arrived_at is null or e.customer_consented_at is null or e.chef_consented_at is null or e.hygiene is null then raise exception 'Arrival, both consents and the hygiene checklist are required'; end if;
 if not e.capturing or e.heartbeat_at is null or e.heartbeat_at<now()-interval '30 seconds' or e.last_segment_at is null or e.last_segment_at<now()-interval '100 seconds' then raise exception 'Kitchen recording must be running with a recent uploaded segment'; end if;
 if not exists(select 1 from chefos_private.face_checks f where f.id=e.face_check and f.state='passed' and (ss.started_at is not null or f.expires_at>now())) then raise exception 'Chef face and liveness verification are required'; end if;
 if ss.service_date<>current_date then raise exception 'Cooking can only start on the assigned service date'; end if;
 menu:=chefos_private.session_menu(ss.id);
 if (menu->>'needs_review')::boolean then raise exception 'Review the allergy instructions and current recipes first'; end if;
 if p_action='start.request' then
  if ss.status='paused' then update chefos_private.service_sessions set status='assigned' where id=ss.id; end if;
  update chefos_private.session_evidence set requested_menu_id=(menu->>'menu_id')::uuid,requested_menu_version=(menu->>'version')::integer where session_id=ss.id;
 elsif p_action='start.verify' and (e.requested_menu_id is distinct from (menu->>'menu_id')::uuid or e.requested_menu_version is distinct from (menu->>'version')::integer) then
  update chefos_private.service_sessions set status='assigned',otp_code=null,otp_expires_at=null where id=ss.id;
  return '{"error":true,"status":409,"detail":"The menu changed. Review it and request a new start code."}';
 end if;
 result:=chefos_private.chefos_service_action(p_id,p_action,p_code);
 if p_action='start.verify' and not coalesce((result->>'error')::boolean,false) then
  update chefos_private.service_sessions set recipe_snapshot=coalesce(recipe_snapshot,menu) where id=ss.id;
 end if;
 return result;
end $$;
revoke all on function public.chefos_service_action(uuid,text,text) from public,anon;
grant execute on function public.chefos_service_action(uuid,text,text) to authenticated;
