# Why the live app might look unchanged

Kwetuu ships in **three layers**. SQL alone does not update what merchants see in the browser.

| Layer | What you do | What it changes |
| ----- | ----------- | ---------------- |
| **1. Database** | Run Supabase migrations in order | RPCs, RLS, admin tables, billing flags |
| **2. Application** | Merge GitHub PRs + deploy Cloud Run (or your host) | Routes, UI, `/admin`, branches UI, launch centre |
| **3. Config** | Env vars + one-time SQL bootstrap | Paynow, Resend, `bootstrap_platform_owner`, `billing_enforced` |

## Common situation (October 2026)

- **`master` on GitHub** includes the big merchant stack from **PR #73** (launch centre, online orders nav, Paynow ZiG, etc.) after deploy.
- **Platform admin (phases 1–3)** is on **[PR #74](https://github.com/jemimahwarren3-max/businessssos/pull/74)** — **not merged to `master` yet**. Until that PR merges **and** production deploys that commit, **`/admin` and impersonation do not exist** on `mykwetuu.com`.
- Running admin SQL on Supabase **without** deploying PR #74 only prepares the database; the Node app will not call the new RPCs from the admin UI.

## Checklist when “nothing changed”

1. **Which commit is production running?** Compare Cloud Run revision / build SHA to [GitHub `master`](https://github.com/jemimahwarren3-max/businessssos/commits/master).
2. **Did the PR merge?** Open PRs do not affect production until merged and deployed.
3. **Hard refresh** or sign out/in after deploy (PWA cache can show old bundles).
4. **Platform admin:** merge PR #74, deploy, apply admin migrations, then `select bootstrap_platform_owner('your@email');`, MFA, visit `/admin`.
5. **Merchant features:** merge branch PRs (e.g. branches UI), deploy, apply any new migration for that PR.

## Open PRs to watch

| PR | Branch | Merchant-visible? |
| -- | ------ | ----------------- |
| [#74](https://github.com/jemimahwarren3-max/businessssos/pull/74) | `cursor/platform-admin-console-dafe` | `/admin` only (operators) |
| Branches UI (this wave) | `cursor/branches-locations-ui-dafe` | `/branches` add/edit/default |
