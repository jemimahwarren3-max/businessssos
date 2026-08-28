# Business Navigator AI

SUPER PROMPT: BUILD BUSINESSOS AI

You are a senior product designer, SaaS architect, security engineer, UX designer, and full-stack developer.

Build a production-quality SaaS application called BusinessOS AI.

The product is an AI-ready business management platform for small and medium-sized businesses. It combines inventory management, sales, invoicing, customers, suppliers, expenses, reporting, business insights, and an AI assistant into one simple platform.

The goal is NOT to create another complicated accounting/ERP application.

The goal is:

Make running a small business feel simple.

The application should feel polished enough to compete visually with modern products such as Square, Shopify, Zoho, QuickBooks, Stripe, Notion and Linear, while remaining simpler and more approachable for small-business owners.

Do not copy their branding, layouts, logos, or proprietary designs. Study the best UX patterns from modern SaaS products and create an original interface that improves upon the common weaknesses of existing business-management software.

1. PRODUCT VISION

BusinessOS AI should become the digital operating system for a small business.

A business owner should be able to:

Manage products

Track inventory

Record sales

Generate invoices

Generate quotations

Track payments

Manage customers

Manage suppliers

Track expenses

View profits

Analyze business performance

Receive low-stock warnings

Generate reports

Manage employees

Ask questions about their business

Eventually use AI to generate recommendations and marketing content

Everything should be connected.

For example:

PRODUCT → INVENTORY → SALE → CUSTOMER → INVOICE → PAYMENT → PROFIT → REPORT → BUSINESS INSIGHT

Do not create disconnected modules.

2. IMPORTANT MVP PRINCIPLE

Do NOT attempt to build every possible feature immediately.

Build a strong MVP first.

The MVP must contain:

Authentication

Business/workspace creation

Dashboard

Products

Inventory

Sales

Customers

Suppliers

Invoices

Quotations

Expenses

Payments

Reports

Notifications

Subscription/paywall

User roles and permissions

Security/audit logs

AI-ready assistant interface

The AI interface should initially work with mocked/local responses if no AI API is configured.

DO NOT require an external AI API to run the core application.

The core business-management application must work without an AI API.

Design the architecture so an AI provider can be connected later.

3. TARGET USERS

Design primarily for:

Grocery stores

Boutiques

Hardware stores

Electronics shops

Pharmacies

Salons

Restaurants

Bakeries

Small wholesalers

Freelancers/service businesses

The interface must be understandable to someone who is NOT technically skilled.

Avoid accounting jargon where simpler language works.

For example:

Instead of:

"Accounts Receivable"

Use:

"Customers who owe you"

Instead of:

"COGS"

Use:

"Cost of goods"

4. BRAND AND VISUAL DESIGN

Create a premium but friendly visual identity.

The application should feel:

Clean

Modern

Trustworthy

Professional

Calm

Fast

Intelligent

Approachable

Avoid:

Overly futuristic AI aesthetics

Excessive gradients

Excessive glassmorphism

Huge rounded cards everywhere

Clutter

Tiny text

Excessive animations

Generic dashboard templates

Use a refined SaaS design system.

PRIMARY COLOUR

Use a deep indigo/navy as the primary brand colour.

Suggested:

Primary:
#4F46E5

Dark:
#312E81

Background:
#F8FAFC

Surface:
#FFFFFF

Text:
#0F172A

Secondary text:
#64748B

Success:
#16A34A

Warning:
#F59E0B

Danger:
#DC2626

Info:
#0284C7

Use colour intentionally.

Do not make every card colourful.

The interface should mostly use white/light surfaces with strong typography and restrained colour accents.

5. TYPOGRAPHY

Use:

Inter

or another highly readable modern UI font.

Typography hierarchy:

Large dashboard headings:
28-32px

Section headings:
20-24px

Body:
14-16px

Secondary text:
13-14px

Small metadata:
12-13px

Make the application extremely readable on mobile.

6. RESPONSIVE DESIGN

The application must work beautifully on:

Desktop

Tablet

Mobile

Use responsive layouts rather than simply shrinking the desktop interface.

On mobile:

Bottom navigation should prioritize:

Home
Sales
Inventory
Invoices
More

Provide a floating quick-action button for:

Sale

Product

Invoice

Expense

7. DASHBOARD

The dashboard should be the heart of the application.

At the top:

"Good morning, Sarah"

Then show:

Today's Sales
Today's Profit
Outstanding Payments
Low Stock Items

Use clean cards.

Example:

TODAY'S SALES
$842.50
+12.4%

TODAY'S PROFIT
$241.20
+8.1%

CUSTOMERS OWING
$436.00
7 customers

LOW STOCK
8 products
3 urgent

Then provide a sales chart.

Allow:

Today
7 Days
30 Days
3 Months
1 Year

8. BUSINESS HEALTH

Create a distinctive feature called:

Business Health

Show a score from 0-100.

Example:

84
Healthy

Then show:

✓ Revenue increased 12%
✓ Inventory is stable
⚠ 3 products are running low
⚠ 2 invoices are overdue
↑ Customer purchases increased

The score should be calculated from actual business metrics.

Do not fake AI.

For the MVP, use deterministic rules.

Later, AI can make this more sophisticated.

9. QUICK ACTIONS

Make common actions extremely fast.

Buttons:

New Sale
New Invoice
Add Product
Add Expense
Add Customer
Create Quote

A user should be able to create a sale in as few steps as reasonably possible.

10. INVENTORY

Create a professional inventory system.

Each product should support:

Product name

SKU

Barcode

Category

Description

Product image

Cost price

Selling price

Current stock

Minimum stock

Supplier

Tax

Unit

Status

Created date

Updated date

Support:

Stock in

Stock out

Adjustments

Returns

Low-stock alerts

Search

Filtering

Sorting

Bulk actions

Inventory should automatically update when a sale is completed.

Do not allow inventory numbers to silently become inconsistent.

Every stock change should create an inventory movement record.

11. SALES

Create a fast sales interface inspired by modern POS systems.

Features:

Search products

Barcode input

Categories

Cart

Quantity adjustment

Discounts

Taxes

Customer selection

Payment method

Cash

Card

Mobile money

Bank transfer

Credit

After completing a sale:

Automatically:

Reduce inventory

Create sale record

Create sale items

Record payment

Update customer balance if applicable

Generate receipt

Record audit event

Use database transactions so these operations remain consistent.

12. INVOICES

Create professional invoices.

Invoice fields:

Business logo

Business name

Business address

Customer

Invoice number

Date

Due date

Products/services

Quantity

Unit price

Discount

Tax

Total

Payment status

Notes

Terms

Statuses:

Draft
Sent
Partially Paid
Paid
Overdue
Cancelled

Allow:

PDF generation
Download
Print
Share
Email later

13. QUOTATIONS

Allow users to create quotations.

Workflow:

QUOTE
↓
CUSTOMER ACCEPTS
↓
CONVERT TO INVOICE
↓
PAYMENT
↓
COMPLETED

When converting a quote to an invoice, do not duplicate information unnecessarily.

14. CUSTOMERS

Customer profiles should show:

Name
Phone
Email
Address
Total purchases
Outstanding balance
Purchase history
Invoices
Quotes

Show useful summaries.

Example:

"Sarah has purchased $4,820 from your business."

15. SUPPLIERS

Supplier profiles:

Name
Phone
Email
Products supplied
Purchase history
Outstanding amount
Last order

Add purchase records.

16. EXPENSES

Allow users to record:

Rent
Utilities
Transport
Salaries
Marketing
Supplies
Maintenance
Other

Show:

Total expenses
Expense categories
Monthly trends

17. REPORTS

Create useful reports.

Do not overwhelm users.

Reports:

Sales
Profit
Expenses
Inventory
Products
Customers
Payments

Include:

Charts
Tables
Date filters
Export

Allow CSV and PDF export where appropriate.

18. AI ASSISTANT

Create an AI Assistant section even though no AI API is required initially.

Interface:

A conversational chat panel.

Example:

User:

"How did my business perform this month?"

Assistant:

"Your sales were $18,420, up 14% from last month. Your gross profit was $5,920. Your best-selling category was groceries."

The assistant should be architected around structured application data.

DO NOT send arbitrary database credentials to an AI system.

Create a future-safe architecture where the AI receives only the minimum required business data.

Later support:

OpenAI

Ollama

Other providers

But the MVP must work without them.

For now, create a local/mock assistant demonstrating the intended experience.

19. AI ACTIONS

The future assistant should eventually support structured actions such as:

"Create an invoice for John for 5 bags of cement."

"Show me products that haven't sold in 30 days."

"Which products should I reorder?"

"Generate a sales summary."

"Create a quote for this customer."

"Write a promotion for my slow-moving products."

IMPORTANT:

AI must NEVER directly execute sensitive financial actions without confirmation.

For example:

AI:

"I've prepared an invoice for John for $450."

Buttons:

[Review Invoice]

[Cancel]

Only after explicit user confirmation should the action execute.

20. NOTIFICATIONS

Create a notification centre.

Notifications:

Low stock
Overdue invoice
Payment received
Large expense
Subscription issue
New employee
Security alert

Allow users to mark notifications as read.

21. USER ROLES

Implement:

Owner
Admin
Manager
Cashier
Accountant

Permissions must be enforced server-side.

Example:

Cashier:

Create sales

View products

View customers

Manager:

Everything cashier can do

Inventory

Reports

Suppliers

Owner:

Everything

Employees

Billing

Business settings

NEVER rely solely on frontend checks for authorization.

22. MULTI-TENANT ARCHITECTURE

This is extremely important.

BusinessOS is a SaaS application.

One business must NEVER be able to access another business's data.

Every business-owned database record should contain:

business_id

Example:

products
sales
customers
suppliers
invoices
expenses
payments
inventory_movements
notifications
audit_logs

All must be associated with the correct business.

Use Supabase PostgreSQL with Row Level Security.

Every query must be designed around tenant isolation.

23. SECURITY IS A FIRST-CLASS FEATURE

Treat security as part of the product, not something added later.

Use:

Supabase Auth
PostgreSQL
Row Level Security
Role-based authorization
Secure sessions
Server-side authorization
Input validation
Output encoding
Rate limiting
Secure HTTP headers
CSRF protection where applicable
XSS protection
SQL injection protection
Secure password handling
Email verification
Password reset
Session expiration
Audit logs
Secrets management
Encrypted connections
Secure file access
Backup strategy

NEVER expose:

Database passwords
Service role keys
Private API keys
Payment secrets
AI API keys

in frontend code.

The Supabase service-role key must never be shipped to the browser.

Use environment variables and server-side secrets.

Supabase specifically recommends enabling RLS on production tables and using appropriate policies so clients cannot access or modify other users' data.

24. SUPABASE SECURITY

Use:

Supabase Auth
Supabase PostgreSQL
Supabase Storage

Enable RLS on every business-data table.

Create policies based on the authenticated user's relationship to the business.

Do NOT create policies that simply say:

auth.uid() = user_id

when the table is business-owned.

Instead, correctly verify:

authenticated user
→ business membership
→ business_id
→ requested resource

Use a secure membership/role architecture.

Create:

businesses
business_members
roles/permissions

Use indexes on columns used heavily by RLS policies and queries.

Test RLS explicitly with:

Owner
Manager
Cashier
Unauthenticated user
User from another business

A user from Business A must receive zero access to Business B's data.

25. SECURITY TESTING

Create tests for:

Cross-tenant data access
Unauthorized invoice access
Unauthorized customer access
Unauthorized inventory changes
Privilege escalation
Invalid business IDs
Tampered requests
Expired sessions
Duplicate payments
Duplicate sales
Negative quantities
Invalid prices
Malformed input
Rate-limit abuse

Do not consider the application complete until these scenarios have been considered.

26. AUDIT LOGGING

Create immutable audit records for sensitive operations.

Track:

Who
What
When
Business
IP/device metadata where appropriate
Action result

Examples:

"John created invoice INV-1023"

"Mary changed product price from $10 to $12"

"David deleted a supplier"

"Sarah changed employee permissions"

Do not allow normal users to edit audit logs.

27. DATA VALIDATION

Validate all important input on the backend.

Never trust:

Frontend validation
URL parameters
Hidden fields
Client-side prices
Client-side roles
Client-side business IDs

Use server-side validation.

28. FINANCIAL DATA SAFETY

Money must never be stored or calculated carelessly with floating-point arithmetic.

Use appropriate fixed-precision numeric/decimal database types.

Store:

subtotal
tax
discount
total
amount_paid
balance

with appropriate precision.

Use database transactions for financial operations.

Prevent:

Negative stock unless explicitly permitted
Duplicate invoice numbers
Duplicate payments
Duplicate sale submissions

29. PAYWALL AND MONETISATION

Build a polished subscription system.

Use a provider abstraction so payment providers can be changed or added later.

Primary provider:

Stripe Billing/Checkout where available.

Stripe currently supports subscription billing, Checkout, customer portals, trials and payment recovery features.

Do NOT hard-code the application around one payment provider.

Create a billing layer.

Example:

PaymentProvider
├── StripeProvider
├── LocalProvider
└── FutureProvider

This makes it possible to add African payment providers later without rewriting the application.

30. PRICING

Use simple pricing.

FREE

$0/month

For very small businesses testing the platform.

Limits:

50 products
50 invoices/month
100 sales/month
1 user
Basic reports

No advanced AI features.

STARTER

$9/month

For small businesses.

Includes:

500 products
Unlimited sales
Unlimited invoices
Customers
Suppliers
Expenses
Reports
PDF exports
3 users
Low-stock alerts

BUSINESS

$19/month

Make this the recommended plan.

Includes everything in Starter plus:

2,500 products
10 users
Advanced reports
Business Health
AI Assistant-ready features
Advanced inventory
Profit analysis
Priority support
Custom invoice branding

Display:

"Most Popular"

PRO

$39/month

For growing businesses.

Includes:

Unlimited products
Unlimited users
Multiple locations
Advanced analytics
AI-powered features when connected
Advanced permissions
Advanced reports
Multi-branch management
API access later
Priority support

31. ANNUAL PRICING

Offer annual billing with approximately 15-20% savings.

Example:

Starter:
$90/year

Business:
$190/year

Pro:
$390/year

Clearly show:

"Save 2 months"

Do not use deceptive dark patterns.

32. FREE TRIAL

Offer a 14-day Business trial.

Do not require a credit card during the initial trial unless necessary.

At the end:

Show exactly what features will become unavailable.

Never delete user data immediately after cancellation.

Allow a reasonable read-only period.

33. PAYWALL UX

Do NOT constantly interrupt users with popups.

When a user reaches a limit:

Show a clean upgrade dialog.

Example:

"You've reached your 50 invoice limit."

"Upgrade to Starter to create unlimited invoices."

[Upgrade to Starter]

[Maybe Later]

The user should understand exactly why they're being asked to pay.

34. BILLING SECURITY

Never trust the frontend to determine whether a customer has paid.

Subscription status must be verified server-side using the payment provider.

Use webhooks for:

subscription.created
subscription.updated
subscription.deleted
payment.succeeded
payment.failed

Store:

subscription_id
customer_id
business_id
plan
status
current_period_start
current_period_end

Verify webhook signatures.

Never allow a client to simply send:

plan = "pro"

and receive Pro access.

35. LANDING PAGE

Create a beautiful marketing website.

Hero:

"Run your business. Not your spreadsheets."

Subtitle:

"Inventory, sales, invoices, expenses and intelligent business insights in one simple platform."

CTA:

Start Free

View Demo

Sections:

Problem
Solution
Features
How it works
Screenshots
Pricing
Security
FAQ
CTA

36. SECURITY MARKETING

Include a dedicated section:

Your business data belongs to you.

Explain:

Encrypted connections
Secure authentication
Business-level data isolation
Role-based permissions
Audit logs
Protected payments
Secure backups

Do not make exaggerated claims such as "100% secure."

37. ONBOARDING

After signup:

Step 1:
Business name

Step 2:
Business type

Step 3:
Currency

Step 4:
Add first products

Step 5:
Invite employees

Step 6:
Done

Show progress:

1 → 2 → 3 → 4 → 5

Do not ask for unnecessary information.

38. EMPTY STATES

Never show empty white screens.

Example:

"No products yet."

"Add your first product to start tracking inventory."

[Add Product]

Make empty states useful.

39. SEARCH

Global search should eventually allow:

Products
Customers
Invoices
Sales
Suppliers

Keyboard shortcut:

/

40. PERFORMANCE

Optimize for low-end devices and slower internet connections.

Use:

Pagination
Lazy loading
Caching
Debounced search
Optimized queries
Indexes
Compressed images
Optimistic UI where safe

Do not load thousands of products at once.

41. OFFLINE-READY DESIGN

The application should be architected with future offline capability in mind.

Especially:

Sales
Inventory lookup
Product search

Eventually support:

Offline sale
Local queue
Sync when connection returns

Be extremely careful with financial transactions and conflict resolution.

Do not falsely claim the MVP is fully offline unless it actually is.

42. DATABASE

Design a normalized PostgreSQL schema.

Core tables:

profiles
businesses
business_members
roles
products
categories
suppliers
customers
sales
sale_items
inventory_movements
purchases
purchase_items
invoices
invoice_items
quotes
quote_items
payments
expenses
notifications
audit_logs
subscriptions
subscription_events
business_settings
files

Use:

UUID primary keys
Foreign keys
Indexes
Unique constraints
Check constraints
Timestamps
Soft deletion where appropriate

Add:

created_at
updated_at

to relevant tables.

43. DATABASE INTEGRITY

Use database constraints to prevent invalid data.

Examples:

quantity > 0

price >= 0

amount >= 0

Invoice numbers unique within a business.

SKU unique within a business where appropriate.

Do not rely only on frontend validation.

44. ADMIN PANEL

Create a separate protected platform-admin dashboard.

The SaaS owner should see:

Total businesses
Active users
New businesses
Active subscriptions
MRR
Churn
Trial users
Failed payments
System health
AI usage later
Support issues

This dashboard must be completely separated from normal customer accounts.

Never expose platform-admin functionality to normal business owners.

45. UI NAVIGATION

Desktop sidebar:

Dashboard
Sales
Inventory
Invoices
Customers
Suppliers
Expenses
Reports
AI Assistant
Notifications

Bottom:

Settings
Help
Profile

Mobile:

Home
Sales
Inventory
Invoices
More

Use icons with labels.

Never rely on icons alone for important actions.

46. DESIGN DETAILS

Use:

12-16px border radius
Subtle shadows
Thin borders
Generous whitespace
Clear hierarchy
Accessible contrast

Buttons should have obvious states:

Default
Hover
Pressed
Disabled
Loading
Success
Error

Forms should clearly show:

Required fields
Validation errors
Success states

47. ACCESSIBILITY

Follow accessible design principles.

Include:

Keyboard navigation
Visible focus states
Semantic HTML
ARIA where needed
Good colour contrast
Readable text
Accessible forms
Screen-reader-friendly controls

Do not communicate important information through colour alone.

48. RESPONSIVE TABLES

Tables should work on mobile.

Do not simply make a desktop table overflow horizontally.

For mobile, convert rows into cards or provide a carefully designed responsive layout.

49. ERROR HANDLING

Never show raw technical errors to users.

Bad:

"PostgrestException: 23505"

Good:

"That invoice number already exists. Please try another number."

Log technical details securely for developers.

50. SECURITY + UX BALANCE

Security should never make the application frustrating.

For normal actions:

Make the app fast.

For dangerous actions:

Require confirmation.

Examples:

Delete product
Delete customer
Delete invoice
Change employee permissions
Cancel subscription

For extremely sensitive operations:

Require re-authentication where appropriate.

51. DESIGN LANGUAGE

The application should feel like:

Stripe's clarity
+
Square's simplicity
+
Shopify's commerce workflow
+
QuickBooks' business reporting
+
Notion's clean interface
+
Modern AI assistant UX

But create an ORIGINAL visual identity.

Do not clone any existing product.

52. WHAT MAKES BUSINESSOS DIFFERENT

The major differentiator is:

"Don't just show me my business data. Tell me what it means."

Traditional software says:

Sales:
$18,420

BusinessOS should eventually say:

"Sales increased 14% this month."

"Your top category is groceries."

"Three products account for 42% of your sales."

"You may run out of Product X in approximately 4 days."

"Two customers have overdue invoices."

"Your profit margin dropped 3% this month."

Then:

"Would you like me to explain why?"

This is the future AI layer.

53. IMPORTANT: NO AI API DEPENDENCY

The application must remain fully functional without OpenAI, Gemini, Claude, Ollama, or any other AI API.

Use:

Rules
SQL queries
Calculated metrics
Predefined insights
Mock AI responses

for the initial version.

Create an interface such as:

AIProvider

Then later:

OpenAIProvider
OllamaProvider
LocalModelProvider

can implement it.

This keeps the core application independent from AI providers.

54. SECURITY ARCHITECTURE

Use this security model:

Browser
↓
Supabase Auth
↓
Authenticated session
↓
RLS
↓
Business membership
↓
Role permissions
↓
Database records

For privileged operations:

Browser
↓
Secure backend endpoint
↓
Validate JWT
↓
Verify business membership
↓
Verify role
↓
Validate input
↓
Execute transaction
↓
Audit action

Never:

Browser
↓
Database
↓
Trust client

55. DEVELOPMENT REQUIREMENTS

Write clean, maintainable code.

Use reusable components.

Avoid giant files.

Separate:

UI
Business logic
Database access
Validation
Authentication
Authorization
Billing
Notifications

Use TypeScript where possible.

Use strict typing.

Do not use "any" unnecessarily.

56. TESTING

Create:

Unit tests
Integration tests
Authentication tests
Authorization tests
RLS tests
Billing tests
Financial transaction tests
API tests
Responsive UI tests

The most important tests should be security tests.

57. BUILD ORDER

Build in this order:

PHASE 1:
Project setup
Authentication
Business creation
Database
RLS
Roles

PHASE 2:
Products
Categories
Inventory

PHASE 3:
Customers
Suppliers
Sales

PHASE 4:
Invoices
Quotes
Payments
Expenses

PHASE 5:
Dashboard
Reports
Notifications

PHASE 6:
Subscription/paywall

PHASE 7:
AI Assistant interface

PHASE 8:
Admin dashboard

PHASE 9:
Security hardening

PHASE 10:
Performance optimization

Do not build everything simultaneously.

58. FINAL PRODUCT STANDARD

The finished product should feel like a real commercial SaaS product, not a university project or generic CRUD dashboard.

Every screen should answer:

"What does the user need to do here?"

Keep workflows short.

Keep terminology simple.

Make the most important information visible immediately.

Make the application fast.

Make security invisible during normal use but extremely strong underneath.

The application should be something a real business owner could confidently use to run their business.

59. FINAL CHECKLIST BEFORE CONSIDERING IT COMPLETE

Verify:

[ ] Authentication works
[ ] Email verification works
[ ] Password reset works
[ ] Businesses are isolated
[ ] RLS enabled on every relevant table
[ ] Roles work
[ ] Permissions work server-side
[ ] Inventory updates correctly
[ ] Sales update inventory
[ ] Invoices calculate correctly
[ ] Payments are recorded safely
[ ] Financial calculations use appropriate precision
[ ] Reports use correct data
[ ] Audit logs work
[ ] Subscription state is server-verified
[ ] Payment webhooks are verified
[ ] Secrets are never exposed
[ ] Admin panel is protected
[ ] API endpoints validate input
[ ] Rate limiting exists where appropriate
[ ] Mobile interface works
[ ] Desktop interface works
[ ] Loading states exist
[ ] Error states exist
[ ] Empty states exist
[ ] Accessibility is considered
[ ] No cross-business data leakage
[ ] No sensitive data is unnecessarily exposed
[ ] No AI API is required for the core product
[ ] Application can scale beyond the MVP

MOST IMPORTANT:

Never sacrifice security for speed of development.

This is a business application handling financial and customer information. Treat every database query, API endpoint, authentication flow, file upload, payment event, and permission check as potentially hostile input.

Build the product so that security is part of the architecture from the first database migration, not a feature added before launch.

## Development

You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

Copy `.env` and set your own Supabase project's `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_PROJECT_ID` (and the `VITE_`-prefixed equivalents for the browser bundle). Google
sign-in uses Supabase's own OAuth flow — enable the Google provider under Authentication →
Providers in your Supabase project, with `<your Supabase URL>/auth/v1/callback` as the
redirect URI in your Google Cloud OAuth client.

`npm run build` produces a plain Node server in `.output/server` — run it with
`node .output/server/index.mjs`, or deploy it to Docker, Railway, Render, Fly.io, or any
other Node host.

### Environments

There are two Supabase projects: `businessos` (production, live data) and `businessos-staging`
(safe to break). `.env` is whichever one is currently active; `.env.staging` and `.env.production`
hold the credentials for each so you can switch without hunting them down:

```sh
npm run env:staging      # point .env at staging (the default — use this day to day)
npm run env:production   # point .env at production — only when you deliberately mean to
```

Both projects run the same migrations in `supabase/migrations/`. When you add a new one, apply
it to staging first, verify it, then apply it to production the same way.

### Deploying

Render's free tier only gives one service, so there's no separate staging *deployment* — the
single Render service (`businessos-ai` in `render.yaml`) is production, always. "Staging" is
just the second Supabase project, tested by pointing your local `npm run dev` at it
(`npm run env:staging`). Paying for a second Render service would give you a real staging
deployment if that gap ever matters enough to justify the cost.

Given that, treat this as the actual promotion gate before pushing to `main` (which Render
auto-deploys from):

1. `.env` points at staging (`npm run env:staging`) while you build and test locally.
2. New migration? Applied to staging and verified there first (see above).
3. `.github/workflows/ci.yml` passes on the push — it runs the same tsc/lint/test/build checks
   you'd otherwise have to remember to run by hand. Don't push to `main` with it red.
4. Only then apply the migration to production and push — Render deploys whatever's on `main`
   automatically.
