import { describe, expect, it } from "vitest";
import { resolvePostAuthPath } from "@/lib/auth/oauth-callback.server";

describe("resolvePostAuthPath", () => {
  it("returns /auth when there is no sealed session", async () => {
    await expect(resolvePostAuthPath()).resolves.toBe("/auth");
  });
});
