import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGAL_VERSIONS } from "@/lib/legal-versions";
import { createComplaintSchema } from "@/lib/storefront/contract";

const privacy = readFileSync(new URL("../legal/PRIVACY_POLICY.md", import.meta.url), "utf8");
const terms = readFileSync(new URL("../legal/TERMS_OF_SERVICE.md", import.meta.url), "utf8");

describe("platform legal drafts", () => {
  it("keeps sign-up version stamps aligned with the published drafts", () => {
    expect(LEGAL_VERSIONS.privacy).toBe("2026-10-19");
    expect(LEGAL_VERSIONS.terms).toBe("2026-10-19");
    expect(privacy).toContain("Document version:** 2026-10-19");
    expect(terms).toContain("Document version:** 2026-10-19");
    expect(privacy).toContain("[INSERT FULL LEGAL NAME]");
    expect(terms).toContain("[INSERT ACCURATE LEGAL STATUS]");
    expect(privacy.toLowerCase()).not.toContain("customer paynow checkout");
  });

  it("requires a real complaint message and contact details", () => {
    const bad = createComplaintSchema.safeParse({
      slug: "harare-cloth",
      message: "hi",
      customer: { name: "A", phone: "12" },
    });
    expect(bad.success).toBe(false);
    const ok = createComplaintSchema.parse({
      slug: "harare-cloth",
      message: "The order never arrived and nobody answered the phone.",
      customer: { name: "Ada Moyo", phone: "+263771234567" },
    });
    expect(ok.slug).toBe("harare-cloth");
  });
});
