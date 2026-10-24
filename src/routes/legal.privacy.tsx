import { createFileRoute } from "@tanstack/react-router";
import { LegalDocument } from "@/components/legal-document";
import content from "../../legal/PRIVACY_POLICY.md?raw";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [{ title: "Privacy Policy | Kwetuu" }],
  }),
  component: () => <LegalDocument content={content} />,
});
