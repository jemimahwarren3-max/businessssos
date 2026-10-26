#!/usr/bin/env node
/**
 * One-shot: enable email + autoconfirm, and configure Resend SMTP when keys are present.
 *
 *   SUPABASE_ACCESS_TOKEN=... RESEND_API_KEY=re_... NOTIFY_FROM_EMAIL="Kwetuu <noreply@mykwetuu.com>" \\
 *     node scripts/configure-staging-auth-smtp.mjs
 */
import { getAccessToken } from "./staging-api.mjs";
import {
  configureStagingResendSmtp,
  enableStagingEmailAutoconfirm,
  summarizeStagingAuthEmail,
} from "./staging-auth-config.mjs";

const token = getAccessToken();
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is required.");
  process.exit(1);
}

await enableStagingEmailAutoconfirm(token);
await configureStagingResendSmtp(token);

const summary = await summarizeStagingAuthEmail(token);
console.log("\nCurrent staging auth email settings:");
console.log(JSON.stringify(summary, null, 2));
