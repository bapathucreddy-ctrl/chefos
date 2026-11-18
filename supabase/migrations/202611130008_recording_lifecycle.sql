alter table chefos_private.recording_segments add column purge_started_at timestamptz;
create function public.chefos_server_recording(p_actor uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare ss chefos_private.service_sessions%rowtype; run chefos_private.recording_runs%rowtype;
 clip chefos_private.recording_segments%rowtype; c public.chefos_chefs%rowtype; start_at timestamptz; end_at timestamptz; byte_count bigint; result jsonb;
begin
 if not exists(select 1 from public.chefos_profiles where id=p_actor and is_active) then raise exception 'Active account required' using errcode='42501'; end if;
 if p_action='ticket' then
  select * into run from chefos_private.recording_runs where token=(p_data->>'capture_token')::uuid;
  select * into ss from chefos_private.service_sessions where id=run.session_id;
  select * into c from public.chefos_chefs where id=ss.chef_id and user_id=p_actor and is_verified and is_active;
  if c.id is null then raise exception 'Recording is not assigned to this chef' using errcode='42501'; end if;
  start_at:=(p_data->>'started_at')::timestamptz; end_at:=(p_data->>'ended_at')::timestamptz; byte_count:=(p_data->>'bytes')::bigint;
  if start_at is null or end_at is null or byte_count is null or start_at<run.started_at-interval '10 seconds'
   or end_at>now()+interval '30 seconds' or end_at<now()-interval '14 days'
   or (run.ended_at is not null and end_at>run.ended_at+interval '10 seconds') then raise exception 'Invalid recording time window'; end if;
  insert into chefos_private.recording_segments(id,run_token,session_id,object_key,started_at,ended_at,bytes,expires_at)
  values((p_data->>'id')::uuid,run.token,ss.id,c.id||'/'||ss.id||'/'||(p_data->>'id')||'.mp4',start_at,end_at,byte_count,end_at+interval '14 days')
   on conflict(id) do nothing;
  select * into clip from chefos_private.recording_segments where id=(p_data->>'id')::uuid;
  if clip.run_token<>run.token or clip.bytes<>byte_count or clip.started_at<>start_at or clip.ended_at<>end_at then raise exception 'Recording upload identity mismatch'; end if;
 else
  select * into clip from chefos_private.recording_segments where id=(p_data->>'id')::uuid for update;
  select * into ss from chefos_private.service_sessions where id=clip.session_id;
  select * into c from public.chefos_chefs where id=ss.chef_id;
  if clip.id is null then raise exception 'Recording not found' using errcode='42501'; end if;
  if p_action in ('metadata','confirm') then
   if c.user_id<>p_actor or not c.is_verified or not c.is_active then raise exception 'Assigned chef required' using errcode='42501'; end if;
   if p_action='confirm' then
    if clip.bytes is distinct from (p_data->>'actual_bytes')::bigint then raise exception 'Uploaded recording size mismatch'; end if;
    update chefos_private.recording_segments set uploaded_at=coalesce(uploaded_at,now()) where id=clip.id;
    update chefos_private.session_evidence set last_segment_at=greatest(last_segment_at,clip.ended_at)
     where session_id=ss.id and current_capture=clip.run_token and capturing;
    return '{"confirmed":true}';
   end if;
  elsif p_action='view' then
   if ss.user_id<>p_actor then
    if not exists(select 1 from public.chefos_profiles where id=p_actor and role='admin')
     or not exists(select 1 from chefos_private.complaints where id=(p_data->>'complaint_id')::uuid and session_id=ss.id and state='open') then
     raise exception 'Only the customer or ops reviewing an open dispute can view this recording' using errcode='42501'; end if;
   end if;
   if clip.uploaded_at is null then raise exception 'Recording upload is pending'; end if;
   insert into chefos_private.audit_log(actor,action,object_id,changes) values(p_actor,'recording.view',clip.id::text,jsonb_build_object('complaint_id',p_data->>'complaint_id'));
  else raise exception 'Unknown recording action'; end if;
 end if;
 if clip.purged_at is not null or clip.purge_started_at is not null or (clip.expires_at<=now() and not exists(select 1 from chefos_private.complaints where session_id=ss.id and state='open')) then raise exception 'Recording retention period has ended'; end if;
 return jsonb_build_object('id',clip.id,'object_key',clip.object_key,'uploaded',clip.uploaded_at is not null,'bytes',clip.bytes,'started_at',clip.started_at,'ended_at',clip.ended_at);
end $$;
revoke all on function public.chefos_server_recording(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.chefos_server_recording(uuid,text,jsonb) to service_role;

create function public.chefos_complaint(p_session uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=chefos_private.require_actor(); id uuid;begin
 if not exists(select 1 from chefos_private.service_sessions where service_sessions.id=p_session and user_id=actor) then raise exception 'Your session is required' using errcode='42501'; end if;
 if length(trim(p_reason)) not between 5 and 1000 then raise exception 'Describe the issue in 5 to 1000 characters'; end if;
 perform 1 from chefos_private.recording_segments where session_id=p_session for update;
 insert into chefos_private.complaints(session_id,user_id,reason) values(p_session,actor,trim(p_reason)) returning complaints.id into id;
 return jsonb_build_object('id',id,'state','open');
end $$;
revoke all on function public.chefos_complaint(uuid,text) from public,anon;
grant execute on function public.chefos_complaint(uuid,text) to authenticated;

create function public.chefos_ops_complaints(p_id uuid default null,p_resolution text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.chefos_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_id is not null then
  if length(trim(coalesce(p_resolution,''))) not between 5 and 1000 then raise exception 'Record the dispute resolution'; end if;
  update chefos_private.complaints set state='closed',resolution=trim(p_resolution) where id=p_id and state='open';
  insert into chefos_private.audit_log(actor,action,object_id,changes) values(auth.uid(),'complaint.closed',p_id::text,jsonb_build_object('resolution',trim(p_resolution)));
 end if;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'session_id',c.session_id,'reason',c.reason,'state',c.state,'resolution',c.resolution,'created_at',c.created_at,
  'customer',p.username,'clips',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'started_at',r.started_at,'ended_at',r.ended_at,'uploaded',r.uploaded_at is not null)),'[]') from chefos_private.recording_segments r where r.session_id=c.session_id and r.purged_at is null)) order by c.created_at desc),'[]')
  from chefos_private.complaints c join public.chefos_profiles p on p.id=c.user_id));
end $$;
revoke all on function public.chefos_ops_complaints(uuid,text) from public,anon;
grant execute on function public.chefos_ops_complaints(uuid,text) to authenticated;

create function public.chefos_server_purge_recordings(p_done uuid[] default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if p_done is not null then
  update chefos_private.recording_segments set purged_at=now() where id=any(p_done) and purge_started_at is not null;
  return '{"marked":true}';
 end if;
 with selected as (select r.id from chefos_private.recording_segments r where expires_at<now() and purged_at is null
  and not exists(select 1 from chefos_private.complaints c where c.session_id=r.session_id and c.state='open')
  order by expires_at for update skip locked limit 100), claimed as (
   update chefos_private.recording_segments r set purge_started_at=coalesce(purge_started_at,now()) where r.id in(select id from selected) returning r.id,r.object_key)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;
 return result;
end $$;
revoke all on function public.chefos_server_purge_recordings(uuid[]) from public,anon,authenticated;
grant execute on function public.chefos_server_purge_recordings(uuid[]) to service_role;

-- A fresh camera run during cooking is a resume, not permission to skip a new
-- customer start code. Recipe snapshots remain locked while paused.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.chefos_session_evidence(uuid,text,jsonb)'::regprocedure);
 definition:=replace(definition,'insert into chefos_private.recording_runs(session_id) values(ss.id)',
  'update chefos_private.service_sessions set status=''paused'',otp_code=null,otp_expires_at=null where id=ss.id and status in (''started'',''end_otp''); insert into chefos_private.recording_runs(session_id) values(ss.id)');
 execute definition;
 definition:=pg_get_functiondef('chefos_private.preserve_cooked_meals(chefos_private.menus,jsonb)'::regprocedure);
 definition:=replace(definition,'''started'',''end_otp'',''completed''','''started'',''paused'',''end_otp'',''completed''');
 execute definition;
end $$;
