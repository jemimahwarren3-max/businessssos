# BusinessOS implementation plan

## Goal of this increment

Make merchant shop-alert email and shopper order email actually leave the outbox when Resend is configured, and keep them pending (not discarded) until then.

## Why not the rest of the 200

Variants, shopper Paynow, GRN, and marketing campaigns are not required for transactional mail. Auth confirm/reset stay on Supabase SMTP.

## What this slice delivers

| Behaviour | Where |
| --- | --- |
| Shopper receipt queued at place-order (access code once) | `enqueue_shopper_order_email` in `20261019220000_shopper_order_emails.sql` |
| Status emails on later `store_order_events` (no access code) | trigger `store_order_events_shopper_email` |
| Do not mark pending rows skipped when Resend is unset | `notifications.mail.server.ts` |
| Cron/manual flush | `POST /api/internal/flush-mail`, `.github/workflows/flush-mail.yml` |
| Cloud Run can mount Resend + flush secret | `deploy-cloud-run.yml` |

## What it does not deliver

- A live Resend domain or keys (operator).
- Marketing blasts from shopper consent.
- Production SQL on `maidxfntfpnkcqnuhozo`.
- WhatsApp Cloud.

## Acceptance criteria

1. Checkout with `customer_email` inserts a pending outbox row whose body contains the access token.
2. A non-`created` order event inserts a second row without that token.
3. Flush without Resend returns `configured: false` and leaves rows pending.
4. Flush endpoint rejects missing/short `MAIL_FLUSH_SECRET`.

## Tests

- `npx vitest run tests/notifications-mail.test.ts`
- `npx tsc --noEmit`
- Integration: `tests/integration/shopper-emails.test.ts` (staging token)

## Rollback

Leave Resend unset. Queued mail stays pending. Revert the migration only if you must drop shopper outbox rows.
