#!/usr/bin/env node
/**
 * Applies selected SQL to STAGING only (slajanbsfqjnuuiohbmg).
 * Never points at production maidxfntfpnkcqnuhozo.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STAGING_MIGRATION_MANIFEST } from "./staging-manifest.mjs";
import {
  STAGING_PROJECT_REF,
  getAccessToken,
  getStagingRef,
  runStagingSql,
} from "./staging-api.mjs";

const token = getAccessToken();
getStagingRef();

if (!token) {
  console.log("SUPABASE_ACCESS_TOKEN is empty — skipping staging SQL.");
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function shouldSkip(entry) {
  if (!entry.skipIf) return false;
  const rows = await runStagingSql(entry.skipIf, token);
  return rows[0]?.skip === true || rows[0]?.skip === "t";
}

async function enableEmail() {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${STAGING_PROJECT_REF}/config/auth`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_email_enabled: true,
        mailer_autoconfirm: true,
      }),
    },
  );
  const body = await res.text();
  if (!res.ok) {
    console.error(`Email provider PATCH ${res.status}: ${body.slice(0, 1500)}`);
    return false;
  }
  console.log("Staging Email provider enabled (autoconfirm on for beta).");
  return true;
}

for (const entry of STAGING_MIGRATION_MANIFEST) {
  const name = entry.file;
  if (await shouldSkip(entry)) {
    console.log(`Skipping ${name} (already applied).`);
    continue;
  }
  const query = await readFile(join(root, "supabase/migrations", name), "utf8");
  console.log(`Applying ${name} to staging ${STAGING_PROJECT_REF}…`);
  await runStagingSql(query, token);
  console.log(`Applied ${name}.`);
}

await enableEmail();
console.log("Staging SQL finished. Production was not touched.");
