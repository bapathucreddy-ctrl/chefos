alter table public.chefos_chefs add column cuisines text[] not null default '{}';
create function public.chefos_ops_chef_safety(p_chef uuid,p_cuisines text[],p_reference text default null) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if not public.chefos_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_cuisines is null or cardinality(p_cuisines) not between 1 and 12 or cardinality(p_cuisines)<>(select count(distinct c) from unnest(p_cuisines)c)
  or not p_cuisines<@array['south_indian','north_indian','hyderabadi','andhra','kerala','tamil','punjabi','gujarati','maharashtrian','bengali','asian','continental']::text[] then raise exception 'Choose verified cuisine skills'; end if;
 update public.chefos_chefs set cuisines=p_cuisines where id=p_chef and is_active;
 if not found then raise exception 'Chef not found'; end if;
 if p_reference is not null and trim(p_reference)<>'' then
  perform public.chefos_ops_identity(p_chef,p_reference);
  update chefos_private.face_checks f set state='failed' where chef_id=p_chef and state in ('pending','passed')
   and not exists(select 1 from chefos_private.service_sessions ss where ss.id=f.session_id and ss.started_at is not null);
 end if;
 insert into chefos_private.audit_log(actor,action,object_id,changes) values(auth.uid(),'chef.cuisines_verified',p_chef::text,jsonb_build_object('cuisines',p_cuisines));
 return '{"saved":true}';
end $$;
create function public.chefos_ops_safety_data() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.chefos_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'is_verified',c.is_verified,'cuisines',c.cuisines,
  'identity_enrolled',exists(select 1 from chefos_private.chef_identities i where i.chef_id=c.id)) order by c.name),'[]') from public.chefos_chefs c where c.is_active));
end $$;
revoke all on function public.chefos_ops_chef_safety(uuid,text[],text),public.chefos_ops_safety_data() from public,anon;
grant execute on function public.chefos_ops_chef_safety(uuid,text[],text),public.chefos_ops_safety_data() to authenticated;
