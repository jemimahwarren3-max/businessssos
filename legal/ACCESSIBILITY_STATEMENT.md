# Accessibility Statement — Kwetuu

**Last updated:** 26 October 2026

Kwetuu aims to meet **WCAG 2.2 Level AA** accessibility guidelines. We have not obtained independent third-party certification. Known limitations are listed below.

## Our commitment

We want Kwetuu to be usable by everyone, including people using
assistive technology. We're targeting the **WCAG 2.2 Level AA** guidelines
as our standard, and treat accessibility as an ongoing responsibility, not a
one-time checklist.

We have **not** obtained third-party accessibility certification, and this
statement does not claim full WCAG 2.2 AA conformance — see Known
limitations below for what hasn't been verified yet.

## What's been done

- Every interactive control is keyboard-operable; there are no
  click-handler-only elements that skip keyboard users.
- A "skip to main content" link lets keyboard users bypass the sidebar
  navigation on every page.
- Text and UI-component color contrast has been checked against WCAG's 4.5:1
  (text) and 3:1 (UI component boundaries) thresholds using an actual
  OKLCH-to-sRGB contrast calculation, and several failing combinations
  (status badge text, input field borders, muted secondary text) have been
  corrected.
- `prefers-reduced-motion` is respected — animations and transitions are
  effectively disabled for users who've set that preference at the OS or
  browser level.
- Charts (sales/profit trend graphs) include a text-equivalent summary for
  screen readers, since the visual trend line doesn't convey the underlying
  numbers on its own.
- Form fields use associated, programmatic labels (not just visible text
  near an input) so screen readers announce what each field is for.
- Icon-only buttons carry descriptive labels for screen reader users.

## Known limitations

Being direct about what hasn't been done, rather than implying more than
is true:

- **No screen reader testing has been performed.** Everything above was
  verified by reading and testing the code, not by using NVDA, JAWS,
  VoiceOver, or TalkBack against the running app. Real assistive-technology
  testing may surface issues this process couldn't catch.
- **No automated accessibility CI** (axe, Lighthouse, or similar) is wired
  into the build yet — accessibility regressions in future changes wouldn't
  currently be caught automatically.
- **Dark mode exists in the underlying styling but isn't reachable** through
  any toggle in the app today. Its contrast values haven't been prioritized
  to the same degree as the light theme actually in use.
- No dedicated accessibility settings (font size, high contrast mode,
  reduced-motion override independent of the OS setting) exist yet beyond
  what's described above.

## Reporting an accessibility barrier

If you run into something in Kwetuu that does not work with the assistive
technology you use, email **support@mykwetuu.com** with a short description
of the page and the issue. We will work to address barriers in future updates.

## Ongoing work

Accessibility improvements continue alongside regular feature work. This
statement will be updated as coverage changes — treat its "Last updated"
date as the freshness signal, not a one-time certification.
