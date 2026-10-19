import { createFileRoute } from "@tanstack/react-router";
import { LegalDocument } from "@/components/legal-document";
import content from "../../legal/COOKIE_POLICY.md?raw";

export const Route = createFileRoute("/legal/cookies")({
  head: () => ({
    meta: [{ title: "Cookie Policy | BusinessOS AI" }],
  }),
  component: () => <LegalDocument content={content} />,
});
