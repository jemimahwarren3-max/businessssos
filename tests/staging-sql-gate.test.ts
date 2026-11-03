import { describe, expect, it } from "vitest";
// @ts-expect-error staging-api.mjs is plain Node ESM
import { missingStagingTokenAction, requireStagingSqlEnabled } from "../scripts/staging-api.mjs";

describe("requireStagingSqlEnabled", () => {
  it("treats GitHub boolean true as required", () => {
    expect(requireStagingSqlEnabled("true")).toBe(true);
    expect(requireStagingSqlEnabled("TRUE")).toBe(true);
    expect(requireStagingSqlEnabled("1")).toBe(true);
  });

  it("leaves PRs without the flag optional", () => {
    expect(requireStagingSqlEnabled("false")).toBe(false);
    expect(requireStagingSqlEnabled("")).toBe(false);
    expect(requireStagingSqlEnabled(undefined)).toBe(false);
  });
});

describe("missingStagingTokenAction", () => {
  it("applies SQL when a token is present", () => {
    expect(missingStagingTokenAction("secret", "true")).toBe("apply");
    expect(missingStagingTokenAction("secret", "false")).toBe("apply");
  });

  it("fails a master run that would skip schema apply", () => {
    expect(missingStagingTokenAction("", "true")).toBe("fail");
    expect(missingStagingTokenAction(null, "true")).toBe("fail");
  });

  it("skips on PRs and forks with no token", () => {
    expect(missingStagingTokenAction("", "false")).toBe("skip");
    expect(missingStagingTokenAction(null, undefined)).toBe("skip");
  });
});
