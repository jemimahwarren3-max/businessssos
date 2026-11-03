import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ShopNotLive } from "@/components/storefront/shop-not-live";
import { BRAND } from "@/lib/brand";
import { decideStorePage } from "@/lib/storefront/store-page";

describe("unpublished shop pages", () => {
  it("shows the not-live page for a failed draft preview instead of merchant onboarding", () => {
    expect(decideStorePage({ preview: true, storeFound: false, previewFailed: true })).toEqual({
      kind: "unpublished",
    });
    expect(decideStorePage({ preview: true, storeFound: false })).toEqual({ kind: "unpublished" });
  });

  it("treats a missing public shop as unpublished, not gone", () => {
    expect(decideStorePage({ preview: false, storeFound: false })).toEqual({ kind: "unpublished" });
  });

  it("keeps a found public or preview shop on the storefront", () => {
    expect(decideStorePage({ preview: false, storeFound: true })).toEqual({
      kind: "ok",
      preview: false,
    });
    expect(decideStorePage({ preview: true, storeFound: true })).toEqual({
      kind: "ok",
      preview: true,
    });
  });

  it("does not send merchants to relative / which 404s again on a shop host", () => {
    const html = renderToStaticMarkup(createElement(ShopNotLive));
    expect(html).toContain("This shop isn");
    expect(html).toContain("nothing was deleted");
    expect(html).toContain('href="/onboarding"');
    expect(html).toContain(`href="${BRAND.appUrl}"`);
    expect(html).not.toMatch(/href="\/"/);
  });
});
