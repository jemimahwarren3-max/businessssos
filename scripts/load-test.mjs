// Basic load test against public routes — no autocannon dependency to
// install, just `node scripts/load-test.mjs [url]`.
//
// Usage:
//   node scripts/load-test.mjs                          # localhost:8080
//   node scripts/load-test.mjs https://businessssos.onrender.com
//
// Covers unauthenticated routes only (landing, sign-in page, health check).
// Testing authenticated routes under load would need a real session
// cookie — out of scope for a quick capacity check, but doable later by
// signing in first and passing that cookie to autocannon's `headers`
// option if it's ever needed.
import { execSync } from "node:child_process";

const base = process.argv[2] ?? "http://localhost:8080";
if (!/^https?:\/\/[a-zA-Z0-9.\-:]+$/.test(base)) {
  console.error(`Refusing to run — "${base}" doesn't look like a plain http(s) origin.`);
  process.exit(1);
}
const routes = ["/", "/auth?mode=signin", "/health"];

for (const route of routes) {
  const url = `${base}${route}`;
  console.log(`\n=== ${url} ===`);
  execSync(`npx --yes autocannon -c 20 -d 15 "${url}"`, { stdio: "inherit" });
}
