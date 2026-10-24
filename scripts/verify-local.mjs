#!/usr/bin/env node
/**
 * Local verification gate (no staging credentials required).
 */
import { spawnSync } from "node:child_process";

const steps = [
  ["Type-check", "npx", ["tsc", "--noEmit"]],
  ["Lint", "npm", ["run", "lint"]],
  ["Unit + skipped integration tests", "npm", ["run", "test"]],
  ["Production build", "npm", ["run", "build"]],
];

let failed = 0;
for (const [label, cmd, args] of steps) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      APP_URL: process.env.APP_URL || "http://localhost:8080",
    },
  });
  if (result.status !== 0) {
    failed += 1;
    console.error(`\nFailed: ${label}`);
  }
}

if (failed > 0) {
  console.error(`\nverify:local finished with ${failed} failure(s).`);
  process.exit(1);
}
console.log("\nverify:local passed.");
