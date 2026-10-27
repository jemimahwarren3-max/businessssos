# Growth Intelligence

Growth brings together storefront measurement, a daily AI briefing, and a seller-controlled
Marketing Studio.

## Storefront analytics

Store visitors are asked whether they want to allow optional anonymous analytics. If they decline,
the browser does not create a visitor identifier or send analytics events. A visitor who opts in is
identified by a random first-party UUID stored for that shop. Kwetuu does not use ad pixels, device
fingerprinting, customer names, raw referrer URLs, or analytics IP storage. Draft preview pages are
excluded.

The dashboard reports opted-in unique visitors, product views, cart and checkout activity, coarse
traffic sources, and products receiving views. Conversion uses distinct opted-in visitors with a
confirmed paid order. Unpaid orders are not revenue. Paid revenue is grouped by currency so changing
a business's currency cannot combine unlike amounts.

The event history and its order-linked anonymous visitor IDs are retained for up to 180 days. The
application runs the cleanup when an authorized user loads growth metrics, with cleanup rate-limited
to once per day. Reports can query up to 90 days. Visitors can reopen Analytics privacy on a shop to
change their choice; declining removes the browser's local visitor and campaign attribution data.

Traffic-source attribution is intentionally coarse. Known bot filtering, advertising spend, customer
acquisition cost, and guaranteed campaign causation are not implemented. Counts represent opted-in
browser identifiers, not verified unique people.

## Marketing Studio

An authorized seller selects a channel, describes a campaign objective, and optionally chooses a
catalogue product. AI uses those business/product facts to draft a campaign name, headline, post copy,
and call to action. Draft content remains editable and is not saved, published, or sent until the
seller chooses to save it. Kwetuu does not publish to social networks or send messages.

Each saved campaign gets a shareable link with `utm_source` and `utm_campaign` parameters. After an
analytics-consenting visitor follows the link, eligible store visits and orders can be attributed to
that campaign. Order attribution is associated server-side only after the matching anonymous visitor
has a recorded page view for that business. Campaign revenue includes only orders whose payment
status is confirmed paid, and remains grouped by currency.

## Daily business briefing

The dashboard can generate one cached briefing per business per Harare calendar day. It uses the
existing business summary plus the last seven days of storefront metrics, and is available only to
members with both `reports.financial` and `ai.use`. The latest briefing is stored server-side; the
service-role key is never sent to the browser. The model is instructed to distinguish recorded facts
from recommendations and to avoid inventing figures or campaign causation.

When configured, `GEMINI_API_KEY` is the preferred provider for campaign and briefing generation;
`GROQ_API_KEY` remains a fallback. If neither is configured, the app reports that AI generation is
unavailable; non-AI storefront analytics continue to work.

## Database rollout

The additive migration is
[`20261023150000_growth_intelligence.sql`](../supabase/migrations/20261023150000_growth_intelligence.sql).
The staging SQL runner includes it after the platform-owner migration. CI applies it only to the
configured staging project. Do not run it against production without an explicit production rollout
approval and backup plan.

The migration adds campaign and event tables with business-scoped RLS, a metrics function that checks
membership and `reports.financial`, and server-role-only event recording, order attribution, cleanup,
and briefing-cache access. Authenticated clients cannot write analytics events or read the briefing
cache directly.
