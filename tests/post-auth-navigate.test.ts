import { describe, expect, it, vi } from "vitest";
import { navigateAfterAuth } from "@/lib/auth/post-auth-navigate";

describe("navigateAfterAuth", () => {
  it("assigns a path starting with slash", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    navigateAfterAuth("/onboarding");
    expect(assign).toHaveBeenCalledWith("/onboarding");
    vi.unstubAllGlobals();
  });
});
