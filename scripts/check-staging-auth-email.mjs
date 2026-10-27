#!/usr/bin/env node
/**
 * Print staging GoTrue email/OAuth-related settings (no secrets).
 *
 *   SUPABASE_ACCESS_TOKEN=... node scripts/check-staging-auth-email.mjs
 */
import { getAccessToken } from "./staging-api.mjs";
import { summarizeStagingAuthEmail } from "./staging-auth-config.mjs";

const token = getAccessToken();
if (!token) {
  console.error("Set SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens).");
  process.exit(1);
}

const summary = await summarizeStagingAuthEmail(token);
console.log("Staging auth email summary (businessos-staging / slajanbsfqjnuuiohbmg)\n");
console.log(JSON.stringify(summary, null, 2));
console.log("");

if (!summary.external_email_enabled) {
  console.warn("Email sign-in is OFF in GoTrue — enable Authentication → Email or run staging:apply.");
}
if (!summary.mailer_autoconfirm && !summary.smtpConfigured) {
  console.warn(
    "No custom SMTP and autoconfirm is off — confirmation emails only reach Supabase org team addresses.",
  );
  console.warn("Fix: docs/auth/SUPABASE_AUTH_EMAIL.md (Resend SMTP or enable autoconfirm).");
}
if (summary.site_url && !String(summary.site_url).startsWith("https://")) {
  console.warn("Site URL should be https://mykwetuu.com (not http) for production cookies and links.");
}
