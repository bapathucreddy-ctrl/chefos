create function public.chefos_ops_buildings() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.chefos_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'latitude',b.latitude,'longitude',b.longitude,'active',b.active,
  'households',(select count(*) from chefos_private.households h where h.building_id=b.id)) order by b.name),'[]') from chefos_private.buildings b));
end $$;
revoke all on function public.chefos_ops_buildings() from public,anon;
grant execute on function public.chefos_ops_buildings() to authenticated;
