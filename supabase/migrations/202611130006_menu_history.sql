create table chefos_private.menu_revisions (
 menu_id uuid not null references chefos_private.menus(id), version integer not null,
 document jsonb not null, provider text not null, created_at timestamptz not null default now(),
 primary key(menu_id,version)
);
alter table chefos_private.menu_revisions enable row level security;
revoke all on chefos_private.menu_revisions from public,anon,authenticated,service_role;
create function chefos_private.menu_history() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into chefos_private.menu_revisions(menu_id,version,document,provider) values(new.id,new.version,new.document,new.provider) on conflict do nothing;
 return new;
end $$;
revoke all on function chefos_private.menu_history() from public,anon,authenticated,service_role;
create trigger chefos_menu_history after insert or update of version on chefos_private.menus for each row execute function chefos_private.menu_history();
create function chefos_private.preserve_cooked_meals(p_menu chefos_private.menus,p_next jsonb) returns jsonb
language plpgsql stable set search_path='' set timezone='Asia/Kolkata' as $$
declare d jsonb; selected_meal text; idx integer:=0; result jsonb:=p_next;
begin
 if p_menu.subscription_id is null then return result; end if;
 for d in select value from jsonb_array_elements(p_menu.document->'days') loop
  for selected_meal in select jsonb_object_keys(d->'meals') loop
   if (d->>'date')::date<current_date or exists(select 1 from chefos_private.service_sessions ss
    where ss.subscription_id=p_menu.subscription_id and ss.service_date=(d->>'date')::date
    and selected_meal=any(coalesce(ss.meal_types,array[ss.meal])) and ss.status in ('started','end_otp','completed')) then
    result:=jsonb_set(result,array['days',idx::text,'meals',selected_meal],d#>array['meals',selected_meal]);
   end if;
  end loop;
  idx:=idx+1;
 end loop;
 return result;
end $$;
revoke all on function chefos_private.preserve_cooked_meals(chefos_private.menus,jsonb) from public,anon,authenticated,service_role;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.chefos_server_finish_menu(uuid,uuid,jsonb,text,boolean)'::regprocedure);
 definition:=replace(definition,'set document=p_document,provider=p_provider,','set document=chefos_private.preserve_cooked_meals(m,p_document),provider=p_provider,');
 execute definition;
end $$;
