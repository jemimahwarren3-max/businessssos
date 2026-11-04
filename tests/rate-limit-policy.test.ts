import { describe, expect, it } from "vitest";
import { rateLimitAllows } from "@/lib/rate-limit-policy";

describe("rateLimitAllows", () => {
  it("denies sign-in and spend when the limiter RPC is down", () => {
    expect(rateLimitAllows({ rpcError: true, allowed: false, onRpcError: "deny" })).toBe(false);
  });

  it("lets a signed-in shop load continue when the limiter RPC is down", () => {
    expect(rateLimitAllows({ rpcError: true, allowed: false, onRpcError: "allow" })).toBe(true);
  });

  it("still blocks a caller who is actually over the limit", () => {
    expect(rateLimitAllows({ rpcError: false, allowed: false, onRpcError: "allow" })).toBe(false);
    expect(rateLimitAllows({ rpcError: false, allowed: true, onRpcError: "deny" })).toBe(true);
  });
});
