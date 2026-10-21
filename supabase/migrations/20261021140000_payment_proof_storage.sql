-- Private payment-proof files. Never public. A screenshot never marks an order paid.
-- Staging only unless a human applies this to another project.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Restrictive: clients cannot read or write this bucket. Service role bypasses RLS.
drop policy if exists payment_proofs_no_client on storage.objects;
create policy payment_proofs_no_client
  on storage.objects
  as restrictive
  for all
  to anon, authenticated
  using (bucket_id <> 'payment-proofs')
  with check (bucket_id <> 'payment-proofs');

drop function if exists public.submit_store_order_proof(text, text, text, text, text);
drop function if exists public.submit_store_order_proof(text, text, text, text, text, text);

create or replace function public.submit_store_order_proof(
  _slug text,
  _reference text,
  _token text,
  _proof_reference text,
  _proof_note text,
  _storage_path text default ''
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _store public.storefronts;
  _order public.store_orders;
  _ref text;
  _note text;
  _path text;
  _proof jsonb;
begin
  if not public.check_rate_limit('store-proof:' || coalesce(_slug, ''), 20, 60) then
    raise exception 'Too many attempts. Please wait a minute and try again.' using errcode = 'B0001';
  end if;
  select * into _store from public.storefronts where slug = lower(coalesce(_slug, ''));
  if not found then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  select * into _order from public.store_orders
    where business_id = _store.business_id and reference = _reference
    for update;
  if not found or not public.storefront_can_access_order(_order, coalesce(_token, '')) then
    raise exception 'That order could not be found.' using errcode = 'B0001';
  end if;
  if _order.fulfilment_status = 'cancelled'
     or _order.payment_status in ('paid', 'cancelled', 'refunded') then
    raise exception 'This order cannot accept a payment note now.' using errcode = 'B0001';
  end if;
  if _order.payment_method <> 'manual' then
    raise exception 'This order does not use a manual payment method.' using errcode = 'B0001';
  end if;
  _ref := coalesce(public.storefront_plain(_proof_reference, 80), '');
  _note := coalesce(public.storefront_plain(_proof_note, 400), '');
  _path := coalesce(nullif(btrim(_storage_path), ''), '');
  if length(_ref) < 3 and _path = '' then
    raise exception 'Enter a payment reference or attach a screenshot.' using errcode = 'B0001';
  end if;
  if _path <> '' and _path !~ (
    '^' || _order.business_id::text || '/' || _order.id::text || '/[A-Za-z0-9._-]+$'
  ) then
    raise exception 'That file could not be attached.' using errcode = 'B0001';
  end if;
  if _ref = '' then
    _ref := 'screenshot';
  end if;
  _proof := jsonb_build_object(
    'reference', _ref,
    'note', _note,
    'submittedAt', now(),
    'storagePath', nullif(_path, '')
  );
  update public.store_orders
    set payment_status = 'pending',
        terms = coalesce(terms, '{}'::jsonb) || jsonb_build_object('paymentProof', _proof)
    where id = _order.id;
  insert into public.store_order_events (business_id, order_id, event_type, message)
  values (
    _order.business_id, _order.id, 'proof_submitted',
    'Customer sent a payment screenshot or reference. This does not confirm that money was received.'
  );
  insert into public.notifications (business_id, type, title, message, severity, link)
  values (
    _order.business_id, 'store_order',
    'Payment proof for ' || _order.reference,
    'Open the order, look at the file if there is one, then check your own account before recording payment.',
    'info', '/storefront'
  );
  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary)
  values (
    _order.business_id, auth.uid(), 'store_order.proof_submitted', 'store_order', _order.id,
    'Payment proof on ' || _order.reference
  );
  return public.get_store_order(_slug, _reference, coalesce(_token, ''));
end;
$$;

revoke all on function public.submit_store_order_proof(text, text, text, text, text, text) from public;
grant execute on function public.submit_store_order_proof(text, text, text, text, text, text) to anon, authenticated;
