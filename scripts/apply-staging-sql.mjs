#!/usr/bin/env node
/**
 * Applies selected SQL to STAGING only (slajanbsfqjnuuiohbmg).
 * Never points at production maidxfntfpnkcqnuhozo.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STAGING = "slajanbsfqjnuuiohbmg";
const PRODUCTION = "maidxfntfpnkcqnuhozo";
const FILES = [
  "20261022120000_fix_store_order_notification_currency_precedence.sql",
  "20261022130000_allow_storefront_audit_actions.sql",
  "20261022140000_store_review_responses.sql",
];

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const ref = process.env.STAGING_SUPABASE_PROJECT_ID?.trim() || STAGING;

if (ref === PRODUCTION) {
  console.error("Refusing to run against production.");
  process.exit(2);
}
if (ref !== STAGING) {
  console.error(`Refusing unknown project ref ${ref}. Expected ${STAGING}.`);
  process.exit(2);
}
if (!token) {
  console.log("SUPABASE_ACCESS_TOKEN is empty — skipping staging SQL.");
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${STAGING}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`SQL ${res.status}: ${body.slice(0, 2000)}`);
  }
  return body;
}

async function enableEmail() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${STAGING}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_email_enabled: true,
      mailer_autoconfirm: true,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`Email provider PATCH ${res.status}: ${body.slice(0, 1500)}`);
    return false;
  }
  console.log("Staging Email provider enabled (autoconfirm on for beta).");
  return true;
}

for (const name of FILES) {
  const query = await readFile(join(root, "supabase/migrations", name), "utf8");
  console.log(`Applying ${name} to staging ${STAGING}…`);
  await sql(query);
  console.log(`Applied ${name}.`);
}

await enableEmail();
console.log("Staging SQL finished. Production was not touched.");
