-- Hosted only. Configure Vault chefos_project_url and chefos_job_secret first.
-- Direct HTTPS avoids storing Authorization headers in pg_net queue tables,
-- whose Supabase-managed PUBLIC grants cannot be revoked by the postgres role.
create extension if not exists pg_cron;
create extension if not exists http with schema extensions;
create table if not exists chefos_private.worker_runs (
 id bigint generated always as identity primary key, ran_at timestamptz not null default now(),
 status integer not null, awaiting_configuration boolean, purged integer
);
alter table chefos_private.worker_runs enable row level security;
revoke all on chefos_private.worker_runs from public,anon,authenticated,service_role;
create or replace function chefos_private.dispatch_worker() returns integer
language plpgsql security definer set search_path='' as $$
declare endpoint text; token text; response extensions.http_response; body jsonb;
begin
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='chefos_project_url';
 select decrypted_secret into token from vault.decrypted_secrets where name='chefos_job_secret';
 if endpoint is distinct from 'https://gvkzgipicojtlzwdnthk.supabase.co' or length(coalesce(token,''))<32 then raise exception 'Worker configuration is incomplete'; end if;
 perform extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','10000');
 perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','120000');
 select * into response from extensions.http(row('POST',endpoint||'/functions/v1/chefos-menu-worker',
  array[extensions.http_header('Authorization','Bearer '||token)],'application/json','{}')::extensions.http_request);
 if response.status=200 then body:=response.content::jsonb; end if;
 insert into chefos_private.worker_runs(status,awaiting_configuration,purged)
  values(response.status,(body->>'awaiting_configuration')::boolean,(body->>'purged')::integer);
 delete from chefos_private.worker_runs where ran_at<now()-interval '30 days';
 return response.status;
exception when others then
 insert into chefos_private.worker_runs(status) values(0);
 return 0;
end $$;
revoke all on function chefos_private.dispatch_worker() from public,anon,authenticated,service_role;
do $$begin
 if not exists(select 1 from vault.secrets where name='chefos_project_url')
  or not exists(select 1 from vault.secrets where name='chefos_job_secret') then
  raise exception 'Configure chefos_project_url and chefos_job_secret in Vault first';
 end if;
end $$;
select cron.schedule('chefos-personalised-menu-worker','* * * * *','select chefos_private.dispatch_worker();');
