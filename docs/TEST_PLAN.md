# Kwetuu test plan

## Existing verification layers

The repository uses Vitest unit tests and staging-only database integration
tests. TypeScript typecheck, ESLint, Prettier and Vite production build are
available. There is no configured Playwright/Cypress end-to-end suite.

Integration tests require staging access and must never target production.
Browser/device, accessibility, real notification delivery, restore and
provider-sandbox checks require separate operational validation.

## Payment-safety slice acceptance

| Scenario                                                                                | Evidence required                        |
| --------------------------------------------------------------------------------------- | ---------------------------------------- |
| Dedicated key encrypt/decrypt and tamper rejection                                      | Unit test                                |
| Previous and legacy encryption keys are readable for rotation                           | Unit test                                |
| Poll URL rejects non-HTTPS, untrusted host, credentials, redirects/path tricks          | Unit test                                |
| Provider amount is parsed exactly in minor units                                        | Unit test                                |
| Manual seller transition cannot settle a Paynow order                                   | Staging SQL integration test             |
| Manual confirmation records actor/reference/amount/currency/time                        | Staging SQL integration test             |
| Paynow initiation requires global approval gate                                         | Staging SQL integration test             |
| Provider control and confirmation ledger cannot be read by authenticated clients        | Staging SQL integration test             |
| Callback signature, provider poll signature, reference, amount and currency are checked | Staging integration/provider sandbox     |
| Confirmation database failure never returns paid                                        | Focused server test or integration test  |
| Duplicate and late callbacks are idempotent and safe                                    | Staging integration test                 |
| Existing manual checkout/proof/order flow remains intact                                | Storefront unit and staging journey test |

No live provider charges should be used. Use isolated staging records and
approved sandbox credentials only.

## Broader commerce journeys

Prioritize after the payment slice:

1. Seller creates a business and resumes onboarding.
2. Seller creates/imports product; changes online visibility without deleting
   stock.
3. Seller previews, publishes and unpublishes a storefront.
4. Two buyers compete for the final unit; only valid atomic orders succeed.
5. Customer places an order, submits manual proof, then seller confirms only
   after checking receipt of funds.
6. Failed/delayed payment remains pending or is safely reviewed.
7. Seller confirms, prepares, dispatches/completes and customer sees updates.
8. Unauthorized staff and cross-business access attempts are denied.
9. Subscription expiration/renewal and administrator moderation are verified.

Track executed checks and actual outcomes in
[execution status](./EXECUTION_STATUS.md); do not infer verification from
implementation.
