/** Decide whether a request may proceed after a rate-limit check. */
export function rateLimitAllows(input: {
  rpcError: boolean;
  allowed: boolean;
  onRpcError: "allow" | "deny";
}): boolean {
  if (input.rpcError) return input.onRpcError === "allow";
  return input.allowed;
}
