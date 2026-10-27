import type { TemplateId } from "./templates";
import { getTemplate } from "./templates";

/** Stage 3 builder: three distinct storefront layouts mapped to existing template definitions. */
export const BUILDER_TEMPLATE_CHOICES = [
  {
    id: "modern-minimal" as const,
    templateId: "modern-minimal" satisfies TemplateId,
    title: "Modern Minimal",
    subtitle: "Fashion, beauty, lifestyle",
    description:
      "Elegant spacing, large hero, refined product grid, and a neutral palette for premium brands.",
  },
  {
    id: "bold-commerce" as const,
    templateId: "general-market" satisfies TemplateId,
    title: "Bold Commerce",
    subtitle: "Electronics, accessories, general retail",
    description:
      "Compact hero, category chips, strong product cards, and utility navigation for high-volume catalogues.",
  },
  {
    id: "local-business" as const,
    templateId: "food-market" satisfies TemplateId,
    title: "Local Business",
    subtitle: "Groceries, crafts, Zimbabwean retail",
    description:
      "Lightweight layout with clear prices, stock labels, and prominent contact and collection details.",
  },
] as const;

export type BuilderTemplateChoiceId = (typeof BUILDER_TEMPLATE_CHOICES)[number]["id"];

export function builderChoiceForTemplateId(templateId: string) {
  return (
    BUILDER_TEMPLATE_CHOICES.find((choice) => choice.templateId === templateId) ??
    BUILDER_TEMPLATE_CHOICES.find((choice) => choice.id === templateId) ??
    BUILDER_TEMPLATE_CHOICES[0]
  );
}

export function resolveBuilderTemplateId(templateId: string): TemplateId {
  const choice = BUILDER_TEMPLATE_CHOICES.find(
    (row) => row.id === templateId || row.templateId === templateId,
  );
  return choice?.templateId ?? (templateId as TemplateId);
}

export function getBuilderTemplatePreview(choiceId: BuilderTemplateChoiceId) {
  const choice = BUILDER_TEMPLATE_CHOICES.find((row) => row.id === choiceId)!;
  return getTemplate(choice.templateId);
}
