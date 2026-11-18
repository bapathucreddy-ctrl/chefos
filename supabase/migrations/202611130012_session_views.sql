create function public.chefos_sessions() returns jsonb language plpgsql stable security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid:=chefos_private.require_actor(); result jsonb;begin
 select coalesce(jsonb_agg(jsonb_build_object('id',ss.id,'instant_request_id',ss.instant_request_id,'visit_id',ss.visit_id,'meals',coalesce(ss.meal_types,array[ss.meal]),
  'status',ss.status,'service_date',ss.service_date,'chef_name',c.name,'customer_name',p.username,'starts_at',v.starts_at,'ends_at',v.ends_at,
  'building_name',b.name,'flat',v.flat,'latitude',b.latitude,'longitude',b.longitude,
  'start_otp',case when actor=ss.user_id and ss.status='start_otp' and ss.otp_expires_at>now() then ss.otp_code end,
  'end_otp',case when actor=ss.user_id and ss.status='end_otp' and ss.otp_expires_at>now() then ss.otp_code end) order by ss.service_date,v.starts_at),'[]') into result
 from chefos_private.service_sessions ss join public.chefos_chefs c on c.id=ss.chef_id join public.chefos_profiles p on p.id=ss.user_id
 left join chefos_private.visits v on v.id=ss.visit_id left join chefos_private.buildings b on b.id=v.building_id where (ss.user_id=actor or (c.user_id=actor and c.is_verified and c.is_active))
 and ss.service_date between current_date-14 and current_date+7;
 return jsonb_build_object('rows',result);
end $$;
revoke all on function public.chefos_sessions() from public,anon;
grant execute on function public.chefos_sessions() to authenticated;
