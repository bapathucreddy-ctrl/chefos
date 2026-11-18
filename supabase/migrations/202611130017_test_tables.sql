-- Test and production use the same Supabase Auth instance. Business records,
-- foreign keys, policies, triggers and RPCs use independent _test relations.
create schema chefos_test_private;
revoke all on schema chefos_test_private from public,anon,authenticated;
grant usage on schema chefos_test_private to service_role;

create function chefos_private._rewrite_for_test(definition text) returns text
language plpgsql stable set search_path='' as $$
declare item record;
begin
 for item in
  select n.nspname schema_name,c.relname object_name from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where c.relkind='r' and ((n.nspname='public' and c.relname like 'chefos\_%' escape '\' and c.relname not like '%\_test' escape '\') or n.nspname='chefos_private')
  union select 'public',p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like 'chefos\_%' escape '\' and p.proname not like '%\_test' escape '\'
 loop
  definition:=regexp_replace(definition,'\m'||item.schema_name||'\.'||item.object_name||'\M',item.schema_name||'.'||item.object_name||'_test','g');
  definition:=regexp_replace(definition,'\m'||item.object_name||'\.',item.object_name||'_test.','g');
 end loop;
 return replace(definition,'chefos_private.','chefos_test_private.');
end $$;
revoke all on function chefos_private._rewrite_for_test(text) from public,anon,authenticated,service_role;

do $$
declare item record; child record; target_schema text; definition text; target_signature text; role_name text; command text;
begin
 perform set_config('search_path','',true);
 perform set_config('check_function_bodies','off',true);
 -- LIKE INCLUDING ALL gives each identity column its own sequence and indexes.
 for item in select n.nspname schema_name,c.relname,c.oid,c.relrowsecurity,c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r'
   and ((n.nspname='public' and c.relname like 'chefos\_%' escape '\' and c.relname not like '%\_test' escape '\') or n.nspname='chefos_private')
 loop
  target_schema:=case when item.schema_name='public' then 'public' else 'chefos_test_private' end;
  execute format('create table %I.%I (like %I.%I including all)',target_schema,item.relname||'_test',item.schema_name,item.relname);
  execute format('revoke all on %I.%I from public,anon,authenticated,service_role',target_schema,item.relname||'_test');
  if item.relrowsecurity then execute format('alter table %I.%I enable row level security',target_schema,item.relname||'_test'); end if;
  if item.relforcerowsecurity then execute format('alter table %I.%I force row level security',target_schema,item.relname||'_test'); end if;
 end loop;
 -- Rebind all business foreign keys to test tables. auth.users remains shared.
 for item in select con.conname,pg_get_constraintdef(con.oid) definition,n.nspname schema_name,c.relname
  from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
  where con.contype='f' and ((n.nspname='public' and c.relname like 'chefos\_%' escape '\' and c.relname not like '%\_test' escape '\') or n.nspname='chefos_private')
 loop
  target_schema:=case when item.schema_name='public' then 'public' else 'chefos_test_private' end;
  execute format('alter table %I.%I add constraint %I %s',target_schema,item.relname||'_test',item.conname,chefos_private._rewrite_for_test(item.definition));
 end loop;
 -- Private routines keep their names in a separate schema. Public RPC names
 -- carry _test so a client selects an environment explicitly.
 for item in select p.*,n.nspname schema_name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='public' and p.proname like 'chefos\_%' escape '\' and p.proname not like '%\_test' escape '\')
   or (n.nspname='chefos_private' and p.proname not in ('_rewrite_for_test','dispatch_worker'))
 loop
  definition:=chefos_private._rewrite_for_test(pg_get_functiondef(item.oid));
  execute definition;
  target_signature:=chefos_private._rewrite_for_test(format('%I.%I(%s)',item.schema_name,item.proname,pg_get_function_identity_arguments(item.oid)));
  execute format('revoke all on function %s from public,anon,authenticated,service_role',target_signature);
  for child in select * from aclexplode(coalesce(item.proacl,acldefault('f',item.proowner))) where privilege_type='EXECUTE' and grantee<>item.proowner loop
   role_name:=case when child.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(child.grantee)) end;
   execute format('grant execute on function %s to %s',target_signature,role_name);
  end loop;
 end loop;
 -- RLS expressions and triggers are rewritten using the same mapping.
 for item in select p.*,n.nspname schema_name,c.relname from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
  where (n.nspname='public' and c.relname like 'chefos\_%' escape '\' and c.relname not like '%\_test' escape '\') or n.nspname='chefos_private'
 loop
  target_schema:=case when item.schema_name='public' then 'public' else 'chefos_test_private' end;
  select string_agg(case when role_id=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(role_id)) end,',') into role_name from unnest(item.polroles) role_id;
  command:=case item.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end;
  definition:=format('create policy %I on %I.%I as %s for %s to %s',item.polname,target_schema,item.relname||'_test',case when item.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end,command,role_name);
  if item.polqual is not null then definition:=definition||' using ('||chefos_private._rewrite_for_test(pg_get_expr(item.polqual,item.polrelid))||')'; end if;
  if item.polwithcheck is not null then definition:=definition||' with check ('||chefos_private._rewrite_for_test(pg_get_expr(item.polwithcheck,item.polrelid))||')'; end if;
  execute definition;
 end loop;
 for item in select t.oid from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and ((n.nspname='public' and c.relname like 'chefos\_%' escape '\' and c.relname not like '%\_test' escape '\') or n.nspname='chefos_private')
 loop execute chefos_private._rewrite_for_test(pg_get_triggerdef(item.oid)); end loop;
 for item in select c.*,n.nspname schema_name from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r'
  and ((n.nspname='public' and c.relname like 'chefos\_%' escape '\' and c.relname not like '%\_test' escape '\') or n.nspname='chefos_private')
 loop
  target_schema:=case when item.schema_name='public' then 'public' else 'chefos_test_private' end;
  for child in select * from aclexplode(coalesce(item.relacl,acldefault('r',item.relowner))) where grantee<>item.relowner loop
   role_name:=case when child.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(child.grantee)) end;
   execute format('grant %s on table %I.%I to %s',child.privilege_type,target_schema,item.relname||'_test',role_name);
  end loop;
 end loop;
end $$;
drop function chefos_private._rewrite_for_test(text);

insert into chefos_test_private.app_config_test(key,value) select key,value from chefos_private.app_config where key='pricing';
insert into public.chefos_profiles_test(id,username,email,phone,role,is_active)
 select id,username,email,phone,role,is_active from public.chefos_profiles where role='admin';

-- New test identities are directed into test profiles by signup metadata.
-- A shared Auth identity may also explicitly enrol a separate test profile.
do $$declare definition text;begin
 definition:=pg_get_functiondef('chefos_private.on_auth_user_created()'::regprocedure);
 definition:=replace(definition,E'\nBEGIN',E'\nBEGIN\n if new.raw_user_meta_data->>''chefos_environment''=''test'' then return new; end if;');
 if definition not like '%chefos_environment%' then
  definition:=replace(definition,E'\nbegin',E'\nbegin\n if new.raw_user_meta_data->>''chefos_environment''=''test'' then return new; end if;');
 end if;
 if definition not like '%chefos_environment%' then raise exception 'Could not scope the signup trigger'; end if;
 execute definition;
end $$;
create trigger chefos_auth_signup_test after insert on auth.users for each row
 when(new.raw_user_meta_data->>'chefos_environment'='test') execute function chefos_test_private.on_auth_user_created();
create trigger chefos_auth_contact_test after update of email,phone on auth.users for each row execute function chefos_test_private.sync_auth_contact();

create function public.chefos_ensure_profile_test() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); identity_row auth.users%rowtype; account_role text;
begin
 select * into identity_row from auth.users where id=actor;
 if actor is null or identity_row.id is null then raise exception 'Sign in to use Chefos test' using errcode='42501'; end if;
 account_role:=case when identity_row.raw_user_meta_data->>'account_type'='chef' then 'chef' else 'customer' end;
 insert into public.chefos_profiles_test(id,username,email,phone,role)
 values(actor,'test_'||replace(actor::text,'-',''),coalesce(identity_row.email,''),coalesce(identity_row.phone,''),account_role) on conflict(id) do nothing;
 if account_role='chef' then
  insert into public.chefos_chefs_test(user_id,name,speciality)
  values(actor,coalesce(identity_row.raw_user_meta_data->>'name','Test chef'),coalesce(identity_row.raw_user_meta_data->>'speciality','')) on conflict(user_id) do nothing;
 end if;
 return '{"ready":true}';
end $$;
revoke all on function public.chefos_ensure_profile_test() from public,anon;
grant execute on function public.chefos_ensure_profile_test() to authenticated;

do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.chefos_live_locations_test; end if;
end $$;
