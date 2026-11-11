import { describe, expect, it } from "vitest";
import { quickEntrySchema } from "../src/lib/business.schemas";
import {
  extractJson,
  isRawDraft,
  quickEntryPurchaseFailureReason,
  quickEntrySaleFailureReason,
  quickEntrySaleIsStockOk,
  resolveCustomer,
  resolveExpense,
  type QuickEntrySaleDraft,
} from "../src/lib/quick-entry.server";

describe("quickEntrySchema", () => {
  it("allows file-sized notes for Quick Add", () => {
    const text = "a".repeat(12_000);
    const parsed = quickEntrySchema.parse({
      businessId: "00000000-0000-4000-8000-000000000001",
      text,
    });
    expect(parsed.text.length).toBe(12_000);
  });
});

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
    expect(isRawDraft({ type: "sale_batch" })).toBe(true);
    expect(isRawDraft({ type: "purchase_batch" })).toBe(true);
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

describe("quickEntrySaleFailureReason", () => {
  const base: QuickEntrySaleDraft = {
    type: "sale",
    items: [],
    customerId: "",
    customerName: "Mary",
    customerPhone: "",
    paymentMethod: "cash",
    saleDate: "",
  };

  it("explains stock shortage with quantities", () => {
    const reason = quickEntrySaleFailureReason({
      ...base,
      items: [
        {
          name: "Shirt",
          quantity: 6,
          productId: "p1",
          unitPrice: 10,
          taxRate: 0,
          availableStock: 2,
          stockOk: false,
        },
      ],
    });
    expect(reason).toMatch(/only 2 in stock/i);
  });
});

describe("quickEntrySaleIsStockOk", () => {
  const base: QuickEntrySaleDraft = {
    type: "sale",
    items: [],
    customerId: "",
    customerName: "",
    customerPhone: "",
    paymentMethod: "cash",
    saleDate: "",
  };

  it("requires every line to have enough stock", () => {
    const ok = quickEntrySaleIsStockOk({
      ...base,
      items: [
        {
          name: "Shirt",
          quantity: 2,
          productId: "p1",
          unitPrice: 10,
          taxRate: 0,
          availableStock: 5,
          stockOk: true,
        },
      ],
    });
    expect(ok).toBe(true);
    const bad = quickEntrySaleIsStockOk({
      ...base,
      items: [
        {
          name: "Shirt",
          quantity: 6,
          productId: "p1",
          unitPrice: 10,
          taxRate: 0,
          availableStock: 5,
          stockOk: false,
        },
      ],
    });
    expect(bad).toBe(false);
  });
});

describe("quickEntryPurchaseFailureReason", () => {
  it("allows unmatched names when a label is present", () => {
    expect(
      quickEntryPurchaseFailureReason({
        productName: "Orange drink",
        productId: "",
        quantity: 5,
      }),
    ).toBeNull();
  });

  it("requires a label or match", () => {
    expect(
      quickEntryPurchaseFailureReason({ productName: "  ", productId: "", quantity: 2 }),
    ).toMatch(/name what you received/i);
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
