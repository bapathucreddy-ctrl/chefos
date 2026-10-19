-- Only the verified Edge payment boundary may call these functions. Neither an
-- Auth user nor an administrator can claim an order was paid through REST.
create function public.chefos_server_prepare_order(p_actor uuid,p_booking jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare c public.chefos_chefs%rowtype; meals text[]; selected_meal text; waves jsonb:='{}'; wave text;
 people integer; cycle text; start_on date; quote jsonb; booking jsonb;
begin
 if not exists(select 1 from public.chefos_profiles where id=p_actor and role='customer' and is_active) then raise exception 'Active customer required' using errcode='42501'; end if;
 select * into c from public.chefos_chefs where id=(p_booking->>'chef')::uuid and is_verified and is_active and is_available;
 if not found then raise exception 'Chef is not available'; end if;
 if coalesce(p_booking->>'coupon_code','')<>'' then raise exception 'Promotions require a configured expiry and eligibility review'; end if;
 select array_agg(distinct value order by value) into meals from jsonb_array_elements_text(p_booking->'meal_type');
 if cardinality(meals) not between 1 and 3 or meals is null or not meals <@ array['breakfast','lunch','dinner']::text[] then raise exception 'Select one to three meals'; end if;
 people:=coalesce((p_booking->>'people_count')::integer,3); cycle:=coalesce(p_booking->>'plan_cycle','monthly');
 if cycle not in ('weekly','monthly','quarterly') then raise exception 'Invalid subscription cycle'; end if;
 quote:=chefos_private.quote_rate(c.id,people,cycle,cardinality(meals));
 start_on:=coalesce((p_booking->>'start_date')::date,(now() at time zone 'Asia/Kolkata')::date);
 if start_on<(now() at time zone 'Asia/Kolkata')::date or start_on>(now() at time zone 'Asia/Kolkata')::date+90 then raise exception 'Choose a start date in the next 90 days'; end if;
 foreach selected_meal in array meals loop
  wave:=coalesce(p_booking#>>array['meal_wave',selected_meal],case selected_meal when 'breakfast' then 'B2' when 'lunch' then 'L2' else 'D2' end);
  if not coalesce(c.available_waves->selected_meal ? wave,false) then raise exception 'Chef does not offer this selected_meal slot'; end if;
  if exists(select 1 from public.chefos_subscriptions s where s.chef_id=c.id and s.is_active and s.end_date>=start_on
    and s.start_date<start_on+(quote->>'days')::integer and selected_meal=any(s.meal_type)
    and coalesce(s.meal_wave->>selected_meal,case selected_meal when 'breakfast' then 'B2' when 'lunch' then 'L2' else 'D2' end)=wave) then raise exception 'This selected_meal slot is already reserved'; end if;
  waves:=waves||jsonb_build_object(selected_meal,wave);
 end loop;
 if exists(select 1 from public.chefos_subscriptions where user_id=p_actor and is_active and end_date>=current_date) then raise exception 'Your paid plan is already active; renewal is available after it ends'; end if;
 booking:=jsonb_build_object('chef',c.id,'meal_type',to_jsonb(meals),'meal_wave',waves,'people_count',people,'plan_cycle',cycle,'start_date',start_on);
 return jsonb_build_object('booking',booking,'quote',quote);
end $$;

create function public.chefos_server_record_order(p_actor uuid,p_order text,p_prepared jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare entry chefos_private.payments%rowtype;
begin
 if p_order !~ '^order_[a-zA-Z0-9]+$' then raise exception 'Invalid provider order'; end if;
 insert into chefos_private.payments(user_id,order_id,amount,quote,booking)
 values(p_actor,p_order,(p_prepared#>>'{quote,amount_paise}')::integer,p_prepared->'quote',p_prepared->'booking') returning * into entry;
 return jsonb_build_object('order_id',entry.order_id,'amount',entry.amount,'currency',entry.currency,'pricing',chefos_private.customer_quote(entry.quote));
end $$;

create function public.chefos_server_payment(p_actor uuid,p_order text) returns jsonb
language plpgsql stable security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare entry chefos_private.payments%rowtype;
begin
 select * into entry from chefos_private.payments where order_id=p_order and user_id=p_actor;
 if not found then raise exception 'Order not found' using errcode='42501'; end if;
 return jsonb_build_object('order_id',entry.order_id,'amount',entry.amount,'currency',entry.currency,'status',entry.status);
end $$;

create function public.chefos_server_capture(p_order text,p_payment text,p_amount integer,p_currency text) returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare entry chefos_private.payments%rowtype;
begin
 select * into entry from chefos_private.payments where order_id=p_order for update;
 if not found then raise exception 'Order not found'; end if;
 if entry.amount<>p_amount or entry.currency<>p_currency or p_payment !~ '^pay_[a-zA-Z0-9]+$' then raise exception 'Payment does not match the saved order'; end if;
 if entry.status='paid' and entry.payment_id=p_payment then return '{"verified":true}'; end if;
 if entry.status<>'created' then raise exception 'Order cannot be captured in its current state'; end if;
 update chefos_private.payments set status='paid',payment_id=p_payment where id=entry.id;
 return '{"verified":true}';
end $$;

create function public.chefos_activate_order(p_order text) returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid:=chefos_private.require_actor(); entry chefos_private.payments%rowtype; sub public.chefos_subscriptions%rowtype;
 c public.chefos_chefs%rowtype; selected_meal text; meals text[]; start_on date; end_on date;
begin
 -- Serialize purchases from this customer and capacity claims for this chef.
 perform 1 from public.chefos_profiles where id=actor for update;
 select * into entry from chefos_private.payments where order_id=p_order and user_id=actor for update;
 if not found or entry.status<>'paid' then raise exception 'A captured payment for this account is required' using errcode='42501'; end if;
 if entry.subscription_id is not null then select * into sub from public.chefos_subscriptions where id=entry.subscription_id; return to_jsonb(sub); end if;
 select * into c from public.chefos_chefs where id=(entry.booking->>'chef')::uuid for update;
 if not c.is_verified or not c.is_active then raise exception 'Chef is unavailable; contact support for reassignment or refund'; end if;
 select array_agg(value) into meals from jsonb_array_elements_text(entry.booking->'meal_type');
 start_on:=(entry.booking->>'start_date')::date; end_on:=start_on+(entry.quote->>'days')::integer-1;
 if start_on<(now() at time zone 'Asia/Kolkata')::date then raise exception 'Booking date has passed; contact support for adjustment or refund'; end if;
 update public.chefos_subscriptions set is_active=false where user_id=actor and is_active and end_date<current_date;
 if exists(select 1 from public.chefos_subscriptions where user_id=actor and is_active) then raise exception 'An active paid subscription already exists'; end if;
 foreach selected_meal in array meals loop
  if exists(select 1 from public.chefos_subscriptions s where s.chef_id=c.id and s.is_active and s.start_date<=end_on and s.end_date>=start_on
    and selected_meal=any(s.meal_type) and coalesce(s.meal_wave->>selected_meal,case selected_meal when 'breakfast' then 'B2' when 'lunch' then 'L2' else 'D2' end)=entry.booking#>>array['meal_wave',selected_meal])
   or exists(select 1 from chefos_private.service_sessions s where s.chef_id=c.id and s.service_date between start_on and end_on and s.wave=entry.booking#>>array['meal_wave',selected_meal] and s.status<>'completed') then
    raise exception 'This slot was booked while payment was processing; contact support for reassignment or refund';
  end if;
 end loop;
 insert into public.chefos_subscriptions(user_id,chef_id,meal_type,meal_wave,people_count,plan_cycle,start_date,end_date,price,pricing)
 values(actor,c.id,meals,entry.booking->'meal_wave',(entry.booking->>'people_count')::integer,entry.booking->>'plan_cycle',start_on,end_on,(entry.quote->>'price_inr')::integer,chefos_private.customer_quote(entry.quote)) returning * into sub;
 insert into chefos_private.subscription_terms(subscription_id,quote) values(sub.id,entry.quote);
 update chefos_private.payments set subscription_id=sub.id where id=entry.id;
 insert into public.chefos_assignments(user_id,chef_id) values(actor,c.id) on conflict(user_id) do update set chef_id=excluded.chef_id,assigned_at=now();
 return to_jsonb(sub);
end $$;

create function public.chefos_save_menu(p_dishes jsonb,p_generation jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' set timezone='Asia/Kolkata' as $$
declare actor uuid:=chefos_private.require_actor(); selected_meal text; saved public.chefos_weekly_menus%rowtype;
begin
 if not exists(select 1 from public.chefos_profiles where id=actor and role='customer') then raise exception 'Customer account required' using errcode='42501'; end if;
 foreach selected_meal in array array['breakfast','lunch','dinner'] loop
  if coalesce(jsonb_typeof(p_dishes->selected_meal),'null')<>'array' then raise exception 'Each meal needs seven dishes'; end if;
  if jsonb_array_length(p_dishes->selected_meal)<>7 then raise exception 'Each meal needs seven dishes'; end if;
  if exists(select 1 from jsonb_array_elements(p_dishes->selected_meal) d where jsonb_typeof(d)<>'string' or length(d#>>'{}') not between 1 and 200) then raise exception 'Invalid dish'; end if;
 end loop;
 if exists(select 1 from public.chefos_weekly_menus where user_id=actor and created_at>now()-interval '10 seconds') then raise exception 'Please wait before generating another menu'; end if;
 insert into public.chefos_weekly_menus(user_id,dishes,generation) values(actor,p_dishes-array['user_id','id','generation'],jsonb_build_object('source',coalesce(p_generation->>'source','customer'),'generated_at',now())) returning * into saved;
 return saved.dishes||jsonb_build_object('id',saved.id,'generation',saved.generation);
end $$;

revoke all on function public.chefos_server_prepare_order(uuid,jsonb),public.chefos_server_record_order(uuid,text,jsonb),public.chefos_server_payment(uuid,text),public.chefos_server_capture(text,text,integer,text),public.chefos_activate_order(text),public.chefos_save_menu(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.chefos_server_prepare_order(uuid,jsonb),public.chefos_server_record_order(uuid,text,jsonb),public.chefos_server_payment(uuid,text),public.chefos_server_capture(text,text,integer,text) to service_role;
grant execute on function public.chefos_activate_order(text),public.chefos_save_menu(jsonb,jsonb) to authenticated;
