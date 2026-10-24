#!/usr/bin/env node
/**
 * Reports which staging schema objects exist for master-checklist verification.
 * Exit 0 when all checks pass; exit 1 when any fail or token missing.
 */
import { STAGING_READINESS_CHECKS } from "./staging-manifest.mjs";
import { getAccessToken, runStagingSql } from "./staging-api.mjs";

const token = getAccessToken();
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN is not set — cannot check staging.");
  console.error("Add it to GitHub Actions secrets or local .env, then re-run.");
  process.exit(1);
}

let failed = 0;
console.log("Kwetuu staging readiness (slajanbsfqjnuuiohbmg)\n");

for (const check of STAGING_READINESS_CHECKS) {
  try {
    const rows = await runStagingSql(check.sql, token);
    const ok = rows[0]?.ok === true || rows[0]?.ok === "t";
    const mark = ok ? "OK" : "MISSING";
    console.log(`[${mark}] ${check.label} (${check.id})`);
    if (!ok) failed += 1;
  } catch (error) {
    console.log(`[ERROR] ${check.label} (${check.id})`);
    console.error(`  ${error instanceof Error ? error.message : error}`);
    failed += 1;
  }
}

console.log("");
if (failed === 0) {
  console.log("All readiness checks passed. Run: npm run verify:staging");
  process.exit(0);
}
console.log(`${failed} check(s) failed. Run: node scripts/apply-staging-sql.mjs`);
process.exit(1);
