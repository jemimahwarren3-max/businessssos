-- Adds the "data.exported" audit action for the new self-serve data export
-- feature (src/lib/data-export.server.ts) — extends the allow-list added in
-- 20260810000000_audit_fixes.sql rather than replacing it.
alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs
  add constraint audit_logs_action_check check (
    action in (
      'business.created', 'product.created', 'products.imported',
      'inventory.adjusted', 'customer.created', 'quote.status_changed',
      'expense.created', 'expense.deleted', 'expenses.imported', 'sales.imported',
      'sale.created', 'invoice.created', 'invoice.status_changed',
      'payment.recorded', 'quote.created', 'quote.converted', 'data.exported'
    )
  );
