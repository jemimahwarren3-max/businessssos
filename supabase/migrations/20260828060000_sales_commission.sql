-- Sales-commission tracking. sales.created_by already records who rang up
-- each sale (create_sale's own auth.uid() insert) — this adds a per-member
-- commission rate and a report that joins the two, rather than needing any
-- new attribution mechanism.

alter table public.business_members
  add column if not exists commission_rate numeric(5,2) not null default 0
    check (commission_rate >= 0 and commission_rate <= 100);

create or replace function public.set_member_commission_rate(
  _business_id uuid,
  _member_user_id uuid,
  _rate numeric
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to set commission rates.' using errcode = 'B0002';
  end if;
  if _rate is null or _rate < 0 or _rate > 100 then
    raise exception 'Commission rate must be between 0 and 100.' using errcode = 'B0001';
  end if;

  update public.business_members set commission_rate = _rate
    where business_id = _business_id and user_id = _member_user_id and is_active;
  if not found then
    raise exception 'That team member could not be found.' using errcode = 'B0001';
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, summary, new_values)
  values (_business_id, auth.uid(), 'team.commission_rate_set', 'business_member', _member_user_id,
    'Set commission rate to ' || _rate || '%', jsonb_build_object('commission_rate', _rate));
end;
$$;
revoke all on function public.set_member_commission_rate(uuid,uuid,numeric) from public, anon;
grant execute on function public.set_member_commission_rate(uuid,uuid,numeric) to authenticated;

-- Owner/admin only — same gate as list_team_members, this is payroll-
-- adjacent data. LEFT JOIN so every active member shows up even with zero
-- sales in the period, not just ones who sold something.
create or replace function public.get_commission_report(
  _business_id uuid,
  _start_date date,
  _end_date date
) returns table(
  user_id uuid,
  display_name text,
  commission_rate numeric,
  sales_count bigint,
  sales_total numeric,
  commission_earned numeric
)
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_business_role(_business_id, array['owner','admin']::public.app_role[]) then
    raise exception 'You do not have permission to view commission data.' using errcode = 'B0002';
  end if;

  return query
    select
      m.user_id,
      coalesce(nullif(m.staff_name, ''), nullif(u.raw_user_meta_data->>'full_name', ''), u.email::text),
      m.commission_rate,
      count(s.id),
      coalesce(sum(s.total), 0),
      round(coalesce(sum(s.total), 0) * m.commission_rate / 100, 2)
    from public.business_members m
    join auth.users u on u.id = m.user_id
    left join public.sales s on s.created_by = m.user_id and s.business_id = _business_id
      and s.status in ('completed', 'partially_refunded')
      and s.created_at::date between _start_date and _end_date
    where m.business_id = _business_id and m.is_active
    group by m.user_id, m.staff_name, u.raw_user_meta_data, u.email, m.commission_rate
    order by round(coalesce(sum(s.total), 0) * m.commission_rate / 100, 2) desc;
end;
$$;
revoke all on function public.get_commission_report(uuid,date,date) from public, anon;
grant execute on function public.get_commission_report(uuid,date,date) to authenticated;

alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs
  add constraint audit_logs_action_check check (
    action in (
      'business.created', 'product.created', 'products.imported',
      'inventory.adjusted', 'customer.created', 'quote.status_changed',
      'expense.created', 'expense.deleted', 'expenses.imported', 'sales.imported',
      'sale.created', 'invoice.created', 'invoice.status_changed',
      'payment.recorded', 'quote.created', 'quote.converted', 'data.exported',
      'supplier.created', 'supplier.updated', 'supplier.deleted',
      'purchase_order.created', 'sales.imported_detailed', 'customers.imported',
      'team.invited', 'team.invite_revoked', 'team.role_changed', 'team.member_removed',
      'team.staff_created', 'team.staff_password_reset', 'team.shop_password_set',
      'team.permission_changed', 'purchase_order.status_changed', 'sale.refunded',
      'recurring_invoice.created', 'team.commission_rate_set'
    )
  );
