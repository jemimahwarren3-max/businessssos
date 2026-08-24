# Incident Response — BusinessOS AI

A runbook for what to actually do if something goes wrong — written against
this app's real architecture (two Supabase projects: staging
`slajanbsfqjnuuiohbmg`, production `maidxfntfpnkcqnuhozo`; Paynow; Groq)
rather than generic advice. No incident has occurred as of this writing —
this is preparation, not a post-mortem.

`LEGAL REVIEW REQUIRED`: the notification-obligation steps below are
placeholders for a decision process, not legal conclusions about when
Zimbabwean or other law actually requires notifying anyone.

## 1. Detect

Signals to watch for (none of these are currently wired to automated
alerting — see `SECURITY.md`'s Known gaps):

- Unexpected spike in `rate_limit_hits` for a given key (`select key,
  count(*) from rate_limit_hits where window_start > now() - interval '1
  hour' group by key order by count(*) desc limit 20;` via the Supabase
  Management API or dashboard SQL editor).
- Unusual `audit_logs` activity — e.g. a burst of `data.exported` actions,
  or actions from a business you don't recognize.
- Paynow reporting payment discrepancies.
- A user report of seeing another business's data (would indicate an RLS
  bypass — treat as critical immediately).
- Unexpected Supabase billing/usage spike (could indicate abuse or a
  runaway query).

## 2. Contain

Depends on what's happening — pick the narrowest containment that stops
the bleeding:

- **Suspected compromised credential** (a leaked `SUPABASE_SERVICE_ROLE_KEY`,
  `PAYNOW_INTEGRATION_KEY`, `SESSION_SECRET`, `SUPABASE_ACCESS_TOKEN`, or
  `GROQ_API_KEY`): rotate it immediately.
  - Supabase keys: Supabase dashboard → the affected project → Settings →
    API → regenerate. Update the corresponding `.env.production` /
    hosting-environment variable and redeploy.
  - `SESSION_SECRET`: rotating this invalidates *every* active session
    (everyone gets signed out) — necessary if the secret itself leaked, but
    understand the blast radius before doing it for a lesser reason.
  - `PAYNOW_INTEGRATION_KEY` / `GROQ_API_KEY`: rotate via each provider's
    dashboard, update the environment variable, redeploy.
- **Suspected RLS bypass or data leak between businesses**: this is the
  most severe category — take the affected write path offline (revert the
  deploy or disable the specific route) while investigating, rather than
  leaving it live "just to be safe."
- **Abuse of a specific endpoint** (scripted signup spam, AI Assistant
  abuse, etc.): the existing rate limits (`SECURITY.md`) are the first
  line; if they're insufficient, tighten the specific `maxRequests`/
  `windowSeconds` in `src/lib/rate-limit.server.ts`'s callers and redeploy.

## 3. Investigate

- `audit_logs` and `admin_audit_log` are the primary forensic sources —
  both include `user_id`/`business_id`/`action`/timestamps.
  `admin_audit_log` is service-role-only and covers platform-admin actions
  specifically.
- Supabase's own project logs (dashboard → Logs) cover database and auth
  events at the infrastructure level.
- For a suspected RLS issue specifically: reproduce it directly against
  **staging** (never production) using the `set_config('request.jwt.claims',
  ...); set local role authenticated;` simulation pattern already used in
  this project's integration tests (`tests/integration/helpers.ts`) to
  confirm exactly which policy is misbehaving before touching production.

## 4. Preserve evidence

Before remediating, capture:

- The relevant `audit_logs` / `admin_audit_log` rows (export or screenshot
  — remediation steps below may alter or delete data).
- The exact migration/deploy state at the time of the incident (git history
  of `supabase/migrations/`, and which one was most recently applied).
- Any relevant Paynow transaction references if payment data is involved.

## 5. Identify affected data

Cross-reference the incident against the data inventory in
`docs/PRIVACY_ARCHITECTURE.md` — which table(s), how many rows, whether any
row includes personal data about people who aren't the account holder
(e.g. a business's *customers*, not just the business owner — this is data
about people who never directly consented to anything and can't be
notified via the app).

## 6. Assess legal notification requirements

`LEGAL REVIEW REQUIRED` — this is not something to decide without a
lawyer. At minimum, document: what data was affected, how many people,
which jurisdiction(s) they're in, and how long ago it happened — that's
the information a lawyer will need to advise on Zimbabwean Cyber and Data
Protection Act obligations and any other applicable law.

## 7. Notify

Do not notify affected users, the public, or any authority before step 6
is complete — premature notification with incomplete facts can be as
damaging as a late one. Once notification is decided:

- `LEGAL REVIEW REQUIRED`: no notification template or contact list exists
  yet. Build one before it's needed, not during an actual incident.

## 8. Remediate

- Deploy the fix to **staging first**, verify it live (this project's
  established practice all session — never verify against production
  data), then apply to production.
- If the incident involved a security-relevant bug in a Postgres function
  or RLS policy, write it as a proper migration file (matching the existing
  `supabase/migrations/` numbering convention), not a one-off manual fix —
  so it's tracked and reproducible.

## 9. Document

Add an entry to `docs/LEGAL_RISK_REGISTER.md` if the incident reveals a
risk that wasn't already tracked there, and update its status if it
resolves one that was.

## 10. Prevent recurrence

- If the incident revealed a gap in test coverage, add a regression test
  to `tests/integration/` covering the specific scenario (this project's
  established pattern for every security fix made this session).
- If it revealed a monitoring gap, that's a concrete argument for finally
  wiring up the error-monitoring/alerting mentioned as absent in
  `SECURITY.md`'s Known gaps — prioritize it accordingly rather than
  leaving it perpetually deferred.
