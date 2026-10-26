import { z } from "zod";

export const invoiceDraftSuggestionSchema = z
  .object({
    customerId: z.string().uuid().nullable(),
    items: z
      .array(
        z
          .object({
            productId: z.string().uuid(),
            quantity: z.number().positive().max(99999999),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    dueDays: z.number().int().min(0).max(90).nullable(),
    notes: z.string().max(600),
    terms: z.string().max(600),
    rationale: z.string().min(1).max(240),
  })
  .strict();

export type InvoiceDraftSuggestion = z.infer<typeof invoiceDraftSuggestionSchema>;

export function parseInvoiceDraftSuggestion(response: string): InvoiceDraftSuggestion {
  const json = response
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return invoiceDraftSuggestionSchema.parse(JSON.parse(json));
}
