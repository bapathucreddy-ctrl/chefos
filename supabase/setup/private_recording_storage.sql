-- Hosted Supabase only. No direct client Storage policies are granted: uploads
-- use object-specific signed tokens, playback is an authenticated audited proxy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('chefos-recordings','chefos-recordings',false,15728640,array['video/mp4','video/quicktime'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists chefos_recording_client_isolation on storage.objects;
create policy chefos_recording_client_isolation on storage.objects as restrictive for all to anon,authenticated
using(bucket_id<>'chefos-recordings') with check(bucket_id<>'chefos-recordings');
