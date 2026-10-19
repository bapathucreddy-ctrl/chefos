-- Phone-only identities may have an empty email. Keep usernames nonempty and
-- synchronize verified Auth contact changes without accepting client role data.
create or replace function chefos_private.on_auth_user_created() returns trigger
language plpgsql security definer set search_path='' as $$
declare account_role text:=case when new.raw_user_meta_data->>'account_type'='chef' then 'chef' else 'customer' end;
begin
 insert into public.chefos_profiles(id,username,email,phone,role)
 values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''),split_part(coalesce(nullif(new.email,''),new.id::text),'@',1)),coalesce(new.email,''),left(coalesce(nullif(new.phone,''),new.raw_user_meta_data->>'phone',''),20),account_role);
 if account_role='chef' then
  insert into public.chefos_chefs(user_id,name,speciality) values(new.id,
   left(coalesce(nullif(new.raw_user_meta_data->>'name',''),nullif(new.raw_user_meta_data->>'username',''),'Chef'),100),
   left(coalesce(new.raw_user_meta_data->>'speciality',''),100));
 end if;
 return new;
end $$;
revoke all on function chefos_private.on_auth_user_created() from public,anon,authenticated;
create function chefos_private.sync_auth_contact() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.chefos_profiles set email=coalesce(new.email,''),phone=left(coalesce(nullif(new.phone,''),new.raw_user_meta_data->>'phone',''),20) where id=new.id;
 return new;
end $$;
revoke all on function chefos_private.sync_auth_contact() from public,anon,authenticated;
create trigger chefos_auth_contact after update of email,phone on auth.users
 for each row execute function chefos_private.sync_auth_contact();
