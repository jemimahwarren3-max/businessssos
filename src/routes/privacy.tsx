import { createFileRoute } from "@tanstack/react-router";
import { LegalDocument } from "@/components/legal-document";
import content from "../../legal/PRIVACY_POLICY.md?raw";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: "Privacy Policy | Kwetuu" }, { name: "robots", content: "index,follow" }],
  }),
  component: () => <LegalDocument content={content} />,
});
