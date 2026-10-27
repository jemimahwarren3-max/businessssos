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
| `/admin/businesses` | Search tenants, plan, shop status, **CSV export** |
| `/admin/stores` | All storefronts, templates, order counts |
| `/admin/orders` | Recent shop checkout orders (read-only) |
| `/admin/billing` | Subscription overrides, ZiG display FX, Paynow payment log |
| `/admin/personalize` | Merchant-wide banner message |
| `/admin/system` | `platform_runtime.billing_enforced` toggle |
| `/admin/businesses/{id}` | Tenant detail, **support impersonation**, **feature flags** |
| `/admin/communications` | Email outbox stats, manual flush |
| `/admin/integrations` | Seller Paynow live gate |
| `/admin/operations` | **Courier & SMS** manual runbooks (no API yet) |
| `/admin/health` | Resend, Paynow keys, env flags (no secrets) |
| `/admin/audit` | Platform + subscription override audit |

## Database migrations

Apply migrations:

- `20261027120000_admin_console_rpcs.sql`
- `20261027140000_admin_console_phase2.sql`
- `20261027160000_admin_console_phase3.sql` (impersonation, tenant flags, CSV export, ops notes)
- `20261027161000_platform_runtime_admin_columns.sql` (idempotent column repair if an earlier file was skipped)

Apply **in order** when possible. If phase 2 failed with `public_announcement does not exist`, run `20261027161000_platform_runtime_admin_columns.sql` (or re-run phase 2 after pulling the fix).

## Support impersonation

From **Business detail → Open merchant dashboard (read-only)**:

- Creates a time-boxed session (default 60 minutes, max 4 hours) audited in `platform_admin_audit`.
- Postgres extends **read** access via `is_business_member` for that tenant only; **writes are blocked** in Node (`assertCanWrite` / `assertCanOperate`) and the UI shows a red banner with **End support view**.
- The admin’s own workspace cache is cleared so `/dashboard` loads the impersonated tenant.

## Tenant feature flags

Per-business row in `business_feature_flags`:

| Flag | Effect |
| ---- | ------ |
| `billing_exempt` | Same entitlement bypass as platform owner for that tenant (Node billing gates). |
| `online_shop_enabled` | When false, publish storefront is rejected server-side. |
| `sms_notifications` | Placeholder for future SMS; documented in `/admin/operations`. |
| `courier_manual_mode` | Placeholder for manual courier workflow. |

## Security notes

- Admin RPCs are **`service_role` only**; the Node layer checks `platform_admin_access` + MFA before calling them.
- Subscription overrides write to `admin_audit_log`; runtime, banner, impersonation, flags, and CSV export write to `platform_admin_audit`.
- Impersonation is **read-only** by design — do not disable server-side write guards.
