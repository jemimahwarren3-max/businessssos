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
    or not (
      _image_url ~ '^https://images\.pexels\.com/photos/[0-9]+/'
      or (
        _image_url ~ '^https://'
        and position('/storage/v1/object/public/product-media/' in _image_url) > 0
        and position((_business_id::text) in _image_url) > 0
      )
    )
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