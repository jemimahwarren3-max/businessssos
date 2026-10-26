# Desktop and Android packaging proof

**Date:** 26 October 2026
**Status:** **Hosted-shell packaging proof passed; bundled frontend and release validation remain blocked.**

This proof tested PR #66 (`2f3679a`) in a separate, detached worktree. The
subscription-currency work and other existing changes in the main checkout
were not modified. No `.env` values, live payments, or production deployment
were involved. Pushing the CI fix triggered the repository's existing staging
migration job; the effect is detailed below.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Web production build | **PASS** | `npm run build` completed. It produces `.output/server/index.mjs` and static assets under `.output/public`, but no `.output/public/index.html`. |
| Capacitor hosted-shell sync | **PASS** | Default configuration points to `https://mykwetuu.com/staff-login`. Capacitor sync completed, and Android logs confirmed the app loaded that remote URL and started. This is not a bundled frontend. |
| Capacitor bundled-asset sync | **FAIL** | With the hosted URL removed, `npm run mobile:sync` stops with: `The web assets directory (./.output/public) must contain an index.html file.` |
| Android APK build | **PASS, limited** | `assembleDebug` and `assembleRelease` completed. The debug APK installed and launched in the emulator; a follow-up launch under host memory pressure caused Android System UI to become unresponsive. The release APK is unsigned. Authentication was not attempted. |
| Tauri desktop executable | **PASS, limited** | `npx tauri build --no-bundle` built `app.exe` using the production hosted URL. The installed executable remained running and responsive for 15 seconds. |
| Windows NSIS installer | **PASS, limited** | The NSIS setup executable built and installed silently into an isolated test directory; the installed app launched and remained responsive. The test installation was then uninstalled. The installer is unsigned. |
| Authentication and Supabase access | **NOT VERIFIED** | No test account was used. The hosted-shell app loaded the sign-in page, but no login was performed. |
| Android signed release | **NOT TESTED** | No release signing identity or keystore was used or created. |

## Compatibility finding

The current production build is a TanStack Start/Nitro server application,
not a standalone static SPA. Its `.output/public` directory contains assets,
while HTML rendering and server functions are provided by the Node server.
That is why Capacitor rejects the bundled asset directory and why a Tauri
executable alone does not demonstrate a working local client.

Authentication and protected business operations use TanStack server
functions and a server-managed encrypted, `httpOnly` session cookie. The
server-function calls are relative to the current origin, the session cookie
uses `SameSite=Lax`, and CSRF validation defaults to same-origin. A bundled
native UI calling a hosted API therefore needs a deliberate API-origin,
credentialed-CORS, cookie, and CSRF design. Do not bypass those controls or
put server secrets in the native app to make the proof pass.

PR #66's current release configuration intentionally uses the hosted staff
site; it does not satisfy the bundled-frontend requirement. The first run's
`e2e-smoke` failed because Playwright 1.55.1 does not support Chromium on the
`ubuntu-latest` runner image (Ubuntu 26.04); deployed smoke tests were skipped.
Commit `585cf1a` pins that job to Ubuntu 24.04 and has been pushed to PR #66.
The follow-up CI run
[`40331354837`](https://github.com/jemimahwarren3-max/businessssos/actions/runs/40331354837)
passed both `check` and `e2e-smoke`, including deployed smoke tests. A
successful CI run and local installer build do not certify authentication,
updates, or release signing.

## CI staging side effect

The pushed commit triggered the existing `Apply staging SQL` CI step. Its
logs confirm these migrations were applied to **staging**:

- `20261020030000_product_media.sql`
- `20261021120000_manual_shop_payments.sql`
- `20261021140000_payment_proof_storage.sql`
- `20261021141000_platform_fx.sql`
- `20261022120000_fix_store_order_notification_currency_precedence.sql`
- `20261022130000_allow_storefront_audit_actions.sql`
- `20261022140000_store_review_responses.sql`
- `20261023120000_payment_safety_foundation.sql`
- `20261023130000_platform_owner_foundation.sql`
- `20261023150000_growth_intelligence.sql`

Three later storefront migrations were skipped as already applied. The workflow
reported “Production was not touched.” Its separate email-provider settings
PATCH returned HTTP 403 because the configured CI token lacks
`auth_config_write` and `project_admin_write`; the CI step still completed.
Credential values were masked in logs and were not inspected.

## Host setup completed for this proof

- Rust stable 1.99.1 and Visual Studio 2022 C++ build tools were installed.
- Android Emulator API 36 and a Pixel virtual device were installed.
- These tools are machine-level prerequisites; no repository signing keys or
  secrets were added.

## Recommendation

The hosted shell is a viable first installable milestone, but the tested
artifacts are unsigned and authentication was not exercised. Do not treat the
apps as offline-ready or release-ready. Before distribution, complete signed
release builds and test login/session restoration and protected server
functions with an authorized test account on supported Windows and Android
devices. The bundled/offline path remains a separate, later project.

Next steps for this hosted-shell milestone are to provide release signing
credentials through a secure local or CI process and run authorized
authentication/session and protected-operation tests on real supported
devices. No payment, offline-sale, or sync behavior has been validated by this
packaging proof.
