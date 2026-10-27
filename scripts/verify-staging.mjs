#!/usr/bin/env node
/**
 * Full staging verification: apply pending migrations, readiness, integration tests.
 */
import { spawnSync } from "node:child_process";
import { getAccessToken } from "./staging-api.mjs";

const token = getAccessToken();
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is required for verify:staging.");
  console.error("Create a token at https://supabase.com/dashboard/account/tokens");
  console.error("Add it to GitHub repository secrets and/or local .env.");
  process.exit(1);
}

function run(label, cmd, args, extraEnv = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token, ...extraEnv },
  });
  if (result.status !== 0) {
    console.error(`\nFailed: ${label}`);
    process.exit(result.status ?? 1);
  }
}

run("Apply staging SQL", "node", ["scripts/apply-staging-sql.mjs"]);
run("Staging readiness", "node", ["scripts/staging-readiness-check.mjs"]);
run("Integration + unit tests", "npm", ["run", "test"]);
console.log("\nverify:staging passed.");
