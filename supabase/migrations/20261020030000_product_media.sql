-- Product photos in Supabase Storage. Public reads for shop images.
-- Writes only for owner/admin/manager of the business named in the path.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-media',
  'product-media',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product media public read" on storage.objects;
create policy "product media public read"
  on storage.objects for select
  using (bucket_id = 'product-media');

drop policy if exists "product media member insert" on storage.objects;
create policy "product media member insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-media'
    and public.has_business_role(
      (split_part(name, '/', 1))::uuid,
      array['owner', 'admin', 'manager']::public.app_role[]
    )
  );

drop policy if exists "product media member update" on storage.objects;
create policy "product media member update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'product-media'
    and public.has_business_role(
      (split_part(name, '/', 1))::uuid,
      array['owner', 'admin', 'manager']::public.app_role[]
    )
  )
  with check (
    bucket_id = 'product-media'
    and public.has_business_role(
      (split_part(name, '/', 1))::uuid,
      array['owner', 'admin', 'manager']::public.app_role[]
    )
  );

drop policy if exists "product media member delete" on storage.objects;
create policy "product media member delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-media'
    and public.has_business_role(
      (split_part(name, '/', 1))::uuid,
      array['owner', 'admin', 'manager']::public.app_role[]
    )
  );

create or replace function public.set_product_image(
  _business_id uuid,
  _product_id uuid,
  _image_url text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin','manager']::public.app_role[]) then
    raise exception 'Your role does not allow this action.' using errcode = 'B0002';
  end if;
  if _image_url is not null and (
    length(_image_url) > 500
    or _image_url !~ '^https://'
    or position('/storage/v1/object/public/product-media/' in _image_url) = 0
    or position((_business_id::text) in _image_url) = 0
  ) then
    raise exception 'That photo URL is not allowed.' using errcode = 'B0001';
  end if;
  update public.products
    set image_url = nullif(_image_url, ''), updated_at = now()
    where id = _product_id and business_id = _business_id and deleted_at is null;
  if not found then
    raise exception 'That product could not be found.' using errcode = 'B0001';
  end if;
end;
$$;
revoke all on function public.set_product_image(uuid, uuid, text) from public, anon;
grant execute on function public.set_product_image(uuid, uuid, text) to authenticated;
