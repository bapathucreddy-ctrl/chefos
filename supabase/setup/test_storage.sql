insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('chefos-selfies-test','chefos-selfies-test',false,5242880,array['image/jpeg']),
 ('chefos-recordings-test','chefos-recordings-test',false,15728640,array['video/mp4','video/quicktime']),
 ('chefos-test-assets','chefos-test-assets',false,5242880,array['image/png','image/jpeg'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

do $$begin
if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='chefos_test_storage_restricted') then
create policy chefos_test_storage_restricted on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id not in ('chefos-selfies-test','chefos-recordings-test','chefos-test-assets'))
 with check(bucket_id not in ('chefos-selfies-test','chefos-recordings-test','chefos-test-assets'));
end if;
end $$;
