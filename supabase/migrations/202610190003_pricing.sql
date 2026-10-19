create function chefos_private.round_money(value numeric,step integer default 1) returns integer language sql immutable set search_path='' as $$
  select (round(value / step) * step)::integer
$$;
revoke all on function chefos_private.round_money(numeric,integer) from public;

create function chefos_private.coefficient(expression text) returns numeric language plpgsql immutable set search_path='' as $$
declare result numeric;
begin
  -- The definition's formulas use multiplication and round/round5. Extract a
  -- numeric factor only; config text is never executed as dynamic SQL.
  result := substring(expression from '\*\s*([0-9]+(?:\.[0-9]+)?)')::numeric;
  if result is null or result<=0 then raise exception 'Unsupported pricing formula'; end if;
  return result;
end $$;
revoke all on function chefos_private.coefficient(text) from public;

create function chefos_private.quote_rate(p_chef uuid,p_people integer,p_cycle text,p_meals integer) returns jsonb language plpgsql stable security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare
  cfg jsonb; band jsonb; card jsonb; metrics chefos_private.chef_rate_inputs%rowtype;
  chef_rating numeric:=0; payout integer; band_payout integer; bonus integer;
  rating_bonus integer:=0; tenure_bonus integer:=0; meals_bonus integer:=0;
  monthly integer; one_meal integer; amount integer; per_meal integer;
  size numeric; floor_price integer; floor_add integer; duration integer;
  coupon text:=''; discount integer:=0; pilot boolean:=false; chef_earns integer;
begin
  select value into strict cfg from chefos_private.app_config where key='pricing';
  if p_people is null or p_people<1 then raise exception 'Household size must be a positive whole number'; end if;
  select b into band from jsonb_array_elements(cfg#>'{household_size,bands}') b
    where p_people between (b->>'min')::integer and (b->>'max')::integer;
  if band is null then raise exception 'Households of 9 or more require a custom quote'; end if;
  if p_cycle not in ('weekly','monthly','quarterly','instant') or p_cycle is null then raise exception 'Invalid plan cycle'; end if;
  if p_meals is null or p_meals<1 or p_meals>(case when p_cycle='instant' then (cfg#>>'{instant,max_meals}')::integer else 3 end) then raise exception 'Invalid number of meals'; end if;
  card:=cfg->'chef_rate_card'; payout:=(card->>'base_payout_per_meal')::integer;
  if p_chef is not null then
    select rating into chef_rating from public.chefos_chefs where id=p_chef;
    if not found then raise exception 'Chef not found'; end if;
    select * into metrics from chefos_private.chef_rate_inputs where chef_id=p_chef;
    if found then
      select coalesce(max((b->>'bonus')::integer),0) into rating_bonus
      from jsonb_array_elements(card->'rating_bonus') b
      where chef_rating >= (b->>'min_rating')::numeric
        and metrics.subscriber_ratings>=coalesce((b#>>'{requires,min_subscriber_ratings}')::integer,0)
        and metrics.tenure_months>=coalesce((b#>>'{requires,min_tenure_months}')::integer,0)
        and metrics.meals_served>=coalesce((b#>>'{requires,min_meals_served}')::integer,0);
      select coalesce(max((b->>'bonus')::integer),0) into tenure_bonus from jsonb_array_elements(card->'tenure_bonus') b where metrics.tenure_months >= (b->>'min_months')::integer;
      select coalesce(max((b->>'bonus')::integer),0) into meals_bonus from jsonb_array_elements(card->'meals_served_bonus') b where metrics.meals_served >= (b->>'min_meals')::integer;
      payout:=least((card->>'payout_cap_per_meal')::integer,payout+rating_bonus+tenure_bonus+meals_bonus+
        case when metrics.certified_specialty then (card#>>'{specialty_bonus,certified_cuisine_specialty}')::integer else 0 end);
      pilot:=p_cycle<>'instant' and metrics.pilot_rate is not null and metrics.pilot_started_at<=current_date
        and current_date<(metrics.pilot_started_at+make_interval(months=>(cfg#>>'{pilot_cook_offer,duration_months}')::integer));
      pilot:=coalesce(pilot,false);
      if pilot then payout:=metrics.pilot_rate; end if;
    end if;
  end if;
  size:=(band->>'multiplier')::numeric;
  band_payout:=case when band->>'id'=cfg#>>'{household_size,base_band}' then payout else chefos_private.round_money(payout*size,5) end;
  floor_add:=substring(cfg#>>'{guards,price_floor,per_meal}' from '\+\s*([0-9]+)')::integer;
  if floor_add is null then raise exception 'Invalid pricing floor definition'; end if;
  floor_price:=band_payout+floor_add;
  monthly:=chefos_private.round_money(payout*chefos_private.coefficient(cfg#>>'{plans,monthly,per_meal_formula}'));
  if p_cycle='instant' then
    one_meal:=chefos_private.round_money(monthly*chefos_private.coefficient(cfg#>>'{instant,options,1_meal,customer_price_formula}'),5);
    if p_meals=1 then
      amount:=one_meal;
      chef_earns:=chefos_private.round_money(payout*chefos_private.coefficient(cfg#>>'{instant,options,1_meal,chef_earns_formula}'));
    else
      amount:=chefos_private.round_money(one_meal*chefos_private.coefficient(cfg#>>'{instant,options,2_meals,customer_price_formula}'),5);
      -- Preserve the exact configured numerator/denominator with numeric math.
      chef_earns:=chefos_private.round_money(amount*
        chefos_private.coefficient(cfg#>>'{instant,options,2_meals,chef_earns_formula}')/
        coalesce(substring(cfg#>>'{instant,options,2_meals,chef_earns_formula}' from '/\s*([0-9]+(?:\.[0-9]+)?)')::numeric,1),5);
    end if;
    if band->>'id'<>cfg#>>'{household_size,base_band}' then
      amount:=chefos_private.round_money(amount*size,5);
      chef_earns:=chefos_private.round_money(chef_earns*size,5);
    end if;
    amount:=greatest(amount,floor_price*p_meals);
    return jsonb_build_object('pricing_version',cfg#>>'{meta,version}','currency',cfg#>>'{meta,currency}',
      'plan_cycle','instant','people_count',p_people,'people_tier',band->>'id','meal_count',p_meals,
      'price_inr',amount,'amount_paise',amount*100,'chef_payout_total',chef_earns,'before_gst',true);
  end if;
  duration:=(cfg#>>array['plans',p_cycle,'days'])::integer;
  if pilot then
    one_meal:=chefos_private.round_money(payout*(1+(cfg#>>array['pilot_cook_offer','customer_markup_on_payout',p_cycle])::numeric));
  elsif p_cycle='monthly' then one_meal:=monthly;
  elsif p_cycle='weekly' then one_meal:=chefos_private.round_money(monthly*chefos_private.coefficient(cfg#>>'{plans,weekly,per_meal_formula}'),5);
  else one_meal:=chefos_private.round_money(monthly*chefos_private.coefficient(cfg#>>'{plans,quarterly,per_meal_formula}'));
  end if;
  per_meal:=greatest(floor_price,case when band->>'id'=cfg#>>'{household_size,base_band}' then one_meal else chefos_private.round_money(one_meal*size,5) end);
  if p_meals>1 and not pilot and (cfg#>>'{meal_bundles,auto_apply_at_checkout}')::boolean then
    coupon:='MEAL'||p_meals;
    discount:=chefos_private.round_money((cfg#>>array['meal_bundles',coupon,'per_meal_discount_inr_at_base_band',p_cycle])::numeric*size);
    per_meal:=greatest(floor_price,per_meal-discount);
  end if;
  amount:=per_meal*p_meals*duration;
  return jsonb_build_object('pricing_version',cfg#>>'{meta,version}','currency',cfg#>>'{meta,currency}',
    'plan_cycle',p_cycle,'days',duration,'people_count',p_people,'people_tier',band->>'id',
    'meal_count',p_meals,'total_meals',duration*p_meals,'per_meal_inr',per_meal,
    'price_inr',amount,'amount_paise',amount*100,'coupon_code',coupon,'before_gst',true,
    'chef_payout_per_meal',band_payout,'price_floor_per_meal',floor_price,'pilot_cook_rate',pilot);
end $$;
revoke all on function chefos_private.quote_rate(uuid,integer,text,integer) from public;

create function chefos_private.customer_quote(quote jsonb) returns jsonb language sql immutable set search_path='' as $$
 select quote-array['chef_payout_per_meal','chef_payout_total','price_floor_per_meal']::text[]
$$;
revoke all on function chefos_private.customer_quote(jsonb) from public;

create function public.chefos_price_quote(p_chef uuid default null,p_people integer default 3,p_cycle text default 'monthly',p_meals integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid; locked public.chefos_subscriptions%rowtype;
begin
  actor:=chefos_private.require_actor();
  if p_chef is not null and not exists(select 1 from public.chefos_chefs where id=p_chef and is_verified and is_active) then raise exception 'Chef is not available'; end if;
  if p_cycle<>'instant' then
    select * into locked from public.chefos_subscriptions where user_id=actor and is_active and end_date>=current_date;
    if found and locked.chef_id=p_chef and locked.people_count=p_people and locked.plan_cycle=p_cycle and cardinality(locked.meal_type)=p_meals then return locked.pricing||'{"price_locked":true}'::jsonb; end if;
  end if;
  return chefos_private.customer_quote(chefos_private.quote_rate(p_chef,p_people,p_cycle,p_meals));
end $$;
revoke all on function public.chefos_price_quote(uuid,integer,text,integer) from public;
grant execute on function public.chefos_price_quote(uuid,integer,text,integer) to authenticated;

create function public.chefos_pricing_catalog() returns jsonb language plpgsql stable security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare cfg jsonb; band jsonb; households jsonb:='[]'; plans jsonb; prices jsonb; instant jsonb; cycle text; n integer;
begin
  select value into strict cfg from chefos_private.app_config where key='pricing';
  for band in select value from jsonb_array_elements(cfg#>'{household_size,bands}') loop
    plans:='{}';
    foreach cycle in array array['weekly','monthly','quarterly'] loop
      prices:='{}';
      for n in 1..3 loop prices:=prices||jsonb_build_object(n::text,chefos_private.customer_quote(chefos_private.quote_rate(null,(band->>'min')::integer,cycle,n))); end loop;
      plans:=plans||jsonb_build_object(cycle,prices);
    end loop;
    instant:='{}';
    for n in 1..2 loop instant:=instant||jsonb_build_object(n::text,chefos_private.customer_quote(chefos_private.quote_rate(null,(band->>'min')::integer,'instant',n))); end loop;
    households:=households||jsonb_build_array(jsonb_build_object('id',band->>'id','label',band->>'label','plans',plans,'instant',instant));
  end loop;
  return jsonb_build_object('currency',cfg#>>'{meta,currency}','pricing_version',cfg#>>'{meta,version}','before_gst',true,'households',households);
end $$;
revoke all on function public.chefos_pricing_catalog() from public;
grant execute on function public.chefos_pricing_catalog() to anon,authenticated,service_role;
