# TanStack Start security upgrade (GHSA-qx66-fv34-fjm8)

## Issue

An unauthenticated attacker can craft a server-function URL that causes an affected TanStack Start app to return attacker-controlled HTML from its own origin.

The advisory affects published versions from `1.143.12` up to each package's patched release:

- `@tanstack/react-start` **1.168.60**
- `@tanstack/start-server-core` **1.169.39**
- `@tanstack/solid-start` **1.168.57**
- `@tanstack/vue-start` **1.168.56**

Advisory: https://github.com/advisories/GHSA-qx66-fv34-fjm8

## Verified fix

This branch pins `@tanstack/react-start` to **1.168.60** and aligns the router and plugin packages. The locked dependency tree resolves the patched server core.

An earlier attempt to move to **1.169.4** failed the production build because transitive `@tanstack/start-plugin-core` resolved ahead of the Start release line. The aligned package set was verified instead.

Validation on the aligned set: `npm audit` reports zero vulnerabilities, `npx tsc --noEmit` passes, `npm test` passes, and `npm run build` succeeds.

## Ongoing safeguards

- Keep **authentication and authorization** on every sensitive server function (existing pattern).
- **Rate limits** on auth, checkout, and webhooks (`check_rate_limit`).
- Do not expose server functions that return unsanitized user input in error paths.
