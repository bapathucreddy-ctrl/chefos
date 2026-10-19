create function public.chefos_ops_data(p_section text,p_search text default '',p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare result jsonb; total bigint; offset_rows integer:=(greatest(1,p_page)-1)*20; q text:='%'||left(p_search,100)||'%';
begin
  if not public.chefos_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  if p_page<1 or p_page>100000 then raise exception 'Invalid page'; end if;
  if p_section='overview' then
    return jsonb_build_object('customers',(select count(*) from public.chefos_profiles where role='customer'),
      'chefs',(select count(*) from public.chefos_chefs),'available_chefs',(select count(*) from public.chefos_chefs where is_available and is_verified and is_active),
      'pending_chefs',(select count(*) from public.chefos_chefs where not is_verified),
      'active_plans',(select count(*) from public.chefos_subscriptions where is_active and end_date>=current_date),
      'renewals_due',(select count(*) from public.chefos_subscriptions where is_active and end_date between current_date and current_date+7),
      'paid_revenue_paise',(select coalesce(sum(amount),0) from chefos_private.payments where status='paid'),
      'open_requests',(select count(*) from public.chefos_instant_requests where status='searching'),
      'chart',(select coalesce(jsonb_agg(x order by x.day),'[]') from (
        select tick::date as "day",coalesce((select sum(amount) from chefos_private.payments where status='paid' and created_at::date=tick::date),0) amount_paise
        from generate_series(current_date-6,current_date,interval '1 day') tick) x),
      'recent_plans',(select coalesce(jsonb_agg(x),'[]') from (select s.id,p.username,c.name chef,s.price,s.currency,s.plan_cycle,s.is_active,s.created_at
        from public.chefos_subscriptions s join public.chefos_profiles p on p.id=s.user_id join public.chefos_chefs c on c.id=s.chef_id order by s.created_at desc limit 5) x),
      'activity',(select coalesce(jsonb_agg(x),'[]') from (select a.id,p.username,a.action,a.object_id,a.created_at from chefos_private.audit_log a left join public.chefos_profiles p on p.id=a.actor order by a.created_at desc limit 6) x));
  elsif p_section='customers' then
    select count(*) into total from public.chefos_profiles where role='customer' and (username ilike q or email ilike q);
    select coalesce(jsonb_agg(x),'[]') into result from (select p.id,p.username,p.email,p.phone,p.is_active,p.created_at,
      (select count(*) from public.chefos_subscriptions where user_id=p.id) plans
      from public.chefos_profiles p where p.role='customer' and (p.username ilike q or p.email ilike q) order by p.created_at desc limit 20 offset offset_rows) x;
  elsif p_section='chefs' then
    select count(*) into total from public.chefos_chefs where name ilike q or speciality ilike q;
    select coalesce(jsonb_agg(x),'[]') into result from (select c.*,p.email,
      coalesce(to_jsonb(r)-'chef_id','{}') rate_inputs
      from public.chefos_chefs c left join public.chefos_profiles p on p.id=c.user_id left join chefos_private.chef_rate_inputs r on r.chef_id=c.id
      where c.name ilike q or c.speciality ilike q order by c.is_verified,c.created_at desc limit 20 offset offset_rows) x;
  elsif p_section='subscriptions' then
    select count(*) into total from public.chefos_subscriptions s join public.chefos_profiles p on p.id=s.user_id where p.username ilike q or s.id::text ilike q;
    select coalesce(jsonb_agg(x),'[]') into result from (select s.*,p.username,c.name chef,
      case when s.end_date<current_date then 'expired' when s.is_active then 'active' else 'paused' end status
      from public.chefos_subscriptions s join public.chefos_profiles p on p.id=s.user_id join public.chefos_chefs c on c.id=s.chef_id
      where p.username ilike q or s.id::text ilike q order by s.created_at desc limit 20 offset offset_rows) x;
  elsif p_section='payments' then
    select count(*) into total from chefos_private.payments pay join public.chefos_profiles p on p.id=pay.user_id where p.username ilike q or pay.order_id ilike q;
    select coalesce(jsonb_agg(x),'[]') into result from (select pay.id,p.username,pay.order_id,pay.payment_id,pay.amount,pay.currency,pay.status,pay.created_at
      from chefos_private.payments pay join public.chefos_profiles p on p.id=pay.user_id
      where p.username ilike q or pay.order_id ilike q order by pay.created_at desc limit 20 offset offset_rows) x;
  elsif p_section='pricing' then
    return jsonb_build_object('definition',(select value from chefos_private.app_config where key='pricing'),'catalog',public.chefos_pricing_catalog());
  elsif p_section='activity' then
    select count(*) into total from chefos_private.audit_log;
    select coalesce(jsonb_agg(x),'[]') into result from (select a.id,p.username,a.action,a.object_id,a.changes,a.created_at from chefos_private.audit_log a left join public.chefos_profiles p on p.id=a.actor order by a.created_at desc limit 20 offset offset_rows) x;
  else raise exception 'Unknown admin section'; end if;
  return jsonb_build_object('rows',result,'count',total,'page',p_page,'page_size',20);
end $$;
revoke all on function public.chefos_ops_data(text,text,integer) from public;
grant execute on function public.chefos_ops_data(text,text,integer) to authenticated;

create function public.chefos_ops_update(p_section text,p_id uuid,p_changes jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare k text; chef public.chefos_chefs%rowtype; old_values jsonb; updated_values jsonb; rates chefos_private.chef_rate_inputs%rowtype;
begin
  if not public.chefos_is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  if jsonb_typeof(p_changes)<>'object' or p_changes='{}' then raise exception 'No changes supplied'; end if;
  if p_section='chefs' then
    for k in select jsonb_object_keys(p_changes) loop
      if k not in ('is_active','is_available','is_verified') or jsonb_typeof(p_changes->k)<>'boolean' then raise exception 'Invalid chef update'; end if;
    end loop;
    select * into strict chef from public.chefos_chefs where id=p_id for update;
    old_values:=to_jsonb(chef); updated_values:=old_values||p_changes;
    if not (updated_values->>'is_verified')::boolean or not (updated_values->>'is_active')::boolean then updated_values:=updated_values||'{"is_available":false}'; end if;
    update public.chefos_chefs set is_verified=(updated_values->>'is_verified')::boolean,is_active=(updated_values->>'is_active')::boolean,is_available=(updated_values->>'is_available')::boolean where id=p_id;
  elsif p_section='chef_rates' then
    for k in select jsonb_object_keys(p_changes) loop
      if k not in ('subscriber_ratings','tenure_months','meals_served','certified_specialty','pilot_rate','pilot_started_at') then raise exception 'Invalid rate input'; end if;
    end loop;
    perform 1 from public.chefos_chefs where id=p_id for update;
    if not found then raise exception 'Chef not found'; end if;
    select * into rates from chefos_private.chef_rate_inputs where chef_id=p_id;
    old_values:=coalesce(to_jsonb(rates),'{}');
    rates:=jsonb_populate_record(null::chefos_private.chef_rate_inputs,old_values||p_changes||jsonb_build_object('chef_id',p_id));
    insert into chefos_private.chef_rate_inputs(chef_id,subscriber_ratings,tenure_months,meals_served,certified_specialty,pilot_rate,pilot_started_at)
    values(p_id,coalesce(rates.subscriber_ratings,0),coalesce(rates.tenure_months,0),coalesce(rates.meals_served,0),coalesce(rates.certified_specialty,false),rates.pilot_rate,rates.pilot_started_at)
    on conflict(chef_id) do update set subscriber_ratings=excluded.subscriber_ratings,tenure_months=excluded.tenure_months,meals_served=excluded.meals_served,certified_specialty=excluded.certified_specialty,pilot_rate=excluded.pilot_rate,pilot_started_at=excluded.pilot_started_at,updated_at=now();
  elsif p_section='customers' then
    if p_changes- 'is_active'<>'{}' or jsonb_typeof(p_changes->'is_active')<>'boolean' then raise exception 'Only account availability can be changed'; end if;
    select to_jsonb(p) into old_values from public.chefos_profiles p where id=p_id and role='customer' for update;
    if old_values is null or p_id=auth.uid() then raise exception 'Customer account not found'; end if;
    update public.chefos_profiles set is_active=(p_changes->>'is_active')::boolean where id=p_id;
  elsif p_section='subscriptions' then
    if p_changes-'is_active'<>'{}' or jsonb_typeof(p_changes->'is_active')<>'boolean' then raise exception 'Only service availability can be changed'; end if;
    select to_jsonb(s) into old_values from public.chefos_subscriptions s where id=p_id for update;
    if old_values is null then raise exception 'Subscription not found'; end if;
    if (p_changes->>'is_active')::boolean and ((old_values->>'end_date')::date<current_date or not exists(select 1 from chefos_private.payments where subscription_id=p_id and status='paid')) then raise exception 'A valid paid billing period is required to resume service'; end if;
    if (p_changes->>'is_active')::boolean then
      perform 1 from public.chefos_chefs where id=(old_values->>'chef_id')::uuid and is_verified and is_active for update;
      if not found then raise exception 'Chef is unavailable'; end if;
      if exists(select 1 from public.chefos_subscriptions s cross join lateral unnest(s.meal_type) m(value)
        where s.id<>p_id and s.chef_id=(old_values->>'chef_id')::uuid and s.is_active
        and s.start_date<=(old_values->>'end_date')::date and s.end_date>=(old_values->>'start_date')::date
        and old_values->'meal_type' ? m.value
        and coalesce(s.meal_wave->>m.value,case m.value when 'breakfast' then 'B2' when 'lunch' then 'L2' else 'D2' end)=coalesce(old_values#>>array['meal_wave',m.value],case m.value when 'breakfast' then 'B2' when 'lunch' then 'L2' else 'D2' end)) then raise exception 'This chef slot has another active plan'; end if;
    end if;
    update public.chefos_subscriptions set is_active=(p_changes->>'is_active')::boolean where id=p_id;
  else raise exception 'This section is read-only'; end if;
  insert into chefos_private.audit_log(actor,action,object_id,changes) values(auth.uid(),p_section||'.updated',p_id::text,p_changes);
  return '{"updated":true}';
end $$;
revoke all on function public.chefos_ops_update(text,uuid,jsonb) from public;
grant execute on function public.chefos_ops_update(text,uuid,jsonb) to authenticated;
