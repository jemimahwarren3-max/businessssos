import { describe, expect, it } from "vitest";
import {
  BUILDER_TEMPLATE_CHOICES,
  builderChoiceForTemplateId,
  resolveBuilderTemplateId,
} from "@/lib/storefront/builder-templates";
import { getTemplate } from "@/lib/storefront/templates";

describe("store builder templates", () => {
  it("exposes three distinct layout families", () => {
    expect(BUILDER_TEMPLATE_CHOICES).toHaveLength(3);
    const layouts = BUILDER_TEMPLATE_CHOICES.map((choice) => getTemplate(choice.templateId).heroStyle);
    expect(new Set(layouts).size).toBeGreaterThanOrEqual(2);
  });

  it("maps legacy ids to builder choices", () => {
    expect(resolveBuilderTemplateId("modern-minimal")).toBe("modern-minimal");
    expect(builderChoiceForTemplateId("general-market").title).toBe("Bold Commerce");
    expect(builderChoiceForTemplateId("food-market").title).toBe("Local Business");
  });
});
