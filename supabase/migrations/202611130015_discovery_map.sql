-- Map coordinates come from registered buildings and the chef's shared location.
-- Discovery rounds chef locations to three decimals. Visit addresses remain scoped
-- to the existing assigned-session endpoint.
create function public.chefos_discovery_map(p_lat numeric default null, p_lng numeric default null, p_radius numeric default 5)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=chefos_private.require_actor(); radius numeric; result jsonb;
begin
 if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
  raise exception 'Choose a valid map location';
 end if;
 radius:=least(5,greatest(0.5,coalesce(p_radius,5)));
 select jsonb_build_object(
  'chefs',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,
    'latitude',round(l.latitude,3),'longitude',round(l.longitude,3),'updated_at',l.updated_at)),'[]')
   from public.chefos_chefs c join chefos_private.chef_locations l on l.chef_id=c.id
   where c.is_active and c.is_verified and c.is_available
    and (p_lat is null or chefos_private.distance_km(p_lat,p_lng,l.latitude,l.longitude)<=radius)),
  'buildings',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,
    'latitude',b.latitude,'longitude',b.longitude,'kind','home') order by b.name),'[]')
   from chefos_private.buildings b where b.active)) into result;
 return result;
end $$;
revoke all on function public.chefos_discovery_map(numeric,numeric,numeric) from public,anon;
grant execute on function public.chefos_discovery_map(numeric,numeric,numeric) to authenticated;
