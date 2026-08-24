import { describe, expect, it } from "vitest";
import {
  extractJson,
  isRawDraft,
  resolveCustomer,
  resolveExpense,
} from "../src/lib/quick-entry.server";

describe("extractJson", () => {
  it("passes through a clean JSON object unchanged", () => {
    expect(extractJson('{"type":"unknown"}')).toBe('{"type":"unknown"}');
  });

  it("strips a markdown code fence around the JSON", () => {
    expect(extractJson('```json\n{"type":"expense","amount":45}\n```')).toBe(
      '{"type":"expense","amount":45}',
    );
  });

  it("strips a leading sentence before the JSON", () => {
    expect(extractJson('Here you go: {"type":"customer","name":"John"}')).toBe(
      '{"type":"customer","name":"John"}',
    );
  });
});

describe("isRawDraft", () => {
  it("accepts each known type discriminator", () => {
    expect(isRawDraft({ type: "sale" })).toBe(true);
    expect(isRawDraft({ type: "expense" })).toBe(true);
    expect(isRawDraft({ type: "customer" })).toBe(true);
    expect(isRawDraft({ type: "unknown" })).toBe(true);
  });

  it("rejects malformed or unrecognized shapes", () => {
    expect(isRawDraft(null)).toBe(false);
    expect(isRawDraft(undefined)).toBe(false);
    expect(isRawDraft("sale")).toBe(false);
    expect(isRawDraft({ type: "invoice" })).toBe(false);
    expect(isRawDraft({})).toBe(false);
  });
});

describe("resolveExpense", () => {
  it("keeps a valid amount and recognized category", () => {
    const draft = resolveExpense({
      type: "expense",
      amount: 45,
      category: "transport",
      description: "Bus fare",
      vendor: "",
    });
    expect(draft).toEqual({
      type: "expense",
      amount: 45,
      category: "transport",
      description: "Bus fare",
      vendor: "",
    });
  });

  it("falls back to the 'other' category when the parsed category isn't recognized", () => {
    const draft = resolveExpense({ type: "expense", amount: 20, category: "groceries" });
    expect(draft).toMatchObject({ type: "expense", category: "other" });
  });

  it("falls back to the 'other' category when none was parsed", () => {
    const draft = resolveExpense({ type: "expense", amount: 20 });
    expect(draft).toMatchObject({ type: "expense", category: "other" });
  });

  it("returns unknown when no positive amount was parsed", () => {
    expect(resolveExpense({ type: "expense" })).toEqual({ type: "unknown" });
    expect(resolveExpense({ type: "expense", amount: 0 })).toEqual({ type: "unknown" });
    expect(resolveExpense({ type: "expense", amount: -5 })).toEqual({ type: "unknown" });
    expect(resolveExpense({ type: "expense", amount: "not a number" })).toEqual({
      type: "unknown",
    });
  });
});

describe("resolveCustomer", () => {
  it("keeps a valid name with optional contact details", () => {
    const draft = resolveCustomer({
      type: "customer",
      name: "John",
      phone: "0771234567",
      email: "",
    });
    expect(draft).toEqual({ type: "customer", name: "John", phone: "0771234567", email: "" });
  });

  it("returns unknown when no name was parsed", () => {
    expect(resolveCustomer({ type: "customer" })).toEqual({ type: "unknown" });
    expect(resolveCustomer({ type: "customer", name: "   " })).toEqual({ type: "unknown" });
  });
});
