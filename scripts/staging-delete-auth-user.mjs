#!/usr/bin/env node
/**
 * Delete one staging Auth user (+ Kwetuu data) via Management API SQL.
 * Requires: SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)
 *
 *   node scripts/staging-delete-auth-user.mjs --list
 *   node scripts/staging-delete-auth-user.mjs --email you@example.com
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runStagingSql, getAccessToken, STAGING_PROJECT_REF } from "./staging-api.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function usage() {
  console.error(`Usage:
  node scripts/staging-delete-auth-user.mjs --list
  node scripts/staging-delete-auth-user.mjs --email ADDRESS

Staging project: ${STAGING_PROJECT_REF}
Set SUPABASE_ACCESS_TOKEN in the environment.`);
  process.exit(1);
}

const args = process.argv.slice(2);
const list = args.includes("--list");
const emailIdx = args.indexOf("--email");
const email = emailIdx >= 0 ? args[emailIdx + 1] : null;

if (!list && !email) usage();

const token = getAccessToken();
if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN.");
  usage();
}

if (list) {
  const rows = await runStagingSql(
    `select id, email, created_at::text as created_at from auth.users order by created_at desc limit 100`,
    token,
  );
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

let sql = readFileSync(join(__dirname, "staging-delete-auth-user.sql"), "utf8");
if (!email || !email.includes("@")) {
  console.error("Provide a valid --email");
  process.exit(1);
}
sql = sql.replace("REPLACE_ME@example.com", email.replace(/'/g, "''"));

console.log(`Deleting staging user ${email}…`);
await runStagingSql(sql, token);
console.log("Done. Refresh Supabase Authentication → Users.");
