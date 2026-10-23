# TanStack Start security upgrade (GHSA-qx66-fv34-fjm8)

## Issue

`npm audit` reports a **critical** reflected XSS in TanStack Start server-function responses for `@tanstack/react-start` versions **1.143.12 through 1.168.59**. The patched line is **`@tanstack/react-start` ≥ 1.169.4** (with matching `@tanstack/start-server-core` ≥ 1.169.39).

Advisory: https://github.com/advisories/GHSA-qx66-fv34-fjm8

## Current repo pin

`master` uses `@tanstack/react-start` **^1.168.32** so the advisory applies until upgraded.

## Upgrade attempt (Oct 2026)

Bumping to **1.169.4** and refreshing `package-lock.json` clears the TanStack critical in audit, but **`npm run build` fails** with a Rolldown/Vite error (`Missing export`) because transitive `@tanstack/start-plugin-core` resolves ahead of the Start release line.

`npm overrides` for `@tanstack/start-server-core` alone **does not** satisfy `npm audit` on the top-level `@tanstack/react-start` package and also broke the build in this environment.

**Do not merge a half-upgraded lockfile** until `npm run build` and `npm test` pass on CI.

## Mitigations until upgrade

- Keep **authentication and authorization** on every sensitive server function (existing pattern).
- **Rate limits** on auth, checkout, and webhooks (`check_rate_limit`).
- Do not expose server functions that return unsanitized user input in error paths.
- Prefer upgrading the whole TanStack Start stack in one PR when `@tanstack/react-start`, `@tanstack/router-plugin`, and plugin-core versions align on npm.

## How to upgrade when ready

1. Set in `package.json`:
   - `"@tanstack/react-start": "^1.169.4"` (or latest ≥ 1.169.4)
   - Align `@tanstack/react-router` and `@tanstack/router-plugin` to versions recommended by that release.
2. Regenerate lockfile with a current npm (e.g. `npx npm@11 install --package-lock-only`).
3. Run `npm ci`, `npm test`, `npm run build`.
4. Confirm `npm audit` no longer lists GHSA-qx66-fv34-fjm8.
5. Smoke-test OAuth, checkout, and one server function in staging.

## Other audit items

After TanStack is fixed, remaining highs are mostly **axios** (transitive via Paynow SDK) and **vitest** (dev-only). Track separately; do not block merchant checkout on dev dependency advisories.
