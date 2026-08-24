import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests hit the real (staging) Supabase project over the
// network via the Management API — see tests/integration/helpers.ts for
// why that's hardcoded rather than reading from whatever .env currently
// points at. Longer default timeouts than vitest's usual unit-test defaults
// since every test involves at least one real HTTP round trip.
export default defineConfig({
  // Mirrors the "@" alias from vite.config.ts — kept as a separate minimal
  // config rather than merging with it, since vite.config.ts's plugins
  // (tanstackStart, nitro, VitePWA) do build-time codegen that has no
  // business running under vitest. Only needed once a test imports real
  // src/lib code that itself uses "@/..." imports (tests/insights-math.test.ts
  // is the first — earlier tests only imported tests/integration/helpers.ts,
  // which has none).
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Every sql()/asUser() call is a real HTTP round trip to the Supabase
    // Management API, which rate-limits itself — running test *files* in
    // parallel (vitest's default) was fine with a handful of small suites,
    // but adding tenant-isolation.test.ts (dozens of round trips) pushed
    // concurrent file execution over that limit and made the suite flaky
    // (ThrottlerException, not a real test failure). Sequential file
    // execution costs wall-clock time, not correctness.
    fileParallelism: false,
  },
});
