import { describe, expect, it } from "vitest";
import { parseInvoiceDraftSuggestion } from "@/lib/invoice-copilot.contract";

const validSuggestion = {
  customerId: "a8b6332b-5f75-47e0-bdc6-2e627cd035e9",
  items: [{ productId: "204a13d4-a9b7-47ed-8d1d-39187c2ea302", quantity: 3 }],
  dueDays: 14,
  notes: "",
  terms: "Payment due within 14 days.",
  rationale: "The request named an existing customer and catalogue item.",
};

describe("AI invoice draft proposal validation", () => {
  it("parses JSON and fenced JSON proposals", () => {
    expect(parseInvoiceDraftSuggestion(JSON.stringify(validSuggestion))).toEqual(validSuggestion);
    expect(
      parseInvoiceDraftSuggestion(`\`\`\`json\n${JSON.stringify(validSuggestion)}\n\`\`\``),
    ).toEqual(validSuggestion);
  });

  it("rejects invented fields, invalid IDs, and empty item lists", () => {
    expect(() =>
      parseInvoiceDraftSuggestion(JSON.stringify({ ...validSuggestion, paid: true })),
    ).toThrow();
    expect(() =>
      parseInvoiceDraftSuggestion(
        JSON.stringify({ ...validSuggestion, items: [{ productId: "made-up", quantity: 1 }] }),
      ),
    ).toThrow();
    expect(() =>
      parseInvoiceDraftSuggestion(JSON.stringify({ ...validSuggestion, items: [] })),
    ).toThrow();
  });
});
