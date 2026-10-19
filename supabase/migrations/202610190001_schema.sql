-- Additive migration: Chefos objects are namespaced to avoid existing tables.
create schema if not exists chefos_private;
revoke all on schema chefos_private from public, anon, authenticated;
grant usage on schema chefos_private to service_role;

create table public.chefos_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (length(username) between 1 and 100),
  email text not null default '',
  phone text not null default '',
  role text not null default 'customer' check (role in ('customer','chef','admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index chefos_username_unique on public.chefos_profiles(lower(username));

create table public.chefos_chefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.chefos_profiles(id),
  name text not null,
  speciality text not null default '',
  rating numeric(3,2) not null default 4.0 check (rating between 0 and 5),
  is_verified boolean not null default false,
  is_available boolean not null default false,
  is_active boolean not null default true,
  available_waves jsonb not null default '{"breakfast":["B1","B2","B3"],"lunch":["L1","L2","L3"],"dinner":["D1","D2","D3"]}',
  created_at timestamptz not null default now()
);
create table chefos_private.chef_rate_inputs (
  chef_id uuid primary key references public.chefos_chefs(id) on delete cascade,
  subscriber_ratings integer not null default 0 check (subscriber_ratings >= 0),
  tenure_months integer not null default 0 check (tenure_months >= 0),
  meals_served integer not null default 0 check (meals_served >= 0),
  certified_specialty boolean not null default false,
  pilot_rate integer check (pilot_rate > 0),
  pilot_started_at date,
  updated_at timestamptz not null default now()
);
create table chefos_private.chef_locations (
  chef_id uuid primary key references public.chefos_chefs(id) on delete cascade,
  latitude numeric not null check (latitude between -90 and 90),
  longitude numeric not null check (longitude between -180 and 180),
  updated_at timestamptz not null default now()
);
create table public.chefos_preferences (
  user_id uuid primary key references public.chefos_profiles(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create table public.chefos_assignments (
  user_id uuid primary key references public.chefos_profiles(id) on delete cascade,
  chef_id uuid not null references public.chefos_chefs(id),
  assigned_at timestamptz not null default now()
);
create table public.chefos_weekly_menus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.chefos_profiles(id) on delete cascade,
  dishes jsonb not null,
  generation jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index chefos_menu_owner on public.chefos_weekly_menus(user_id, created_at desc);
create table public.chefos_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.chefos_profiles(id),
  chef_id uuid not null references public.chefos_chefs(id),
  meal_type text[] not null check (cardinality(meal_type) between 1 and 3 and meal_type <@ array['breakfast','lunch','dinner']::text[]),
  meal_wave jsonb not null default '{}',
  people_count integer not null check (people_count between 1 and 8),
  plan_cycle text not null check (plan_cycle in ('weekly','monthly','quarterly')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  price integer not null check (price >= 0),
  currency text not null default 'INR',
  pricing jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index chefos_one_active_plan on public.chefos_subscriptions(user_id) where is_active;
create index chefos_chef_plans on public.chefos_subscriptions(chef_id, end_date) where is_active;
create table chefos_private.subscription_terms (
  subscription_id uuid primary key references public.chefos_subscriptions(id) on delete cascade,
  quote jsonb not null
);
create table chefos_private.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.chefos_profiles(id),
  order_id text not null unique,
  payment_id text unique,
  status text not null default 'created' check (status in ('created','paid','failed','refunded')),
  amount integer not null check (amount > 0),
  currency text not null default 'INR',
  quote jsonb not null,
  booking jsonb not null,
  subscription_id uuid unique references public.chefos_subscriptions(id),
  created_at timestamptz not null default now()
);
create table public.chefos_instant_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.chefos_profiles(id),
  status text not null default 'searching' check (status in ('searching','accepted','cancelled','no_chef','completed')),
  meal text not null default 'lunch' check (meal in ('breakfast','lunch','dinner')),
  wave text not null default 'L2',
  accepted_chef uuid references public.chefos_chefs(id),
  created_at timestamptz not null default now()
);
create unique index chefos_one_instant_request on public.chefos_instant_requests(user_id) where status in ('searching','accepted');
create table chefos_private.instant_details (
  request_id uuid primary key references public.chefos_instant_requests(id) on delete cascade,
  latitude numeric not null check (latitude between -90 and 90),
  longitude numeric not null check (longitude between -180 and 180),
  quote jsonb,
  rating integer check (rating between 1 and 5),
  comment text not null default ''
);
create table public.chefos_instant_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.chefos_instant_requests(id),
  chef_id uuid not null references public.chefos_chefs(id),
  status text not null default 'pending' check (status in ('pending','accepted','declined','skipped')),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  unique (request_id, chef_id)
);
create table chefos_private.service_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.chefos_profiles(id),
  chef_id uuid not null references public.chefos_chefs(id),
  subscription_id uuid references public.chefos_subscriptions(id),
  instant_request_id uuid unique references public.chefos_instant_requests(id),
  service_date date not null default current_date,
  meal text not null check (meal in ('breakfast','lunch','dinner')),
  wave text not null,
  status text not null default 'assigned' check (status in ('assigned','start_otp','started','end_otp','completed')),
  journey_started_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  otp_code text,
  otp_expires_at timestamptz,
  otp_attempts integer not null default 0,
  unique (subscription_id, service_date, meal),
  check (num_nonnulls(subscription_id, instant_request_id) = 1)
);
create table public.chefos_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.chefos_profiles(id),
  subscription_id uuid not null references public.chefos_subscriptions(id),
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique(user_id,subscription_id)
);
create table chefos_private.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create table chefos_private.audit_log (
  id bigint generated always as identity primary key,
  actor uuid references public.chefos_profiles(id),
  action text not null,
  object_id text,
  changes jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create function public.chefos_is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.chefos_profiles where id = auth.uid() and role = 'admin' and is_active)
$$;
revoke all on function public.chefos_is_admin() from public;
grant execute on function public.chefos_is_admin() to anon, authenticated, service_role;
create function chefos_private.require_actor() returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.chefos_profiles where id = auth.uid() and is_active) then
    raise exception 'Sign in with an active Chefos account' using errcode='42501';
  end if;
  return auth.uid();
end $$;
revoke all on function chefos_private.require_actor() from public;

-- Metadata can choose customer or unverified chef onboarding; it can NEVER
-- choose administrator privileges. Admin membership is provisioned privately.
create function chefos_private.on_auth_user_created() returns trigger language plpgsql security definer set search_path = '' as $$
declare account_role text := case when new.raw_user_meta_data->>'account_type' = 'chef' then 'chef' else 'customer' end;
begin
  insert into public.chefos_profiles(id,username,email,phone,role)
  values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''),split_part(coalesce(new.email,new.id::text),'@',1)),coalesce(new.email,''),left(coalesce(new.raw_user_meta_data->>'phone',''),20),account_role);
  if account_role='chef' then
    insert into public.chefos_chefs(user_id,name,speciality) values(new.id,
      left(coalesce(nullif(new.raw_user_meta_data->>'name',''),new.raw_user_meta_data->>'username','Chef'),100),
      left(coalesce(new.raw_user_meta_data->>'speciality',''),100));
  end if;
  return new;
end $$;
revoke all on function chefos_private.on_auth_user_created() from public;
create trigger chefos_auth_signup after insert on auth.users for each row execute function chefos_private.on_auth_user_created();

alter table public.chefos_profiles enable row level security;
alter table public.chefos_chefs enable row level security;
alter table public.chefos_preferences enable row level security;
alter table public.chefos_assignments enable row level security;
alter table public.chefos_weekly_menus enable row level security;
alter table public.chefos_subscriptions enable row level security;
alter table public.chefos_instant_requests enable row level security;
alter table public.chefos_instant_offers enable row level security;
alter table public.chefos_feedback enable row level security;
-- Private data has RLS too, even though this schema is not exposed by the API.
alter table chefos_private.chef_rate_inputs enable row level security;
alter table chefos_private.chef_locations enable row level security;
alter table chefos_private.subscription_terms enable row level security;
alter table chefos_private.payments enable row level security;
alter table chefos_private.instant_details enable row level security;
alter table chefos_private.service_sessions enable row level security;
alter table chefos_private.app_config enable row level security;
alter table chefos_private.audit_log enable row level security;

create policy chefos_profile_read on public.chefos_profiles for select to authenticated using (id=auth.uid() or public.chefos_is_admin());
create function public.chefos_is_active() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.chefos_profiles where id=auth.uid() and is_active)
$$;
revoke all on function public.chefos_is_active() from public;
grant execute on function public.chefos_is_active() to authenticated;
-- Restrictive policies compose with the ownership policies below. A suspended
-- account can only read its own profile to learn why access was refused.
create policy chefos_active_chef on public.chefos_chefs as restrictive for select to authenticated using(public.chefos_is_active());
create policy chefos_active_preference on public.chefos_preferences as restrictive for select to authenticated using(public.chefos_is_active());
create policy chefos_active_assignment on public.chefos_assignments as restrictive for select to authenticated using(public.chefos_is_active());
create policy chefos_active_menu on public.chefos_weekly_menus as restrictive for select to authenticated using(public.chefos_is_active());
create policy chefos_active_plan on public.chefos_subscriptions as restrictive for select to authenticated using(public.chefos_is_active());
create policy chefos_active_instant on public.chefos_instant_requests as restrictive for select to authenticated using(public.chefos_is_active());
create policy chefos_active_offer on public.chefos_instant_offers as restrictive for select to authenticated using(public.chefos_is_active());
create policy chefos_active_feedback on public.chefos_feedback as restrictive for select to authenticated using(public.chefos_is_active());
create policy chefos_chef_read on public.chefos_chefs for select to authenticated using ((is_verified and is_active) or user_id=auth.uid() or public.chefos_is_admin());
create policy chefos_preference_read on public.chefos_preferences for select to authenticated using (user_id=auth.uid() or public.chefos_is_admin());
create policy chefos_assignment_read on public.chefos_assignments for select to authenticated using (user_id=auth.uid() or public.chefos_is_admin());
create policy chefos_menu_read on public.chefos_weekly_menus for select to authenticated using (user_id=auth.uid() or public.chefos_is_admin());
create policy chefos_plan_read on public.chefos_subscriptions for select to authenticated using (user_id=auth.uid() or public.chefos_is_admin());
create policy chefos_instant_read on public.chefos_instant_requests for select to authenticated using (user_id=auth.uid() or public.chefos_is_admin());
create policy chefos_offer_read on public.chefos_instant_offers for select to authenticated using (chef_id in (select id from public.chefos_chefs where user_id=auth.uid()) or public.chefos_is_admin());
create policy chefos_feedback_read on public.chefos_feedback for select to authenticated using (user_id=auth.uid() or public.chefos_is_admin());

-- All writes use narrow, audited RPCs. No browser/mobile client can change role,
-- verified metrics, prices, payment state, or booking ownership through REST.
revoke all on public.chefos_profiles,public.chefos_chefs,public.chefos_preferences,public.chefos_assignments,public.chefos_weekly_menus,public.chefos_subscriptions,public.chefos_instant_requests,public.chefos_instant_offers,public.chefos_feedback from anon,authenticated;
grant select on public.chefos_profiles,public.chefos_chefs,public.chefos_preferences,public.chefos_assignments,public.chefos_weekly_menus,public.chefos_subscriptions,public.chefos_instant_requests,public.chefos_instant_offers,public.chefos_feedback to authenticated;
revoke all on all tables in schema chefos_private from public,anon,authenticated;
grant all on all tables in schema chefos_private to service_role;
grant all on public.chefos_profiles,public.chefos_chefs,public.chefos_preferences,public.chefos_assignments,public.chefos_weekly_menus,public.chefos_subscriptions,public.chefos_instant_requests,public.chefos_instant_offers,public.chefos_feedback to service_role;
