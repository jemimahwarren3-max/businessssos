import { createFileRoute } from "@tanstack/react-router";
import { LegalDocument } from "@/components/legal-document";
import content from "../../legal/TERMS_OF_SERVICE.md?raw";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [{ title: "Terms of Service | Kwetuu" }, { name: "robots", content: "index,follow" }],
  }),
  component: () => <LegalDocument content={content} />,
});
