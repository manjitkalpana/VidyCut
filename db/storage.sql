-- Run only in Supabase, after schema.sql. This bucket is always private.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('media','media',false,268435456,array['video/mp4','video/webm','video/quicktime','video/ogg','image/png','image/jpeg','image/webp','image/gif','image/avif','audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/ogg','audio/webm','audio/flac','audio/aac','application/json'])
on conflict(id) do update set public=false;
-- Browser requests never receive the service key. Node validates uploads and
-- produces expiring signed URLs after checking owner identity.
