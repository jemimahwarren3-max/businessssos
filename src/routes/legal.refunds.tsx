import { createFileRoute } from "@tanstack/react-router";
import { LegalDocument } from "@/components/legal-document";
import content from "../../legal/REFUND_POLICY.md?raw";

export const Route = createFileRoute("/legal/refunds")({
  head: () => ({
    meta: [{ title: "Refund Policy | Kwetuu" }],
  }),
  component: () => <LegalDocument content={content} />,
});
