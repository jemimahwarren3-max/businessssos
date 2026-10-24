# Access control matrix (summary)

**Legend:** ✓ allowed (with conditions) · ✗ denied · RPC = security definer function · SR = service_role only

| Resource / action | Anonymous | Shopper | Cashier | Manager | Owner | Platform admin |
|-------------------|-----------|---------|---------|---------|-------|----------------|
| Public shop catalog | ✓ RPC | ✓ | — | — | — | — |
| Place store order | ✓ RPC + rate limit | ✓ | — | — | — | — |
| View own order (token) | ✓ RPC | ✓ | — | — | — | — |
| Merchant products CRUD | ✗ | ✗ | permission | permission | ✓ | ✗ |
| Mark order paid (manual) | ✗ | ✗ | payment perm | payment perm | ✓ | ✗ |
| POS sale | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| Subscription checkout | ✗ | ✗ | ✗ | ✗ | ✓ | owner bypass entitlement |
| `paynow_confirm_payment` | ✗ | ✗ | ✗ | ✗ | ✗ | SR |
| `confirm_shop_paynow_payment` | ✗ | ✗ | ✗ | ✗ | ✗ | SR (app invokes) |
| Admin subscription list | ✗ | ✗ | ✗ | ✗ | ✗ | MFA admin + SR RPC |
| `platform_roles` insert | ✗ | ✗ | ✗ | ✗ | ✗ | SR |
| Payment proof bucket read | ✗ | ✗ | ✗ | member via signed URL | ✓ | ✗ |

Permissions are enforced in **server functions** (`assertPermission`) and **Postgres** (RLS/RPC). UI hiding is not a control.

Detailed permission keys: `business_role_permissions` migration and `src/lib/business.server.ts`.
