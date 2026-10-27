# Kwetuu platform admin console

The operator console lives at **`/admin`**. It is not linked from the merchant app navigation. Non-admins receive a **404**.

## Access

1. **Bootstrap (once per environment)** — In Supabase SQL, after the owner email is invited and confirmed:

   ```sql
   select public.bootstrap_platform_owner('you@example.com');
   ```

2. **Legacy fallback** — Until bootstrap runs, `PLATFORM_ADMIN_USER_ID` in Cloud Run env can match your Auth user id (compatibility only).

3. **Sign in** — Use the same Auth account as merchants (`/staff-login` or Google), then open `/admin`.

4. **MFA** — Platform admin requires TOTP (authenticator app) at **AAL2** every session.

## Sections

| Path | Purpose |
| ---- | ------- |
| `/admin` | KPIs, plan mix, runtime summary |
| `/admin/businesses` | Search tenants, plan, shop status |
| `/admin/stores` | All storefronts, templates, order counts |
| `/admin/orders` | Recent shop checkout orders (read-only) |
| `/admin/billing` | Subscription overrides, ZiG display FX, Paynow payment log |
| `/admin/personalize` | Merchant-wide banner message |
| `/admin/system` | `platform_runtime.billing_enforced` toggle |
| `/admin/businesses/{id}` | Tenant detail: team emails, orders, subscription |
| `/admin/communications` | Email outbox stats, manual flush |
| `/admin/integrations` | Seller Paynow live gate |
| `/admin/health` | Resend, Paynow keys, env flags (no secrets) |
| `/admin/audit` | Platform + subscription override audit |

## Database migration

Apply `supabase/migrations/20261027120000_admin_console_rpcs.sql` for listings, announcement columns, and runtime RPCs.

## Security notes

- Admin RPCs are **`service_role` only**; the Node layer checks `platform_admin_access` + MFA before calling them.
- Subscription overrides write to `admin_audit_log`; runtime and banner changes write to `platform_admin_audit`.
- This console does **not** expose full merchant PII exports — use per-business export inside the tenant app when authorized.
