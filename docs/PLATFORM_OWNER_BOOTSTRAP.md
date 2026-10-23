# Platform owner bootstrap

The initial owner account is created through Supabase Auth, not public
registration. Do not set or share a fixed password.

## Initial setup

1. Apply `supabase/migrations/20261023130000_platform_owner_foundation.sql`
   to **staging first**. The staging SQL workflow includes this migration.
   Do not use production until staging verification and explicit production
   approval.
2. In Supabase Dashboard, invite the owner at the intended email address
   (`jemimahwarren3@gmail.com`). The invite must be accepted and its email
   confirmed before the bootstrap function will grant privileges.
3. In the SQL Editor for the same project, run:

   ```sql
   select public.bootstrap_platform_owner('jemimahwarren3@gmail.com');
   ```

   The function succeeds only once, only for an email-confirmed Auth user,
   and creates the `super_admin` role and separate
   `owner_subscription_bypass` entitlement together. It does not create or
   change a subscription or payment. It is not executable by `anon` or
   `authenticated` users.

4. Sign in using the invited account and open `/admin`. The existing admin
   route requires authenticator MFA enrollment and an `aal2` session before
   showing platform data or accepting admin actions.
5. Verify the Auth account has MFA enabled and keep recovery codes in a
   secure password manager. Do not put them in repository files, GitHub
   Actions, or application environment variables.

While no database owner has been bootstrapped, the existing
`PLATFORM_ADMIN_USER_ID` configuration remains a temporary compatibility
path. After the first owner is provisioned, the database-backed
`super_admin` role is authoritative and the legacy environment identity no
longer grants `/admin` access.

## Entitlement behavior

The owner bypass is checked independently from subscriptions and payments.
An owner can pass subscription write gates even if a subscription is missing,
expired, or past due; the subscription row and payment history remain
unchanged. No payment is marked paid and no billing event is fabricated.

## Current scope and limitations

This foundation does not yet implement owner transfer, staff-role
administration, user/store/order management, support tickets, test-mode
controls, or the expanded operational dashboard. Keep those workflows
unavailable until they have explicit server-side permissions, audit logging,
and tests.

The staging integration tests require `SUPABASE_ACCESS_TOKEN`. The migration
and owner bootstrap must be verified in staging before production use.
