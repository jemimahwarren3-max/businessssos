# BusinessOS Privacy Policy

> **Working draft. Not a guarantee of compliance.** This document describes the BusinessOS software as implemented on 19 October 2026. It has not been reviewed by a qualified lawyer. Replace the placeholders with the operator's real legal name, status, address and contact details before you treat this as published policy. Zimbabwe's Cyber and Data Protection Act and Consumer Protection Act still need professional review.

**Effective date:** 19 October 2026  
**Last updated:** 19 October 2026  
**Document version:** 2026-10-19

## 1. Introduction

BusinessOS ("BusinessOS", "we", "us" or "our") is a business management and online commerce platform. It helps merchants manage operations, sell in person and online, and connect with customers.

This Privacy Policy explains how we collect, use, store, disclose and protect personal information when you use our website, merchant tools, online storefronts, marketplace, integrations or related services (the "Services").

It applies to merchants, authorised staff, shoppers, website visitors and other people who interact with the Services.

BusinessOS is intended to launch first in Zimbabwe. If we process information about people in other places, extra rules may apply.

Using the Services means you have had a chance to read this Policy. Where the law requires consent, we will ask for it separately. Using the Services is not consent to every possible use of personal information.

## 2. Who we are

**Platform name:** BusinessOS  
**Website:** [INSERT OFFICIAL BUSINESSOS DOMAIN]  
**Operator's full legal name:** [INSERT FULL LEGAL NAME]  
**Legal status:** [INSERT ACCURATE LEGAL STATUS. If you operate as an individual without a registered company, say so. Do not describe BusinessOS as a registered company unless that is true.]  
**Business or service address:** [INSERT REQUIRED CONTACT ADDRESS]  
**Privacy contact email:** [INSERT PRIVACY EMAIL]  
**General support email:** [INSERT SUPPORT EMAIL]  
**Telephone or other contact method:** [INSERT CONTACT DETAILS]

"BusinessOS" means the operator named above and the Services it runs.

We may process information as a controller where we decide the purposes and means. We may process merchant customer information as a processor or service provider when we handle it on the merchant's instructions. The role depends on the activity and the law.

## 3. Information we collect

We collect information that is reasonably needed for the features you use.

### 3.1 Account and identity

When you create or manage a merchant or staff account we may collect name, email, phone, authentication identifiers, account settings, business name and contact details, business category and location, staff roles and permissions, and information used to check an account when that check exists.

Registering a shop is not the same as a verified identity. We do not award a verification badge unless the relevant checks have been completed.

### 3.2 Business records

When merchants use BusinessOS we may process product names, descriptions, image URLs, prices, SKUs, barcodes, stock, sales, online orders, returns, refunds, suppliers, purchase orders, expenses, staff and (where enabled) location data, storefront content, reports, logs, settings, payment status for recorded sales, and support messages.

Merchants must have a lawful basis for giving us personal information about their customers and staff.

### 3.3 Shopper and order information

When someone browses, checks out or tracks an order we may collect name, phone, optional email, delivery address, items, quantities, prices, fees, currency, collection or delivery choice, order status, payment method and status, notes, complaint messages, verified-purchase review text and ratings, and listing-report messages.

Guest checkout is available. An account is not required to place an online order. We still need contact and order details to process that order. Access to the customer order page requires the one-time access code shown after checkout, not the order number alone.

Product reviews are accepted only when the shopper proves the order with that access code and the shop has marked the order ready, out for delivery, or completed. The public review shows a first name (or "Customer"), the rating, the text, and that it is a verified purchase. Phone numbers are not shown on the product page. Listing reports can include optional contact details for follow-up. We do not invent ratings or review counts.

### 3.4 Payment information

**Merchant subscription billing.** When a merchant pays for a BusinessOS plan, Paynow may receive email, amount, description and, for EcoCash or OneMoney, a phone number. Card numbers are handled by Paynow according to that integration. Platform Paynow keys are not used to collect money for a shopper's purchase from a merchant.

**Shop checkout Paynow.** If a merchant pastes their own Paynow integration ID and key, shopper checkout may send that shopper's email, phone (for EcoCash), order reference and amount to Paynow using those merchant credentials. BusinessOS does not use platform billing keys for that charge.

**Shopper checkout as implemented.** Online shops offer pay on collection, pay on delivery, a quote request, and Paynow when the merchant has linked their own Paynow keys. Paynow charges that shopper against the merchant's Paynow account. Shoppers do not pay BusinessOS. Cash is recorded in the app only after the merchant has the money. Cash currency and change rules are those the merchant configured and snapshotted on the order. InnBucks and other processors are not connected.

### 3.5 Technical and usage information

We may collect IP address, browser and device information, session and sign-in events, pages or features used, error and performance logs, security events, and the essential session cookie.

If Sentry is configured, error reports may include technical details needed to diagnose a failure. If Upstash Redis is configured, a short-lived cache of workspace membership (business, role, plan) may be stored. Neither is required for the core app to run.

We do not currently use Google Analytics, Meta Pixel, Umami, or similar marketing analytics.

### 3.6 Communications and integrations

Depending on configuration we may process information connected with:

- Supabase Auth emails (sign-up confirmation, password reset).
- In-app notifications for merchants.
- Transactional shopper emails (order receipt and later status updates) when an email was given at checkout and Resend is configured. The access code is included only on the first receipt.
- WhatsApp click-to-chat links a merchant publishes. BusinessOS does not send WhatsApp Cloud API messages in the current build. Chat content stays on WhatsApp once the customer leaves our site.
- Groq, if a merchant uses the optional AI assistant: an aggregated business summary plus the typed question. Groq does not receive raw customer emails or phone numbers from the customer list in the current implementation.
- Hosting and database providers (see section 9).

We do not access an external account just because you have a BusinessOS account.

### 3.7 Information you provide voluntarily

Support requests, feedback, complaint forms and similar messages.

Do not submit sensitive personal information unless it is necessary and there is a lawful basis.

## 4. How we use information

We may use personal information to:

1. Create, authenticate and maintain accounts.
2. Provide inventory, POS, invoicing, reporting and related tools.
3. Publish storefronts and eligible marketplace listings.
4. Process and track online orders, including stock reservation.
5. Record merchant-confirmed payments and reconcile them with sales records.
6. Show collection, delivery and cash rules the merchant configured.
7. Send necessary account, security and in-app order notices.
8. Operate integrations a merchant has actually enabled.
9. Prevent fraud, abuse and unauthorised access.
10. Investigate disputes and keep transaction records.
11. Improve reliability and fix errors.
12. Administer subscriptions and plan limits.
13. Meet legal, tax, accounting and recordkeeping duties that apply.
14. Establish or defend legal claims.
15. Send marketing only where the law allows and, where required, with consent. We do not currently run a marketing email product.

We will not use personal information for a materially different purpose without an appropriate legal basis and any notice the law requires.

## 5. Legal basis for processing

Where the law requires it, we rely on an appropriate basis, which may include performing a contract, a legal obligation, legitimate interests balanced against your rights, consent, or other bases the law permits.

Withdrawing consent, where processing depends on consent, does not automatically make earlier lawful processing invalid.

## 6. Public storefronts and marketplace listings

Merchants may publish business name, logo, description, public contact details, products, prices, availability labels, delivery and collection text, and shop policies.

Do not put private personal information in public fields.

Public pages may be indexed by search engines. Removing a listing from BusinessOS does not guarantee immediate removal from other copies.

We may remove or restrict listings for security, legal compliance, moderation or enforcement of our terms.

## 7. Merchant responsibilities for customer data

Merchants receive personal information needed to fulfil orders. They must use it lawfully, keep it secure, limit staff access, avoid collecting more than needed, obtain permission for marketing, honour applicable rights, retain it only as allowed, and tell us about relevant incidents where required.

Merchants must not sell or misuse customer information for unrelated purposes without a lawful basis.

## 8. Cookies and similar technologies

BusinessOS sets an essential httpOnly session cookie so signed-in merchants stay authenticated. It is not an advertising cookie.

The merchant app may register a service worker for offline POS on signed-in layouts. That is not a marketing tracker.

Shoppers on a public storefront do not need that session cookie to browse or check out.

If we add non-essential analytics or advertising technologies, we will update this Policy and add consent controls where the law requires them.

See the [Cookie Policy](/legal/cookies).

## 9. When we share information

### 9.1 Service providers

We may share relevant information with providers that actually support the deployed app:

| Provider | Role in the current product |
|---|---|
| Supabase | Database, authentication, and related infrastructure |
| Paynow | BusinessOS subscription payments only |
| Hosting (Cloud Run is the intended production host; Render may be used temporarily) | Running the application |
| Groq | Optional AI assistant, if configured |
| Sentry | Optional error monitoring, if configured |
| Upstash | Optional short-lived workspace cache, if configured |
| Google Fonts | Typeface files requested by the browser |

Their locations, contracts and safeguards differ. Confirm them before launch.

### 9.2 Merchants and customers

We give the fulfilling merchant the customer contact details, items, fulfilment instructions and payment status for that order. A merchant may share what is needed with its own staff or delivery helper.

We do not give one merchant another merchant's orders or customers.

### 9.3 Legal and safety

We may disclose information where reasonably necessary to comply with law, a lawful request, or to protect people and the Services.

### 9.4 Business transfers

If the operation of BusinessOS is transferred, information may move with it, subject to privacy law.

### 9.5 With your direction

We may share information when you ask us to, or where another lawful basis permits it.

We do not sell personal information to advertisers as a business model.

## 10. International data transfers

Providers may store or process information outside Zimbabwe. A cloud product being available does not by itself make every transfer lawful. We will take the steps the law requires once the operator, regions and contracts are confirmed.

## 11. Data security

We use reasonable safeguards, including authentication, role-based permissions, database row-level security, validation, rate limits, encrypted sessions, and backups where configured.

No internet system is completely secure. We cannot promise that an incident will never happen. If a personal-data breach occurs we will investigate and take the containment, notice and reporting steps the law requires.

Protect your passwords and tell us if you suspect account misuse.

## 12. Data retention

We keep information only as long as reasonably needed for the purposes above, plus legal, accounting, security and dispute needs.

Examples: account data while the account is active; orders and sales for accounting and disputes; security logs for a limited operational period; backups until that cycle expires.

When information is no longer needed we delete, anonymise or restrict it, subject to lawful retention and technical limits (including backup copies).

## 13. Your privacy rights

Depending on applicable law you may be able to request access, correction, deletion, restriction, a copy of certain information, withdrawal of consent, or to complain to a data protection authority.

Rights have legal exceptions, including other people's rights and required records.

Contact [INSERT PRIVACY EMAIL] and give enough detail for us to verify who you are.

If a merchant holds the information, you may need to contact that merchant. Where we act as a processor we may help that merchant respond.

Merchant users can export some business data from account settings where that feature is enabled.

## 14. Marketing and notifications

We send necessary service messages (security, sign-in, billing, important account changes).

Merchant shop alerts (new online orders, complaints, verified-purchase reviews, listing reports, and low-stock crossings) appear in the BusinessOS app. If the operator has configured Resend, a copy may be emailed to owners, admins and managers who have shop-alert email turned on. Shoppers who provided an email at checkout may receive a receipt and later status updates through the same provider. Those messages are operational, not marketing. WhatsApp is not used to send them.

We do not currently operate a promotional email or SMS campaign product. If we add one, we will obtain consent where required and offer an opt-out. Unsubscribing from marketing does not stop essential service messages. Turning off shop-alert email does not stop in-app alerts.

## 15. Children's privacy

BusinessOS is intended for adults acting as business owners, staff or customers. We do not knowingly seek children's personal information where that would be unlawful. If you believe a child has given us information inappropriately, contact us.

## 16. Automated processing and AI

The optional AI assistant may send Groq a summary of business figures plus the question you type. Outputs can be wrong. Review them before relying on them for money, stock or legal decisions.

We will not claim that data is never used to improve a provider's models unless that is confirmed in the provider agreement.

Do not paste sensitive personal information into the assistant unless that processing is authorised and necessary.

## 17. Third-party websites and services

Links and integrations (including WhatsApp, Paynow and social profiles) are run by other organisations. Their policies apply to what you give them.

## 18. Changes

We may update this Policy. We will publish the new version and change the date. Where the law requires notice or consent for a material change, we will do that.

The current version is at `/privacy` and `/legal/privacy`. Sign-up records the version identifiers in `legal_acceptances`.

## 19. Contact and complaints

**BusinessOS privacy contact**  
Email: [INSERT PRIVACY EMAIL]  
Address: [INSERT REQUIRED CONTACT ADDRESS]  
Website: [INSERT OFFICIAL BUSINESSOS DOMAIN]

You may also have the right to complain to the relevant authority.

Nothing in this Policy is intended to remove a right that cannot legally be removed.

## 20. Final notice

This Policy must match the Services that are actually running, the providers actually used, and the safeguards actually in place. If a feature is not implemented, this Policy is not evidence that it is.
