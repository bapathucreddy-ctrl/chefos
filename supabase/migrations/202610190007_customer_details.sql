alter table public.chefos_profiles add column full_name text not null default '';
alter table public.chefos_profiles add column city text not null default '';
create function public.chefos_complete_profile(p_full_name text,p_city text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=chefos_private.require_actor();
begin
 if not exists(select 1 from public.chefos_profiles where id=actor and role='customer') then raise exception 'Customer account required' using errcode='42501'; end if;
 if length(trim(p_full_name)) not between 2 and 100 or length(trim(p_city)) not between 2 and 100 or p_full_name is null or p_city is null then raise exception 'Enter your name and city'; end if;
 update public.chefos_profiles set full_name=trim(p_full_name),city=trim(p_city) where id=actor;
 return '{"updated":true}';
end $$;
revoke all on function public.chefos_complete_profile(text,text) from public,anon;
grant execute on function public.chefos_complete_profile(text,text) to authenticated;
