import { createFileRoute } from "@tanstack/react-router";
import { LegalDocument } from "@/components/legal-document";
import content from "../../legal/AI_DISCLAIMER.md?raw";

export const Route = createFileRoute("/legal/ai-disclaimer")({
  head: () => ({
    meta: [{ title: "AI Assistant Disclaimer | Kwetuu" }],
  }),
  component: () => <LegalDocument content={content} />,
});
