#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const outPath = path.join(repoRoot, "android", "version.properties");

const versionName = (process.argv[2] ?? "1.0.0").trim();
const versionCodeRaw = process.argv[3]?.trim();
const versionCode =
  versionCodeRaw && /^\d+$/.test(versionCodeRaw)
    ? versionCodeRaw
    : String(Math.max(1, Math.floor(Date.now() / 1000 / 60) % 2_100_000_000));

const body = `VERSION_NAME=${versionName}\nVERSION_CODE=${versionCode}\n`;
fs.writeFileSync(outPath, body, "utf8");
console.log(`Wrote ${outPath}: ${versionName} (${versionCode})`);
