# Data inventory and privacy

Technical inventory. Not a finding that Zimbabwean or other law is satisfied. See also `docs/PRIVACY_ARCHITECTURE.md` and `legal/PRIVACY_POLICY.md` (draft).

| Category | Location | Purpose | Access | Retention | Processors | Deletion |
|---|---|---|---|---|---|---|
| Account email, password hash | Supabase Auth | Sign-in | User, Supabase | Until account delete | Supabase | Account deletion RPC |
| Name | Auth metadata | Display | User | Until delete | Supabase | Account deletion |
| Business profile | `businesses` | Operate the product | Members per RLS | Until business delete | Supabase | Cascade |
| Staff memberships | `business_members` | Roles | Members | Until remove/delete | Supabase | Cascade / user delete |
| Customer records | `customers` | Merchant CRM | Permissioned members | Until merchant deletes or business delete | Supabase | In-app or cascade |
| Sales, invoices, quotes, expenses | matching tables | Books | Permissioned members | Until business delete | Supabase | Cascade; not silent rewrite of history |
| Inventory movements | `inventory_movements` | Stock audit | Permissioned members | Until business delete | Supabase | Cascade |
| Online orders | `store_orders*` | Shop fulfilment | Members; shopper via access token RPC | Until business delete | Supabase | Cascade |
| Shop profile | `storefronts`, listings | Public catalogue | Public projection only | Until unpublish/delete | Supabase | Cascade |
| Marketplace browse | RPC output | Discovery | Public, rate limited | Not stored as a second catalogue | Supabase | n/a |
| Subscription payments | `subscription_payments` | Platform billing | Owner/admin; Paynow webhook via service role | Until business delete | Paynow, Supabase | Cascade |
| Legal acceptances | `legal_acceptances` | Proof of clickwrap | Service role write | Until user delete | Supabase | Cascade from auth.users |
| Audit logs | `audit_logs` | Accountability | Members with audit permission | Survives user delete with user_id nulled | Supabase | Business cascade |
| Session | httpOnly cookie | Auth | Browser, server unseal | 30 days idle | none | Logout |
| Offline pending sales | IndexedDB `businessos-offline` | POS without network | That browser profile | Until sync or clear | none | Logout does not currently wipe IndexedDB |
| AI request summary | Ephemeral to Groq | Assistant | Members with assistant access | Groq policy unverified | Groq | Not stored by us |
| Workspace cache | Optional Upstash | Perf | keyed by user | Short TTL | Upstash | TTL / invalidate |
| Rate-limit hits | `rate_limit_hits` | Abuse | SECURITY DEFINER only | Windowed | Supabase | Sweep job |
| Logs / Sentry | Hosting + optional Sentry | Reliability | Operators | Provider default | Render/Cloud Run, Sentry | Configure per provider |

Minimisation: public shop JSON omits cost, staff hash, unpublished products. Marketplace omits phone and email.

Gaps: IndexedDB pending sales are not cleared on logout (shared tablet risk). No marketing consent product. Retention for accounting vs deletion is a legal question, not implemented as timed purge. Backup copies live 14 days in GitHub Actions artifacts if the backup workflow secrets are set.
