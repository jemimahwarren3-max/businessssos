# Kwetuu AI cost policy

AI is **optional**. POS, inventory, checkout, and receipts must never call a model.

## Allowed vs forbidden

| Allowed (user-initiated) | Forbidden |
|--------------------------|-----------|
| Assistant chat | Storefront product pages |
| Invoice / campaign / shop-builder drafts | Opening the dashboard |
| Weekly insights report (Insights page) | Checkout, POS, stock updates |
| Daily briefing **after** a click | Automatic per-page “insights” |

Dashboard briefing used to fetch on every visit. It now waits for **Generate today's briefing**.

## Quotas (server-enforced)

Defaults in `src/lib/ai/limits.server.ts` (override with `AI_DAILY_LIMIT_*` on Cloud Run):

| Feature | Default / business / day |
|---------|--------------------------|
| Assistant | 25 |
| Quick entry | 25 |
| Shop builder | 5 |
| Invoice draft | 5 |
| Campaign draft | 5 |
| Weekly report | 3 |
| Daily briefing | **1** |

Per-minute caps exist for assistant and quick entry. All buckets use Postgres `check_rate_limit`.

## Kill switch

Set **`AI_DISABLED=true`** or **`AI_PROVIDER=off`** (GitHub secret → deploy). `getAIProvider()` throws; commerce stays up. Visible on **Admin → Ops health**.

## Caching

- Daily briefing: one row per business per calendar day in `daily_business_briefings`.
- Weekly report: Redis 24h when Upstash is configured.
- Assistant chat is **not** cached (conversation-specific).

## Model routing

One model per provider (`GROQ_MODEL`, Gemini default). No automatic expensive-model fallback. Prefer Groq when both keys exist.

## Not built yet

Monthly plan allowances (4 summaries / 10 questions), token-level budgets, cost-per-business invoices. Do not invent those numbers in the UI.
