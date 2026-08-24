import { createFileRoute } from "@tanstack/react-router";
import { LegalDocument } from "@/components/legal-document";
import content from "../../legal/ACCESSIBILITY_STATEMENT.md?raw";

export const Route = createFileRoute("/legal/accessibility")({
  head: () => ({
    meta: [{ title: "Accessibility Statement — BusinessOS AI" }],
  }),
  component: () => <LegalDocument content={content} />,
});
