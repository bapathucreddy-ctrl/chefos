create table chefos_private.chef_selfies (
 id uuid primary key, chef_id uuid not null unique references public.chefos_chefs(id),
 object_key text not null unique, image_hash text not null, provider_request text not null,
 consent_version text not null, enrolled_at timestamptz not null default now()
);
create table chefos_private.selfie_attempts (
 id uuid primary key default gen_random_uuid(), chef_id uuid not null references public.chefos_chefs(id),
 session_id uuid references chefos_private.service_sessions(id), reference_id uuid references chefos_private.chef_selfies(id),
 object_key text not null unique, reference_key text not null unique,
 state text not null default 'pending' check(state in ('pending','processing','passed','failed')),
 image_hash text, consent_version text not null, claim_token uuid, lease_until timestamptz,
 tries integer not null default 0, provider_request text, match_score numeric, liveness_score numeric,
 expires_at timestamptz not null default now()+interval '5 minutes', created_at timestamptz not null default now(),
 last_cleaned_at timestamptz, purged_at timestamptz
);
alter table chefos_private.chef_selfies enable row level security;
alter table chefos_private.selfie_attempts enable row level security;
revoke all on chefos_private.chef_selfies,chefos_private.selfie_attempts from public,anon,authenticated,service_role;

create function public.chefos_identity_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=chefos_private.require_actor(); chef uuid; enrolled boolean; latest jsonb;
begin
 select id into chef from public.chefos_chefs where user_id=actor and is_active;
 if chef is null then raise exception 'Chef account required' using errcode='42501'; end if;
 select exists(select 1 from chefos_private.chef_selfies where chef_id=chef) into enrolled;
 select jsonb_build_object('id',id,'state',state,'expires_at',expires_at) into latest
  from chefos_private.selfie_attempts where chef_id=chef and session_id is null order by created_at desc limit 1;
 return jsonb_build_object('enrolled',enrolled,'latest_attempt',latest);
end $$;

create function public.chefos_selfie_begin(p_session uuid default null,p_consent boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=chefos_private.require_actor(); chef public.chefos_chefs%rowtype;
 reference chefos_private.chef_selfies%rowtype; attempt_id uuid:=gen_random_uuid(); challenge jsonb;
begin
 select * into chef from public.chefos_chefs where user_id=actor and is_active for update;
 if chef.id is null then raise exception 'Chef account required' using errcode='42501'; end if;
 if not coalesce(p_consent,false) then raise exception 'Consent to selfie storage and biometric verification is required'; end if;
 select * into reference from chefos_private.chef_selfies where chef_id=chef.id;
 if p_session is null then
  if reference.id is not null then raise exception 'Your registration selfie is already enrolled. Contact Chefos to change your identity.'; end if;
  if (select count(*) from chefos_private.selfie_attempts where chef_id=chef.id and session_id is null and created_at>now()-interval '1 hour')>=5 then raise exception 'Please wait before retrying registration verification'; end if;
 else
  if reference.id is null then raise exception 'Complete your registration selfie first'; end if;
  if not exists(select 1 from chefos_private.chef_identities where chef_id=chef.id and provider_reference='selfie:'||reference.id) then raise exception 'Your registered identity needs support review'; end if;
  challenge:=public.chefos_server_face(actor,p_session,'begin');
  attempt_id:=(challenge->>'challenge_id')::uuid;
 end if;
 insert into chefos_private.selfie_attempts(id,chef_id,session_id,reference_id,object_key,reference_key,consent_version)
 values(attempt_id,chef.id,p_session,reference.id,'uploads/'||chef.id||'/'||attempt_id||'.jpg',
  'references/'||chef.id||'/'||attempt_id||'.jpg','selfie-didit-v1');
 return jsonb_build_object('id',attempt_id,'expires_at',now()+interval '5 minutes','kind',case when p_session is null then 'enrolment' else 'visit' end);
end $$;
revoke all on function public.chefos_identity_status(),public.chefos_selfie_begin(uuid,boolean) from public,anon;
grant execute on function public.chefos_identity_status(),public.chefos_selfie_begin(uuid,boolean) to authenticated;

create function public.chefos_selfie_ticket(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare attempt chefos_private.selfie_attempts%rowtype;
begin
 select a.* into attempt from chefos_private.selfie_attempts a join public.chefos_chefs c on c.id=a.chef_id
  join public.chefos_profiles p on p.id=c.user_id where a.id=p_id and c.user_id=p_actor and c.is_active and p.is_active;
 if attempt.id is null then raise exception 'Selfie attempt not assigned to you' using errcode='42501'; end if;
 if attempt.state in ('passed','failed') then return jsonb_build_object('id',attempt.id,'state',attempt.state); end if;
 if attempt.expires_at<=now() then raise exception 'Selfie capture expired. Take a fresh selfie.'; end if;
 return jsonb_build_object('id',attempt.id,'state',attempt.state,'object_key',attempt.object_key,'expires_at',attempt.expires_at);
end $$;

create function public.chefos_selfie_claim(p_actor uuid,p_id uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare attempt chefos_private.selfie_attempts%rowtype; chef public.chefos_chefs%rowtype;
 reference chefos_private.chef_selfies%rowtype;
begin
 select * into attempt from chefos_private.selfie_attempts where id=p_id;
 select * into chef from public.chefos_chefs where id=attempt.chef_id and user_id=p_actor and is_active for update;
 if chef.id is null or not exists(select 1 from public.chefos_profiles where id=p_actor and is_active) then raise exception 'Assigned active chef required' using errcode='42501'; end if;
 select * into attempt from chefos_private.selfie_attempts where id=p_id for update;
 if attempt.state in ('passed','failed') then return jsonb_build_object('id',attempt.id,'state',attempt.state); end if;
 if attempt.expires_at<=now() or attempt.tries>=3 then raise exception 'Selfie verification expired. Take a fresh selfie.'; end if;
 if attempt.state='processing' and attempt.lease_until>now() then raise exception 'This selfie is being verified. Please wait.' using errcode='40001'; end if;
 if p_hash is null or p_hash!~'^[0-9a-f]{64}$' then raise exception 'A verified image hash is required'; end if;
 if attempt.session_id is not null then
  select * into reference from chefos_private.chef_selfies where id=attempt.reference_id and chef_id=chef.id;
  if reference.id is null or not chef.is_verified then raise exception 'The registered chef identity is unavailable'; end if;
  if reference.image_hash=p_hash or exists(select 1 from chefos_private.selfie_attempts where chef_id=chef.id and id<>attempt.id and image_hash=p_hash) then raise exception 'A fresh camera selfie is required for each verification'; end if;
  if not exists(select 1 from chefos_private.service_sessions ss join chefos_private.session_evidence e on e.session_id=ss.id
   where ss.id=attempt.session_id and ss.chef_id=chef.id and ss.status<>'completed' and e.face_check=attempt.id) then raise exception 'This visit verification has been replaced'; end if;
 end if;
 update chefos_private.selfie_attempts set state='processing',claim_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',tries=tries+1,image_hash=p_hash
  where id=attempt.id returning * into attempt;
 return jsonb_build_object('id',attempt.id,'state',attempt.state,'claim_token',attempt.claim_token,'reference_id',reference.id,
  'reference_object',reference.object_key,'reference_hash',reference.image_hash,'reference_key',attempt.reference_key,'session_id',attempt.session_id);
end $$;

create function public.chefos_selfie_finish(p_actor uuid,p_id uuid,p_claim uuid,p_result jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare attempt chefos_private.selfie_attempts%rowtype; chef public.chefos_chefs%rowtype; passed boolean;
begin
 select * into attempt from chefos_private.selfie_attempts where id=p_id;
 select * into chef from public.chefos_chefs where id=attempt.chef_id and user_id=p_actor and is_active for update;
 if chef.id is null or not exists(select 1 from public.chefos_profiles where id=p_actor and is_active) then raise exception 'Assigned active chef required' using errcode='42501'; end if;
 select * into attempt from chefos_private.selfie_attempts where id=p_id for update;
 if attempt.state in ('passed','failed') then return jsonb_build_object('state',attempt.state); end if;
 if attempt.state<>'processing' or attempt.claim_token is distinct from p_claim or attempt.lease_until<=now() or attempt.expires_at<=now() then raise exception 'Selfie result lease expired'; end if;
 if length(coalesce(p_result->>'request_id','')) not between 1 and 200 then raise exception 'Provider result identity required'; end if;
 passed:=p_result->'liveness'='true'::jsonb and (attempt.session_id is null or p_result->'match'='true'::jsonb);
 if attempt.session_id is null then
  if passed then
   if exists(select 1 from chefos_private.chef_selfies where chef_id=chef.id) then raise exception 'The registration selfie is already locked'; end if;
   insert into chefos_private.chef_selfies(id,chef_id,object_key,image_hash,provider_request,consent_version)
    values(attempt.id,chef.id,attempt.reference_key,attempt.image_hash,p_result->>'request_id',attempt.consent_version);
   insert into chefos_private.chef_identities(chef_id,provider_reference,enrolled_by) values(chef.id,'selfie:'||attempt.id,p_actor)
    on conflict(chef_id) do update set provider_reference=excluded.provider_reference,enrolled_by=excluded.enrolled_by,updated_at=now();
   insert into chefos_private.audit_log(actor,action,object_id,changes) values(p_actor,'chef.selfie_enrolled',chef.id::text,'{}');
  end if;
 else
  passed:=passed and exists(select 1 from chefos_private.chef_selfies where id=attempt.reference_id and chef_id=chef.id)
   and exists(select 1 from chefos_private.session_evidence where session_id=attempt.session_id and face_check=attempt.id)
   and exists(select 1 from chefos_private.service_sessions where id=attempt.session_id and status<>'completed');
  update chefos_private.face_checks set state=case when passed then 'passed' else 'failed' end,
   provider_session='didit:'||(p_result->>'request_id'),event_id='didit:'||(p_result->>'request_id'),verified_at=now()
   where id=attempt.id and state='pending' and expires_at>now() and provider_reference='selfie:'||attempt.reference_id;
  if not found then passed:=false; end if;
 end if;
 update chefos_private.selfie_attempts set state=case when passed then 'passed' else 'failed' end,
  provider_request=p_result->>'request_id',match_score=(p_result->>'match_score')::numeric,liveness_score=(p_result->>'liveness_score')::numeric,
  claim_token=null,lease_until=null where id=attempt.id;
 return jsonb_build_object('id',attempt.id,'state',case when passed then 'passed' else 'failed' end);
end $$;

create function public.chefos_selfie_release(p_actor uuid,p_id uuid,p_claim uuid) returns void
language plpgsql security definer set search_path='' as $$begin
 update chefos_private.selfie_attempts a set state='pending',claim_token=null,lease_until=null
  from public.chefos_chefs c where a.id=p_id and a.chef_id=c.id and c.user_id=p_actor and a.claim_token=p_claim and a.state='processing';
end $$;

create function public.chefos_selfie_cleanup(p_done uuid[] default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_done is not null then
  update chefos_private.selfie_attempts set last_cleaned_at=now(),purged_at=case when created_at<now()-interval '3 hours' then now() end where id=any(p_done);
  return '{"cleaned":true}';
 end if;
 with selected as (
  select a.id from chefos_private.selfie_attempts a where a.purged_at is null
   and (a.last_cleaned_at is null or a.last_cleaned_at<now()-interval '5 minutes')
   and (a.state in ('passed','failed') or (a.expires_at<now() and coalesce(a.lease_until,now()-interval '1 second')<now()))
   order by a.created_at for update skip locked limit 100
 ), updated as (
  update chefos_private.selfie_attempts a set state=case when a.state in ('pending','processing') then 'failed' else a.state end
   where a.id in (select id from selected) returning a.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'object_key',a.object_key,
  'orphan_reference',case when not exists(select 1 from chefos_private.chef_selfies where object_key=a.reference_key) then a.reference_key end)),'[]') into result from updated a;
 return result;
end $$;
revoke all on function public.chefos_selfie_ticket(uuid,uuid),public.chefos_selfie_claim(uuid,uuid,text),public.chefos_selfie_finish(uuid,uuid,uuid,jsonb),public.chefos_selfie_release(uuid,uuid,uuid),public.chefos_selfie_cleanup(uuid[]) from public,anon,authenticated;
grant execute on function public.chefos_selfie_ticket(uuid,uuid),public.chefos_selfie_claim(uuid,uuid,text),public.chefos_selfie_finish(uuid,uuid,uuid,jsonb),public.chefos_selfie_release(uuid,uuid,uuid),public.chefos_selfie_cleanup(uuid[]) to service_role;

create or replace function public.chefos_ops_safety_data() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.chefos_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'is_verified',c.is_verified,'cuisines',c.cuisines,
  'identity_enrolled',exists(select 1 from chefos_private.chef_identities i where i.chef_id=c.id),
  'selfie_enrolled',s.id is not null,'selfie_enrolled_at',s.enrolled_at) order by c.name),'[]')
  from public.chefos_chefs c left join chefos_private.chef_selfies s on s.chef_id=c.id where c.is_active));
end $$;

-- Registration enrolment is required before account approval or going online.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.chefos_ops_update(text,uuid,jsonb)'::regprocedure);
 definition:=replace(definition,'update public.chefos_chefs set is_verified=',
  'if ((p_changes->>''is_verified'')::boolean or (p_changes->>''is_available'')::boolean) and not exists(select 1 from chefos_private.chef_selfies where chef_id=p_id) then raise exception ''Complete registration selfie verification before approving or activating this chef''; end if; update public.chefos_chefs set is_verified=');
 execute definition;
 definition:=pg_get_functiondef('chefos_private.chefos_mobile_legacy(text,jsonb)'::regprocedure);
 definition:=replace(definition,'update public.chefos_chefs set is_available=(p_data->>''is_available'')::boolean where id=own_chef.id;',
  'if (p_data->>''is_available'')::boolean and not exists(select 1 from chefos_private.chef_selfies where chef_id=own_chef.id) then raise exception ''Complete your registration selfie before going online''; end if; update public.chefos_chefs set is_available=(p_data->>''is_available'')::boolean where id=own_chef.id;');
 execute definition;
end $$;
