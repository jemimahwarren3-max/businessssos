import { createFileRoute } from "@tanstack/react-router";
import { LegalDocument } from "@/components/legal-document";
import content from "../../legal/TERMS_OF_SERVICE.md?raw";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [{ title: "Terms of Service | Kwetuu" }],
  }),
  component: () => <LegalDocument content={content} />,
});
