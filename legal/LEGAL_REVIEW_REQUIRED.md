# Legal Review Required — Kwetuu

This is an index of every `LEGAL REVIEW REQUIRED` marker and open business
decision across the five draft documents in this folder. Nothing in
`legal/` should be published or relied on as real policy until the items
below are resolved by a qualified lawyer or compliance professional (and,
where marked, by you as the business owner).

This list doesn't replace reading the documents themselves — it's a
tracking aid so nothing gets missed.

## Entity & jurisdiction

- [ ] Confirm the actual legal entity operating Kwetuu (sole
      trader, registered company, or other) and its registration
      details. The 19 October 2026 drafts use placeholders and warn
      against describing a registered company if none exists. _Terms §1_
- [ ] Decide and confirm the governing law / dispute-resolution jurisdiction
      for the Terms of Service. — _Terms of Service §12_
- [ ] Confirm the minimum-age requirement against Zimbabwean contract law
      and any other jurisdiction deliberately marketed to. — _Terms of
      Service §2_

## Liability & disclaimers

- [ ] Draft a real limitation-of-liability clause with a lawyer — the
      current text is a placeholder, not a tested clause. — _Terms of
      Service §10_
- [ ] Confirm the general disclaimer language (no guaranteed revenue/
      accuracy/uptime) actually limits liability as intended under
      applicable law. — _Terms of Service §9_
- [ ] Review the AI Assistant's liability-limiting language alongside the
      Terms of Service. — _AI_DISCLAIMER.md_

## Privacy & data

- [ ] Confirm Supabase's actual data-center region(s) for this project and
      whether that creates a cross-border transfer question. — _Privacy
      Policy, Third parties table_
- [ ] Confirm Groq's current data retention / model-training policy for API
      traffic — not independently verified. — _Privacy Policy, Third
      parties table_
- [ ] Confirm Supabase's at-rest encryption guarantees for this project's
      specific plan tier. — _Privacy Policy, Data storage and security_
- [ ] Define an actual backup-retention/purge policy — none exists today
      beyond Supabase's defaults, which haven't been documented. — _Privacy
      Policy, How long we keep your data_
- [ ] Decide whether additional formal data-subject rights (objection,
      structured-format portability, defined response-time SLAs) are needed
      depending on which jurisdictions' users are served. — _Privacy
      Policy, Your rights_
- [ ] Confirm the correct contact for Zimbabwe's Data Protection Authority
      under the Cyber and Data Protection Act, if applicable. — _Privacy
      Policy, Contact_

## Billing & refunds

- [ ] Make an actual business decision on refund eligibility/process, then
      have it checked against Zimbabwean consumer protection law and
      Paynow's merchant agreement terms. — _Refund Policy_
- [ ] If Kwetuu ever serves users in jurisdictions with statutory
      cooling-off/refund rights (e.g. EU/UK), add jurisdiction-specific
      carve-outs. — _Refund Policy, Zimbabwean consumer protection_

## Contact information

- [ ] Add a real support/legal contact email or address — currently a
      placeholder in every document that needs one. — _Terms of Service
      §14, Privacy Policy Contact, Refund Policy, AI_DISCLAIMER.md,
      Accessibility Statement_

## Product gaps surfaced while drafting

These aren't legal questions, but came up while writing the documents above
and are worth a deliberate decision rather than leaving implicit:

- [ ] There's currently no in-app mechanism to report a bad/wrong AI answer.
      — _AI_DISCLAIMER.md_
- [ ] There's currently no in-app mechanism to report an accessibility
      barrier specifically (only general support, once that exists). —
      _Accessibility Statement_

## Since drafted (was "not yet drafted")

- `SECURITY.md` (repo root), `docs/DATA_FLOW.md`,
  `docs/THIRD_PARTY_SERVICES.md`, `docs/LEGAL_RISK_REGISTER.md` — all
  written and grounded in this session's actual findings. See
  `docs/LEGAL_RISK_REGISTER.md` for the consolidated, up-to-date list of
  open items — it supersedes the checklist above for anything already
  covered there.

## Not yet drafted

- Cookie Policy (the Service currently sets one essential session cookie
  and no tracking cookies, so a full cookie-consent banner isn't obviously
  required — but a lawyer should confirm that reasoning holds).
- Acceptable Use Policy as a standalone document (currently folded into
  Terms of Service §8).
- `PRIVACY_ARCHITECTURE.md` and `INCIDENT_RESPONSE.md` — not started.
