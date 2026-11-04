import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TemplatePreview } from "@/components/storefront/template-preview";
import { sampleProductsForCategory } from "@/lib/storefront/template-placeholders";
import { getTemplate, STORE_TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/storefront/templates";
import { resolveBuilderTemplateId } from "@/lib/storefront/builder-templates";

describe("website-like storefront templates", () => {
  it("gives every category a sample catalogue for picker websites", () => {
    for (const category of TEMPLATE_CATEGORIES) {
      const products = sampleProductsForCategory(category.id);
      expect(products.length).toBe(4);
      expect(new Set(products.map((product) => product.name)).size).toBe(4);
    }
  });

  it("keeps six distinct homepage compositions per category", () => {
    for (const category of TEMPLATE_CATEGORIES) {
      const designs = STORE_TEMPLATES.filter((template) => template.category === category.id);
      expect(new Set(designs.map((template) => template.heroStyle)).size).toBe(6);
      expect(
        new Set(designs.map((template) => `${template.catalogStyle}:${template.cardStyle}`)).size,
      ).toBe(6);
    }
  });

  it("does not rewrite a grocery website to the modern-minimal shortcut", () => {
    expect(resolveBuilderTemplateId("grocery")).toBe("grocery");
    expect(getTemplate("grocery").name).toBe("Fresh market");
    expect(getTemplate("grocery").layout).toBe("dense");
    expect(getTemplate("grocery").heroStyle).toBe("full-bleed");
  });

  it("renders a shop website chrome instead of a photo placeholder card", () => {
    const html = renderToStaticMarkup(
      createElement(TemplatePreview, { template: getTemplate("food-bakery") }),
    );
    expect(html).toContain("yourshop.mykwetuu.com");
    expect(html).toContain("Shop now");
    expect(html).toContain("Sourdough loaf");
    expect(html).not.toContain("Placeholder");
    expect(html).not.toContain("/marketing/");
    expect(html).not.toContain("<img");
    expect(html).toContain('data-composition="centered"');
  });

  it("describes the website layout instead of repeating the same category blurb", () => {
    const bakery = getTemplate("food-bakery").description;
    const market = getTemplate("grocery").description;
    expect(bakery).not.toEqual(market);
    expect(bakery).not.toMatch(/Menu-first ordering/);
    expect(market).not.toMatch(/Menu-first ordering/);
  });

  it("changes homepage composition between two designs in the same category", () => {
    const bakery = renderToStaticMarkup(
      createElement(TemplatePreview, { template: getTemplate("food-bakery") }),
    );
    const market = renderToStaticMarkup(
      createElement(TemplatePreview, { template: getTemplate("grocery") }),
    );
    expect(bakery).toContain('data-composition="centered"');
    expect(market).toContain('data-composition="full-bleed"');
    expect(bakery).not.toBe(market);
  });
});
