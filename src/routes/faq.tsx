import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing-shell";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: `FAQ | ${BRAND.name}` },
      { name: "description", content: `Common questions about ${BRAND.name} shops and payments.` },
    ],
  }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Questions</h1>
        <Accordion type="single" collapsible className="mt-8">
          <AccordionItem value="q1">
            <AccordionTrigger>Do I get mystore.{BRAND.domain}?</AccordionTrigger>
            <AccordionContent>
              Yes. A published shop is https://your-slug.{BRAND.domain}. The merchant app stays on{" "}
              {BRAND.domain}. Older /store/your-slug links redirect to the shop host. Draft preview
              stays on {BRAND.domain} because sign-in cookies are not sent to shop subdomains. You
              need a wildcard DNS record for *.{BRAND.domain}.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q2">
            <AccordionTrigger>Where do payments go?</AccordionTrigger>
            <AccordionContent>
              Cash on pickup or delivery is recorded as a sale in your shop. Paynow uses the
              integration keys you save on the storefront, not {BRAND.name} platform billing keys.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q3">
            <AccordionTrigger>Can other shops see my stock?</AccordionTrigger>
            <AccordionContent>
              No. Database rules and server checks scope every product and order to one business.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q4">
            <AccordionTrigger>Do I need to finish every setup step?</AccordionTrigger>
            <AccordionContent>
              No. After the business exists you can open the dashboard and finish the shop later.
              Unpublished shops are not public.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </MarketingShell>
  );
}
