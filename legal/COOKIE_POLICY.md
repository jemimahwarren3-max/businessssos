# Cookie Policy — BusinessOS AI

> **DRAFT — NOT LEGAL ADVICE.** The technical claim below (exactly one
> cookie, no tracking) is accurate as of this writing, verified by reading
> the codebase. Whether that means a cookie-consent banner is legally
> unnecessary in every jurisdiction you serve is a question for a lawyer,
> not this document.

_Last updated: 2026-10-19 (still a draft. See the banner above.)_

## The short version

BusinessOS AI sets **one cookie**. It holds your encrypted, signed sign-in
session — it's what keeps you logged in between page loads. It is not a
tracking or advertising cookie, and no other cookie is set by the
application itself.

## The one cookie, in detail

| Name | Purpose | Type | Duration | Set by |
|---|---|---|---|---|
| Session cookie (see `src/lib/auth/session.server.ts`) | Keeps you signed in. Contains your encrypted session, not readable or usable without the server's secret key. | Strictly necessary | Matches your session lifetime; cleared on sign-out or account deletion. | BusinessOS AI (first-party) |

It's `httpOnly` (not readable by JavaScript, including any script that
might run on the page), `secure` (HTTPS-only), and `sameSite=Lax` (not sent
on cross-site requests, which is part of what protects against CSRF).

## What we don't use cookies for

- No advertising or retargeting cookies.
- No cross-site tracking cookies.
- No analytics cookies — no analytics tool is integrated in the app at all
  (verified by checking the codebase, not assumed).

## Third-party requests that aren't cookies but are worth mentioning

Loading the app also triggers a request to Google Fonts for the app's
typeface. That's a direct browser-to-Google request, not a cookie
BusinessOS AI sets, but it does mean your browser's IP address is visible
to Google when a page loads. See
[Privacy Policy](/legal/privacy#third-parties-we-share-data-with) for more.

## Managing cookies

Since the one cookie in use is required for you to stay signed in, turning
it off in your browser will simply sign you out / prevent sign-in — there's
no optional-cookie toggle to offer, because there's no optional cookie.

## Changes to this policy

If that ever changes — for example, if an analytics or marketing tool is
added later — this document and `legal/PRIVACY_POLICY.md` both need
updating first, and if the new cookie isn't strictly necessary, a real
consent mechanism (not just this document) would need to be built before
it ships. `LEGAL REVIEW REQUIRED`: confirm this obligation and its exact
trigger conditions with a lawyer before adding any non-essential cookie.
