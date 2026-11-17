# Kwetuu audit delta — 17 November 2026

**Zone:** Africa/Harare (UTC+2)  
**Compared to:** [`FULL_AUDIT_2026-11-13.md`](./FULL_AUDIT_2026-11-13.md)  
**`origin/master`:** `7ee7db7` (PR #138, unchanged since 13 Nov)  
**Best pending code:** `cursor/system-stabilize-dafe` @ `81b19a9` ([PR #142](https://github.com/jemimahwarren3-max/businessssos/pull/142))  
**Method:** GitHub CI history, open PR list, local `tsc` / Vitest on PR #142 branch, manifest read, flush-mail workflow logs.

This is a **follow-up audit**, not a full re-scan of every route. For module tables and KW-* register detail, still use **13 Nov full audit** + `SYSTEM_AUDIT.md` + `ISSUE_REGISTER.md`.

---

## 1. Executive summary (17 Nov)

| Question | Answer |
| -------- | ------ |
| Is **production `master`** the “everything works” branch? | **No.** Import cleanup and Quick Add inventory fixes are **not merged**. |
| Is there a single branch that **should** fix merchant import pain? | **Yes — PR #142.** Combines #139 + #140 + manifest + mail-flush + CI hardening. |
| Does PR #142 pass CI yet? | **No** (16 Nov ~08:45 Harare): **Prettier** on `scripts/staging-api.mjs` (one indent). Code otherwise passes local `tsc` and **384** unit tests. |
| Is mail flush healthy on **master**? | **No.** Scheduled runs still **fail** (16 Nov ~20:52 Harare). Master lacks `claimError` handling from #142. |
| Did staging SQL gap (service pack) get fixed in git? | **On PR #142 only**; not on `master` manifest until merge. |

**Honest status:** Core on master is stable for **existing** merchants (POS, shop, smart Excel #137). **Your** import/junk-row workflow is **blocked on merge + deploy** of #142.

---

## 2. Open pull requests (stack)

| PR | Branch | Role | CI (last seen) |
| -- | ------ | ---- | -------------- |
| **142** | `cursor/system-stabilize-dafe` | **Merge this** — combined stabilization | Failure (prettier) |
| 141 | `cursor/full-audit-dafe` | Docs only (13 Nov audit) | Failure (paynow flake on old run) |
| 140 | `cursor/inventory-bulk-delete-dafe` | Superseded by #142 | Success (stale) |
| 139 | `cursor/quick-add-inventory-intent-dafe` | Superseded by #142 | Failure (prettier, stale) |
| 136 | `cursor/excel-smart-columns-dafe` | Overlaps #137 (already on master) | Failure (stale) |

**Recommendation:** Merge **#142** after one green CI; close **#139**, **#140**, **#136** as duplicate.

---

## 3. `master` vs PR #142 — merchant-visible delta

| Capability | `master` (live deploy baseline) | PR #142 |
| ---------- | ------------------------------- | ------- |
| Smart Excel column detection | Yes (#137) | Yes |
| Quick Add — inventory intent, junk skip | **No** | **Yes** |
| Quick Add — fuzzy match, SOH `product_import` | **No** | **Yes** |
| Bulk delete / Select likely junk | **No** | **Yes** + `archive_products` |
| Staging CI applies service/hybrid SQL pack | **No** | **Yes** (8 migrations + probes) |
| Mail cron treats claim RPC errors as non-delivery | **No** | **Yes** |
| Staging SQL API retries on 500 | **No** | **Yes** |

---

## 4. Automated health

### On `cursor/system-stabilize-dafe` (local VM, 17 Nov)

| Check | Result |
| ----- | ------ |
| `npx tsc --noEmit` | Pass |
| `npm test` | **384** passed, **97** skipped (integration gating) |
| `npm run lint` | 1 Prettier error in `staging-api.mjs` (fixed on branch after this audit write) |

### On GitHub `master` (16–17 Nov)

| Workflow | Pattern |
| -------- | ------- |
| CI (`master`) | Last success tied to **#138** merge (10 Nov) |
| Flush mail outbox | **Repeated failure** (claim / delivery path on deployed app) |
| Nightly production backup | Success |
| Generate due recurring invoices | Success |

---

## 5. Security & schema (unchanged conclusions, current gate)

| Item | Status 17 Nov |
| ---- | ------------- |
| KW-001 `get_setup_progress` | Mitigated in **git** on manifest branch path; **production** unverified without RPC probe |
| KW-037 service SQL off manifest | **Fixed in #142 manifest only** |
| KW-038 import junk rows | **Mitigation in #142 only** |
| Production schema tied to deploy | Still **no** (KW-002) |
| Paynow tamper test | Stabilized in #142 (byte flip, not suffix trim) |

No **new** P0 found in this delta pass.

---

## 6. What “working well” requires (ordered)

1. **Fix Prettier on #142** (trivial) → push → **green CI**.
2. **Merge #142** → **master** deploy.
3. **Confirm staging SQL job** applies new migrations (watch CI “Apply staging SQL” + readiness for `archive_products`, `commerce_model`).
4. **Production:** operator applies same migrations when ready (not automatic).
5. **Mail:** after deploy, flush may show **claim warnings** instead of hard fail;真正 sending still needs Resend + DB `claim_notification_outbox_admin` aligned on **production**.
6. **Merchant cleanup:** Inventory → Select likely junk → Delete selected.

---

## 7. Still outside code (unchanged)

- Wildcard shop host TLS/DNS  
- `BILLING_ENABLED=false` in deploy  
- Product variants, branch transfers, second shop  
- Provider-verified POS EcoCash  

See `KNOWN_LIMITATIONS.md`.

---

## 8. Document map

| Doc | Use |
| --- | --- |
| `FULL_AUDIT_2026-11-13.md` | Deep full audit (architecture, modules, priorities) |
| **This file** | Week delta, PR truth, merge order |
| `ISSUE_REGISTER.md` | KW-* tickets |
| `REPAIR_PLAN.md` | Repair batches |

---

## 9. One-line verdict (17 Nov)

**Master is fine for day-to-day POS/shop; your import/cleanup story is finished in PR #142 but not shipped — merge #142 is the gate for “everything working well” for imports.**