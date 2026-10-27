import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminStore } from "@/lib/storefront/contract";
import {
  buildLaunchSteps,
  deriveStoreLaunchDisplay,
  type StoreLaunchPhase,
} from "@/lib/storefront/launch-status";
import { cn } from "@/lib/utils";

const PHASE_STYLE: Record<StoreLaunchPhase, string> = {
  not_set_up: "bg-muted text-muted-foreground",
  draft: "bg-warning-soft text-warning-foreground",
  payment_required: "bg-danger-soft text-destructive",
  ready_to_launch: "bg-success-soft text-success",
  live: "bg-primary/15 text-primary",
};

export function StoreLaunchCentre({
  admin,
  billingEnabled,
  isOperateLocked,
  publicUrl,
  notificationsConfigured = false,
  compact = false,
}: {
  admin: AdminStore;
  billingEnabled: boolean;
  isOperateLocked: boolean;
  /** Omit when no slug yet (exactOptionalPropertyTypes). */
  publicUrl?: string;
  notificationsConfigured?: boolean;
  compact?: boolean;
}) {
  const display = deriveStoreLaunchDisplay({
    checklist: admin.checklist,
    storeStatus: admin.store?.status,
    billingEnabled,
    isOperateLocked,
  });
  const steps = buildLaunchSteps(admin.checklist, { notificationsConfigured });
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section
      className={cn("surface space-y-4", compact ? "p-4" : "p-5")}
      aria-labelledby="store-launch-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Your online store</p>
          <h2 id="store-launch-heading" className="text-xl font-semibold tracking-tight">
            {compact ? "Store launch centre" : "Everything you need to start selling online"}
          </h2>
          <p className="text-sm text-muted-foreground">{display.headline}</p>
        </div>
        <Badge className={cn("shrink-0 capitalize", PHASE_STYLE[display.phase])} variant="outline">
          {display.badge}
        </Badge>
      </div>

      {!compact ? (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-[13px] text-muted-foreground">
          <strong className="font-medium text-foreground">Business tools vs online shop:</strong>{" "}
          Invoices, inventory, and POS work without a public storefront. Online selling is optional —
          turn it on here when you are ready.
        </p>
      ) : null}

      <p className="text-[13px] text-muted-foreground">
        {doneCount} of {steps.length} launch steps complete
      </p>

      <ol className="space-y-2">
        {steps.map((step) => (
          <li key={step.id}>
            {step.external ? (
              <Link
                to={step.href}
                className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/40"
              >
                <StepIcon done={step.done} />
                <StepBody step={step} />
                <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ) : (
              <a
                href={step.href}
                className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/40"
              >
                <StepIcon done={step.done} />
                <StepBody step={step} />
              </a>
            )}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2 pt-1">
        {display.phase === "payment_required" ? (
          <Button asChild size="sm">
            <Link to="/settings/billing">Go to Kwetuu billing</Link>
          </Button>
        ) : null}
        {publicUrl && display.phase === "live" ? (
          <Button asChild size="sm" variant="outline">
            <a href={publicUrl} target="_blank" rel="noreferrer">
              Open live shop
            </a>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="outline">
          <Link to="/online-orders">Online orders</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link to="/inventory">Manage inventory</Link>
        </Button>
      </div>
    </section>
  );
}

function StepIcon({ done }: { done: boolean }) {
  return done ? (
    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
  ) : (
    <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
  );
}

function StepBody({ step }: { step: { step: number; title: string; description: string; done: boolean } }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium">
        <span className="text-muted-foreground">{step.step}.</span> {step.title}
        {step.done ? (
          <span className="sr-only"> — completed</span>
        ) : (
          <span className="sr-only"> — not completed</span>
        )}
      </p>
      <p className="text-[13px] text-muted-foreground">{step.description}</p>
    </div>
  );
}
