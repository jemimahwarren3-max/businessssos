# Pre-Launch Checklist — BusinessOS AI

A go/no-go view, distinct from `LEGAL_REVIEW_REQUIRED.md` (which is a flat
list of open questions). This groups the same underlying work by what it
actually means for launching commercially:

- 🟢 **GREEN** — implemented *and* technically verified (live-tested this
  session, not just written).
- 🟡 **YELLOW** — implemented, but needs a lawyer or a business decision
  before you should rely on it.
- 🔴 **RED** — a real blocker. Don't take real customers' money until these
  are resolved.

## 🔴 RED — resolve before commercial launch

| Item | Why it blocks launch |
|---|---|
| Paynow merchant account approval | Without an approved merchant account, real payments cannot be processed at all — this is an operational blocker, not a documentation one. Confirm current status. |
| No registered legal entity confirmed | The Terms of Service can't be a real, enforceable contract without a real counterparty named in it. |
| No governing law decided for the Terms of Service | A dispute has nowhere defined to be resolved. |
| No real limitation-of-liability clause | The current text is a placeholder — this is the clause that would actually matter in a dispute, and it hasn't been drafted by a lawyer. |
| No contact information anywhere in the legal documents | Every "add a real contact here" placeholder across `legal/*.md` needs a real email/address before publishing — a policy nobody can reach you through isn't credible or, in some jurisdictions, compliant. |
| No responsible-disclosure / security contact | If someone finds a vulnerability, there's currently no way for them to tell you responsibly. |

## 🟡 YELLOW — built, needs legal or business sign-off

| Item | What's done | What's still needed |
|---|---|---|
| Terms of Service | Fully drafted, grounded in actual billing/data behavior | Lawyer review, entity name, governing law (see RED above) |
| Privacy Policy | Fully drafted, data flows verified against actual code | Lawyer review; confirm Supabase region, Groq retention policy, international transfer question |
| Refund Policy | Reasonable default drafted | An actual business decision from you, then legal check against Zimbabwean consumer protection law |
| AI Disclaimer | Drafted, data flow to Groq precisely documented | Lawyer review of the liability-limiting language |
| Cookie Policy | Drafted; technically accurate (one cookie, no tracking) | Lawyer confirmation that no consent banner is required |
| Accessibility Statement | Drafted, honest about scope | No real screen-reader testing has been performed — don't claim more than the statement itself claims |
| Third-party DPAs (Supabase, Paynow, Groq) | Vendor inventory documented (`docs/THIRD_PARTY_SERVICES.md`) | Confirm whether formal Data Processing Agreements are needed/exist |
| Zimbabwe Cyber and Data Protection Act compliance | Data handling documented accurately | Not assessed against the actual statute — needs a lawyer familiar with it |

## 🟢 GREEN — implemented and verified

Every item below was not just written but live-tested this session (staging
Supabase project, throwaway data, cleaned up afterward) — see the session
history / `SECURITY.md` for how.

**Security & data integrity**
- Row-level security enforcing tenant isolation (a business cannot read or
  write another business's data).
- Every multi-step write (sales, invoices, products, stock adjustments,
  account deletion) is a single atomic Postgres function — verified no
  partial-state failures, and verified concurrent requests correctly
  serialize instead of racing (e.g. two simultaneous stock adjustments).
- Rate limiting on every sensitive endpoint (sign-in, sign-up, password
  reset, account deletion, data export, checkout, the Paynow webhook).
- Mandatory TOTP MFA on the platform-admin account, enforced server-side on
  every admin action (not just at page load) — confirmed live that a fresh
  session is rejected until challenged, even with a factor already enrolled.
- CSRF protection, security response headers (CSP, HSTS, etc.), and
  webhook signature verification are all wired in and confirmed present on
  real responses.
- Audit trail (`audit_logs`) and consent record (`legal_acceptances`) are
  both confirmed forgery-resistant — a user's own session cannot insert a
  row claiming an action or acceptance that didn't happen.

**User rights & billing**
- Trial/plan-expiry enforcement: confirmed live that writes are blocked
  and reads remain available once a trial lapses unpaid.
- Data export: confirmed live that the correct data is returned and
  non-owner/admin roles are blocked.
- Account deletion: confirmed live that deletion is immediate, cascades
  correctly, and is correctly *refused* (atomically) when other active
  team members exist.
- Consent gate: confirmed live that sign-up is rejected server-side
  without acceptance, and that a signed-in user cannot forge their own
  acceptance record.

**Accessibility**
- Color contrast fixes verified by independent calculation (not
  eyeballed) — several real WCAG failures found and corrected.
- Skip link, keyboard focus visibility, `prefers-reduced-motion` support,
  chart text alternatives, and form label associations all implemented
  and confirmed present in the built app.

## What this checklist doesn't cover

Tax obligations, employment law, trademark clearance, and a formal
third-party license audit were out of scope for this work entirely — see
`docs/LEGAL_RISK_REGISTER.md`'s "Categories not yet assessed" section.
