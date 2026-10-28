import { describe, expect, it } from "vitest";
import { toCrossJSONAsync, toCrossJSONStream } from "seroval";
import { defaultSerovalDeserializerPlugins } from "@tanstack/router-core/ssr/server";
import { createBusinessSchema } from "@/lib/business.schemas";
import { notFound } from "@tanstack/react-router";
import { z } from "zod";

const plugins = defaultSerovalDeserializerPlugins;

describe("server fn result serialization", () => {
  it("serializes a successful createBusiness payload", async () => {
    const payload = {
      result: "550e8400-e29b-41d4-a716-446655440000",
      error: undefined,
      context: {},
    };
    await expect(toCrossJSONAsync(payload, { refs: new Map(), plugins })).resolves.toBeDefined();
  });

  it("stream-serializes a ZodError in the error slot (middleware failure path)", () => {
    let zodErr: z.ZodError | undefined;
    try {
      createBusinessSchema.parse({ name: "x" });
    } catch (error) {
      zodErr = error as z.ZodError;
    }
    const payload = { result: undefined, error: zodErr, context: {} };
    const failures: Error[] = [];
    const dispose = toCrossJSONStream(payload, {
      refs: new Map(),
      plugins: [...plugins],
      onParse() {},
      onDone() {},
      onError: (error) => failures.push(error instanceof Error ? error : new Error(String(error))),
    });
    dispose();
    expect(failures).toHaveLength(0);
  });

  it("stream serialization surfaces zod internals as a hard failure (not silent)", () => {
    const payload = { result: createBusinessSchema, error: undefined, context: {} };
    const failures: Error[] = [];
    const dispose = toCrossJSONStream(payload, {
      refs: new Map(),
      plugins: [...plugins],
      onParse() {},
      onDone() {},
      onError: (error) => failures.push(error instanceof Error ? error : new Error(String(error))),
    });
    dispose();
    expect(failures.length).toBeGreaterThan(0);
  });

  it("serializes notFound-shaped middleware errors", async () => {
    const payload = { result: undefined, error: notFound(), context: {} };
    await expect(toCrossJSONAsync(payload, { refs: new Map(), plugins })).resolves.toBeDefined();
  });

  it("serializes middleware error objects without tuple rest failures", async () => {
    let zodErr: z.ZodError | undefined;
    try {
      createBusinessSchema.parse({ name: "x" });
    } catch (error) {
      zodErr = error as z.ZodError;
    }
    expect(zodErr).toBeDefined();

    const payload = { result: undefined, error: zodErr, context: {} };
    await expect(toCrossJSONAsync(payload, { refs: new Map(), plugins })).resolves.toBeDefined();
  });
});
