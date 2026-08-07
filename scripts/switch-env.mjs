// Copies .env.<target> over .env so `npm run dev` / `npm run build` point at
// that environment. Node/fs-based so it works identically on Windows and
// Unix — no shell-specific `cp` vs `copy` issues.
import { copyFileSync, existsSync } from "node:fs";

const target = process.argv[2];
if (target !== "staging" && target !== "production") {
  console.error("Usage: node scripts/switch-env.mjs <staging|production>");
  process.exit(1);
}

const source = `.env.${target}`;
if (!existsSync(source)) {
  console.error(`${source} not found.`);
  process.exit(1);
}

copyFileSync(source, ".env");
console.log(`.env now points at ${target} (copied from ${source}).`);
