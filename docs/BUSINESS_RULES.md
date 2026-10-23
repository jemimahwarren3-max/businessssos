# Kwetuu business rules

These rules summarize existing behavior and the payment-safety intent of the
current branch. Where a rule still requires staging verification, that is
called out rather than assumed.

## Catalogue, orders and stock

- Products and stock are business-owned; online and physical sales must use
  the same product/inventory source.
- Checkout prices and totals are calculated by trusted database logic, not
  accepted from client totals.
- An order stores an item/price snapshot so later product edits do not rewrite
  order history.
- Duplicate checkout submissions use an idempotency key.
- Stock reservations/sales must be atomic and must not oversell concurrent
  buyers. Actual staging behavior must be covered by integration tests.
- Hiding an online listing must not delete its product or stock.

## Payment separation

- Customer payments to sellers are distinct from Kwetuu subscription payments.
  Kwetuu's platform Paynow credentials must never receive seller proceeds.
- Manual methods display seller-provided instructions. An uploaded proof or
  screenshot is evidence only; it never establishes that funds arrived.
- A seller may record a manual payment only after checking their own wallet or
  account, or receiving cash. That action is seller-confirmed, not
  provider-verified.
- Paynow orders must not be marked paid through the manual seller transition.
- Seller Paynow requires both seller credentials and a global provider
  enablement/approval control; the control defaults off.
- Before an automated payment is settled, verify the provider-signed response,
  expected merchant reference, amount, currency, business and order state.
- Network failures, mismatches, or database confirmation errors must not be
  presented as successful payment. Uncertain cases stay pending or enter
  manual review.
- Refund success must not be claimed without a verified provider outcome.
- USD is the only seller Paynow order currency in this implementation.

## Access and publication

- A user may mutate business data only with the required business membership
  and permission; database policies/RPCs must enforce the boundary as well.
- Customer-facing access to an order is limited to the authorized shopper
  account or the existing order access token flow.
- Store preview must not expose private customer data, payment secrets or
  unpublished data to an unauthenticated visitor.
- Store publication and subscription entitlement must be enforced on trusted
  server/database boundaries, not only in the interface.

See [payment readiness](./KWETUU_PAYMENTS_AUDIT_AND_READINESS.md) and
[known limitations](./KNOWN_LIMITATIONS.md) for qualifications.
