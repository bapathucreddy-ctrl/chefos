-- New purchases must use interval reservations and confirmed menus. Retain
-- captured historical order recovery, without accepting new legacy checkouts.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.chefos_server_prepare_order(uuid,jsonb)'::regprocedure);
 definition:=replace(definition,
  'if p_booking->>''instant_request_id'' is null then return chefos_private.chefos_prepare_subscription(p_actor,p_booking); end if;',
  'if p_booking->>''instant_request_id'' is null then
   if coalesce((p_booking->>''schedule_version'')::integer,1)<>2 then raise exception ''Upgrade Chefos and confirm your menu and cooking visits before paying''; end if;
   return chefos_private.chefos_prepare_subscription(p_actor,p_booking); end if;');
 execute definition;
 definition:=pg_get_functiondef('public.chefos_mobile_action(text,jsonb)'::regprocedure);
 definition:=replace(definition,'declare result jsonb; offers jsonb;begin',
  'declare result jsonb; offers jsonb;begin
   if p_action=''instant.create'' or (p_action=''instant.respond'' and not exists(select 1 from chefos_private.instant_bookings where request_id=(p_data->>''request_id'')::uuid)) then raise exception ''Upgrade Chefos to request or accept a cuisine-based instant visit''; end if;');
 execute definition;
end $$;
