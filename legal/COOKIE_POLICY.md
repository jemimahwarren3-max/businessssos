# Cookie Policy — Kwetuu

> **Published for Kwetuu at https://mykwetuu.com.** Kwetuu currently sets one strictly necessary session cookie and no advertising or analytics cookies. If we add non-essential cookies later, we will update this page and add consent where the law requires it.

**Last updated:** 26 October 2026

## The short version

Kwetuu sets **one cookie**. It holds your encrypted, signed sign-in
session — it's what keeps you logged in between page loads. It is not a
tracking or advertising cookie, and no other cookie is set by the
application itself.

## The one cookie, in detail

| Name                                                  | Purpose                                                                                                       | Type               | Duration                                                                | Set by                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------- | --------------------------- |
| Session cookie (see `src/lib/auth/session.server.ts`) | Keeps you signed in. Contains your encrypted session, not readable or usable without the server's secret key. | Strictly necessary | Matches your session lifetime; cleared on sign-out or account deletion. | Kwetuu (first-party) |

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
Kwetuu sets, but it does mean your browser's IP address is visible
to Google when a page loads. See
[Privacy Policy](/privacy) for more.

## Managing cookies

Since the one cookie in use is required for you to stay signed in, turning
it off in your browser will simply sign you out / prevent sign-in — there's
no optional-cookie toggle to offer, because there's no optional cookie.

## Changes to this policy

If we add analytics or marketing cookies, we will update this page and the Privacy Policy first, and we will add a consent mechanism before any non-essential cookie ships.
