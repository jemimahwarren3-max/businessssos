import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BRAND } from "@/lib/brand";

type OnboardingShellProps = {
  step: number;
  totalSteps: number;
  stepTitle: string;
  children: ReactNode;
  footer?: ReactNode;
  badge?: string;
};

export function OnboardingShell({
  step,
  totalSteps,
  stepTitle,
  children,
  footer,
  badge = "Karibu · Welcome home",
}: OnboardingShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-5">
        <Link to="/" aria-label={`${BRAND.name} home`}>
          <img
            src="/kwetuu-logo.png"
            alt={BRAND.name}
            className="-my-2 -ml-2 h-14 w-auto"
            width={288}
            height={144}
          />
        </Link>
        <span className="text-sm text-muted-foreground">
          Step {step + 1} of {totalSteps}
        </span>
      </header>
      <div className="mx-auto max-w-3xl px-5 pb-12">
        <p className="mb-4 inline-block rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground">
          {badge}
        </p>
        <p className="text-sm font-medium text-muted-foreground">{stepTitle}</p>
        <div className="mt-4 flex gap-1.5" aria-hidden="true">
          {Array.from({ length: totalSteps }, (_, index) => (
            <div
              key={index}
              className={
                index <= step
                  ? "h-1.5 flex-1 rounded-full bg-primary transition-colors"
                  : "h-1.5 flex-1 rounded-full bg-border transition-colors"
              }
            />
          ))}
        </div>
        <div key={step} className="rise py-8">
          {children}
        </div>
        {footer ? <div className="border-t border-border pt-6">{footer}</div> : null}
      </div>
    </div>
  );
}

export function OnboardingHeading({ title, description }: { title: string; description?: string }) {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {description ? <p className="mt-2 text-muted-foreground">{description}</p> : null}
    </>
  );
}

export function OnboardingCard({ children }: { children: ReactNode }) {
  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-soft">{children}</div>
  );
}
