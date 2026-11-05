import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TemplatePreview } from "@/components/storefront/template-preview";
import { StorefrontPromoZone } from "@/components/storefront/storefront-promo-zone";
import { sampleProductsForCategory } from "@/lib/storefront/template-placeholders";
import { getTemplate, STORE_TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/storefront/templates";
import { resolveBuilderTemplateId } from "@/lib/storefront/builder-templates";
import { themeFromPalette } from "@/lib/storefront/theme";

describe("website-like storefront templates", () => {
  it("gives every category a sample catalogue for picker websites", () => {
    for (const category of TEMPLATE_CATEGORIES) {
      const products = sampleProductsForCategory(category.id);
      expect(products.length).toBe(4);
      expect(new Set(products.map((product) => product.name)).size).toBe(4);
    }
  });

  it("keeps six distinct homepage compositions per category", () => {
    expect(STORE_TEMPLATES).toHaveLength(60);
    for (const category of TEMPLATE_CATEGORIES) {
      const designs = STORE_TEMPLATES.filter((template) => template.category === category.id);
      expect(new Set(designs.map((template) => template.heroStyle)).size).toBe(6);
      expect(
        new Set(designs.map((template) => `${template.catalogStyle}:${template.cardStyle}`)).size,
      ).toBe(6);
    }
  });

  it("renders a different promotional zone composition for each hero style", () => {
    const tile = {
      id: "spring-range",
      title: "New collection",
      subtitle: "Explore the pieces selected for this season.",
      imageUrl: "https://example.com/collection.jpg",
      categoryName: "Featured",
    };
    const categories = [{ id: "featured", name: "Featured" }];
    const theme = themeFromPalette("linen");
    const layouts = STORE_TEMPLATES.map((template) => {
      const html = renderToStaticMarkup(
        createElement(StorefrontPromoZone, {
          template,
          tiles: [tile],
          categories,
          theme,
        }),
      );
      expect(html).toContain("New collection");
      expect(html).toContain('src="https://example.com/collection.jpg"');
      return html.match(/data-promo-layout="([^"]+)"/)?.[1];
    });

    expect(new Set(layouts).size).toBe(6);
  });

  it("only exposes a category action when the promotion has a matching category", () => {
    const template = getTemplate("food-bakery");
    const theme = themeFromPalette("market");
    const html = renderToStaticMarkup(
      createElement(StorefrontPromoZone, {
        template,
        tiles: [
          {
            id: "bakery",
            title: "Bakery",
            subtitle: "Browse the bakery range.",
            imageUrl: "",
            categoryName: "Bread",
          },
        ],
        categories: [{ id: "bread", name: "Bread" }],
        theme,
        onSelectCategory: () => undefined,
      }),
    );

    expect(html).toContain("<button");
    expect(html).toContain("Explore Bread");

    const unmatched = renderToStaticMarkup(
      createElement(StorefrontPromoZone, {
        template,
        tiles: [
          {
            id: "bakery",
            title: "Bakery",
            subtitle: "Browse the bakery range.",
            imageUrl: "",
            categoryName: "Missing category",
          },
        ],
        categories: [{ id: "bread", name: "Bread" }],
        theme,
        onSelectCategory: () => undefined,
      }),
    );
    expect(unmatched).not.toContain("<button");
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
