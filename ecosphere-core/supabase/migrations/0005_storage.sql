-- =============================================================================
-- 0005_storage.sql — Part image library
-- A public storage bucket that holds product/part photos. Uploaded once per part
-- in the Catalogue; the customer proposal reads each part's photo automatically.
-- Idempotent: safe to run more than once.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('part-images', 'part-images', true)
on conflict (id) do update set public = true;

-- Policies on storage.objects scoped to this bucket.
-- Public read (so photos load on proposals); authenticated users manage uploads.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='part_images_read') then
    create policy "part_images_read" on storage.objects
      for select using (bucket_id = 'part-images');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='part_images_insert') then
    create policy "part_images_insert" on storage.objects
      for insert to authenticated with check (bucket_id = 'part-images');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='part_images_update') then
    create policy "part_images_update" on storage.objects
      for update to authenticated using (bucket_id = 'part-images') with check (bucket_id = 'part-images');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='part_images_delete') then
    create policy "part_images_delete" on storage.objects
      for delete to authenticated using (bucket_id = 'part-images');
  end if;
end $$;
