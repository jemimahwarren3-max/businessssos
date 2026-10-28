import { z } from "zod";

const CONTROL_CHARS = new RegExp(
  "[" + String.fromCharCode(0) + "-" + String.fromCharCode(31) + String.fromCharCode(127) + "]",
  "g",
);
const SCRIPT_TAG = new RegExp("<script\\b[^<]*(?:(?!<\\/script>)<[^<]*)*<\\/script>", "gi");
const HTML_TAG = /<[^>]*>/g;
const JS_PROTOCOL = /javascript:/gi;
const EVENT_HANDLER = /on\w+=/gi;

function sanitizeString(value: string): string {
  return value
    .replace(SCRIPT_TAG, "")
    .replace(HTML_TAG, "")
    .replace(JS_PROTOCOL, "")
    .replace(EVENT_HANDLER, "")
    .replace(CONTROL_CHARS, "")
    .trim()
    .slice(0, 10000);
}

export function sanitizeInput<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeInput(item)) as T;
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      output[key] = sanitizeInput(child);
    }
    return output as T;
  }

  return value;
}

/** Unwrap `{ data: payload }` when middleware already peeled one layer but
 *  the client payload was double-wrapped. Leave real business payloads alone. */
export function coalesceServerFnData(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  if ("name" in record && ("businessType" in record || "currency" in record)) {
    return data;
  }
  if ("data" in record) {
    const inner = record["data"];
    if (inner && typeof inner === "object") return inner;
  }
  return data;
}

// Constraining on the schema type itself (not just its output) and
// extracting via z.infer is required here — a bare `z.ZodType<T>` parameter
// infers T from the wrong generic slot against schemas using `.default()`,
// silently widening defaulted fields back to optional (confirmed via
// isolated repro: identical schema, `.parse()` directly gives the correct
// required-with-default type; through the old signature it didn't).
export function parseAndSanitize<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(sanitizeInput(coalesceServerFnData(data)));
  if (!result.success) {
    const message = result.error.errors[0]?.message ?? "Invalid input.";
    throw new Error(message);
  }
  return result.data;
}
