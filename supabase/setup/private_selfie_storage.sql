insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('chefos-selfies','chefos-selfies',false,5242880,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists chefos_selfie_client_isolation on storage.objects;
create policy chefos_selfie_client_isolation on storage.objects as restrictive for all to anon,authenticated
using(bucket_id<>'chefos-selfies') with check(bucket_id<>'chefos-selfies');
