# Kwetuu customer-to-seller payments: audit and readiness

Audit baseline: `master` commit `7dd36ba` (23 October 2026).

## Repository audit

### What already works

- The application is TanStack Start with React 19, Vite 8, Supabase Postgres/Auth, and Cloud Run deployment.
- Storefront checkout calls the `create_store_order` Postgres RPC. It reads current catalogue data and calculates the amount on the server, creates `store_orders` and immutable `store_order_items`, and reserves stock in the same database transaction.
- Sellers can publish pickup/delivery cash options and manual payment instructions. The selected seller instructions are copied into the order snapshot.
- A buyer can submit a payment reference and a private proof file. The proof RPC sets the order to `pending`, records events/audit metadata, and notifies the seller. It does not mark the order paid.
- The private `payment-proofs` bucket disallows client reads/writes. The server issues a short-lived URL for an authorized order view.
- An authenticated business member with the payment permission can record payment through the seller dashboard. The sale/stock workflow is handled by the existing `storefront_record_sale` function. Existing SQL locking and idempotency protect order creation and sale recording.
- Shop-owned Paynow credentials are not returned to the browser. They are encrypted server-side; shop payment rows are service-role writable, with member-scoped reads.
- Paynow callbacks do not directly mark orders paid: the server verifies the shop-specific callback hash, then polls Paynow and verifies the response hash before calling the service-role-only confirmation RPC.
- The application has email notifications/outbox support. No SMS or payment-provider realtime confirmation path is present.
- The Cloud Run deployment workflow currently passes the `STAGING_SUPABASE_*` configuration to the app. A successful Cloud Run deployment therefore does not, by itself, prove the storefront is connected to the production Supabase project.

### Incomplete or unsafe behavior found

- Manual confirmation has a generic audit log, but no dedicated immutable record of the confirming user, amount, currency, timestamp, or transaction reference.
- The generic seller `mark_paid` transition accepts a Paynow order. That creates a path around gateway verification.
- Shop Paynow confirmation records the order as paid without comparing the stored attempt amount/currency against the order, and its RPC does not itself validate the reported provider status.
- Paynow polling fetches a stored poll URL without validating the HTTPS origin and without disabling redirects. The merchant reference in the verified response is not checked against the requested attempt. Confirmation RPC errors can also be logged while the caller returns `paid`.
- Shop Paynow is available based on seller settings and the presence of credentials alone. There is no global approval/enablement gate.
- Shop Paynow credential encryption currently derives from `SESSION_SECRET`, coupling payment-secret recovery to session rotation. It has no key version or rotation path.
- The order/payment state model is currently `unpaid`, `pending`, `paid`, `failed`, `cancelled`, `expired`, `refunded`. There is no independent payment-attempt/reconciliation/refund ledger for shop payments.
- The repository's staging SQL script applies a selected migration list; a new migration must be explicitly added to that list. Production migrations are not to be run by this task.

### Existing data model and security boundaries

Reusable records/functions include `storefronts`, `store_orders`, `store_order_items`, `store_order_events`, `store_paynow_credentials`, `shop_order_payments`, `create_store_order`, `submit_store_order_proof`, `transition_store_order`, `storefront_record_sale`, and `confirm_shop_paynow_payment`.

Orders are scoped by `business_id`. Checkout, public order access, and seller order reads use security-definer RPCs rather than exposing provider credentials. The payment-proof bucket is private. The existing Paynow credential and attempt tables deny browser writes and grant service-role access. Seller writes are guarded by server permission checks and database payment permissions.

No existing order, stock, or authentication table needs replacement. Any new schema in this work is additive and staged only.

## Provider and eligibility findings

| Provider/path              | Verified from available official material                                                                                                                                                                                                                                       | Eligibility and release status                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual seller instructions | Existing code displays seller-supplied instructions; proof is only evidence and seller confirmation is explicit.                                                                                                                                                                | No automatic provider verification. Seller must use an account/arrangement permitted by that provider. Kwetuu must not receive or pool funds.                                                                                                                                     |
| Paynow                     | Official setup docs describe seller account registration, a receiving bank account, integration IDs/keys, server-to-server initiation, and test/live key handling. Paynow Terms include a prohibition concerning payment processors collecting payments on behalf of merchants. | Whether an independent seller may connect credentials to a multi-tenant storefront platform is unresolved. Obtain written Paynow approval for this arrangement before enabling it. Account types, currencies, fees, settlement and permissions need confirmation for each seller. |
| EcoCash Online Payments    | Official docs describe merchant-account charges, customer PIN authorization at EcoCash, Basic-authenticated server calls, transaction lookup, notifications, refunds and reversals. The documented sample is USD.                                                               | Seller-by-seller eligibility, third-party platform use, currency support beyond documented examples, live credentials, and approval are not established. No automated adapter is enabled or implemented here. Never collect a buyer PIN.                                          |
| InnBucks                   | Official merchant landing page was reachable only with an HTTP 403 response during this audit; no official technical API specification could be verified.                                                                                                                       | No automated integration. Obtain official merchant API documentation, account eligibility, platform permission, supported currencies, and production UAT approval first.                                                                                                          |

The RBZ approval requirements page states that a payment systems product must not be piloted or launched without requisite regulatory approval and describes requirements for payment-system providers. This is not a legal classification of Kwetuu; a Zimbabwean payments lawyer and the relevant provider/regulator must confirm the applicable model. The Consumer Protection Act source was not accessible in this audit, so no legal-compliance conclusion is made.

Official sources:

- [Paynow developer setup](https://developers.paynow.co.zw/docs/paynow/integration_generation/)
- [Paynow quickstart](https://developers.paynow.co.zw/docs/paynow/quickstart/)
- [Paynow Terms](https://www.paynow.co.zw/Home/Terms)
- [EcoCash Online Payments](https://developers.ecocash.co.zw/docs/online-payments)
- [InnBucks merchant information](https://innbucks.co.zw/index.php/home/merchants)
- [RBZ approval requirements](https://www.rbz.co.zw/index.php/financial-markets/national-payment-system/approval-requirements)
- [Zimbabwe Consumer Protection Act](https://zimlii.org/akn/zw/act/2019/5/eng%402019-12-10)

## Safest implementation sequence

1. Keep existing checkout, order pricing, stock, and manual seller confirmation. Add an auditable manual-confirmation record and prevent this path from settling a Paynow order.
2. Default all seller-owned automated payment processing to disabled. Require explicit operator enablement only after written provider permission and applicable legal/regulatory confirmation.
3. Harden existing Paynow server verification: validate provider URL and response reference, verify amount/currency/order/account association, preserve pending state on verification or database errors, and separate credential-encryption keys from session signing.
4. Add payment-attempt/event/reconciliation/refund structures only as concrete provider behavior is approved; do not create fake or unused provider features.
5. Add an adapter only from a verified official specification and approved account arrangement, then test with provider sandbox responses without real charges.
6. Complete seller/customer receipts, reconciliation, dispute/retention operations, and legal disclosures before any production payment activation.

## Status and production blockers

- **Implemented before this audit:** trusted server-side checkout pricing, existing manual direct-payment instructions, buyer proof submission, private proof storage, seller confirmation, sale recording, seller Paynow code, and Paynow polling/hash verification.
- **Implemented in this change:** global seller-Paynow default-off gate, stricter shop and subscription Paynow reference/amount/currency validation, preservation of pending status when payment confirmation fails, manual-confirmation audit evidence, and independent versioned credential encryption.
- **Blocked by provider access/approval:** live seller Paynow use for a multi-tenant platform, EcoCash merchant integration, and all InnBucks automation.
- **Not yet implemented:** generalized provider adapter framework, comprehensive payment-attempt/event/reconciliation/refund ledger, automatic retry/reconciliation worker, and end-to-end provider sandbox scenarios for all listed cases. Shop Paynow callback signatures are checked, but callbacks still trigger a fresh status poll and do not replace it.
- **Operator/legal dependencies:** written Paynow/platform-use permission, EcoCash seller and platform eligibility, InnBucks technical/onboarding documentation, any required RBZ approval, legal review of consumer disclosures and seller payment arrangements, provider sandbox/live credentials, and production migration approval.

No production migration or live payment enablement is authorized by this audit.

## Operator setup after this code is reviewed

- The new staging migration inserts the Paynow control row disabled. It also requires an `approval_reference` before the live-approval flag can be set.
- Do not enable the Paynow control row until the platform arrangement is confirmed in writing by Paynow and reviewed for applicable Zimbabwean legal/regulatory requirements. Seller credentials alone must never turn checkout on.
- Before sellers save or rotate Paynow credentials, store `SHOP_PAYMENT_ENCRYPTION_KEY` as a GitHub Actions repository secret; the deploy workflow injects it into the Cloud Run server environment. Generate a 32-byte base64url key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Never use a `VITE_` prefix or commit its value.
- Existing unversioned ciphertext can still be read using the legacy `SESSION_SECRET` derivation. New credentials use the independent key and versioned AES-256-GCM envelope. During key rotation, configure the new key as current and the old key as `SHOP_PAYMENT_ENCRYPTION_KEY_PREVIOUS`. Credentials are re-encrypted lazily when a trusted server operation reads them; keep the previous key until all stored credentials have been accessed and rotated. There is no bulk re-encryption job.
- CI applies selected migrations to staging only. Production DB changes require a separately reviewed, backed-up, explicitly authorized operation.
