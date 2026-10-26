import { afterEach, describe, expect, it } from "vitest";
import { getKwetuuPlatform, isNativeShell, resetKwetuuPlatformCacheForTests } from "@/lib/platform";

afterEach(() => {
  resetKwetuuPlatformCacheForTests();
});

describe("platform detection", () => {
  it("defaults to web in Vitest", () => {
    expect(getKwetuuPlatform()).toBe("web");
    expect(isNativeShell()).toBe(false);
  });
});
