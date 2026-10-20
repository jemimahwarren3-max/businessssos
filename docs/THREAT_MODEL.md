# Threat model

System: multi-tenant merchant OS plus public shops and a directory. Trust boundaries: browser, Cloud Run (or temporary Render) Node process, Supabase (Auth + Postgres), Paynow, Groq, optional Upstash, optional Sentry.

## Assets

Merchant financial records, inventory, customer PII, session tokens, Paynow integration key, service-role key, platform admin MFA, unpublished shop drafts.

## Actors

Shopper (unauthenticated), merchant owner, staff roles, platform admin, Paynow servers, attackers with the anon key, attackers on a shared POS tablet.

## Main threats and current control

| Threat                               | Control                                                                      | Residual                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| Merchant A reads Merchant B          | RLS + membership helpers + server fn session client                          | Direct PostgREST tests not run this session               |
| Anon key calls billing confirm       | Grants revoked; integration test                                             | Must keep grants on every new SECURITY DEFINER function   |
| Fake Paynow webhook                  | SHA512 parse then re-poll `poll_url`                                         | Platform billing only                                     |
| Shopper pays 0 / wrong price         | `create_store_order` prices from DB                                          | POS `create_sale` still accepts staff unitPrice           |
| Draft shop leaked                    | Unpublished returns null; preview needs membership                           | Preview cookie does not follow subdomains                 |
| Storefront XSS                       | Strip tags; no merchant HTML                                                 | CSP still unsafe-inline                                   |
| Offline oversell                     | Server stock check on sync; failed sale stays queued                         | Local stock is an estimate                                |
| SW serves dashboard on a shop host   | SW only registered after sign-in                                             | Existing browsers may keep an old worker until it updates |
| Stolen session cookie                | httpOnly, Secure on HTTPS, SameSite Lax                                      | 30-day idle lifetime                                      |
| AI prompt injection                  | Assistant is read/recommend; privileged writes still require app permissions | Not a full LLM isolation design                           |
| Subdomain takeover of `www` / `mail` | Reserved slugs in SQL                                                        | DNS wildcard still an ops task                            |

## Out of scope until built

Customer card data, marketplace settlement, file uploads, native mobile apps.
