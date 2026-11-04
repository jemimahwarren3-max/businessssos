import { useEffect } from "react";
import { createFileRoute, isRedirect, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Loader2,
  Briefcase,
  Package,
  Receipt,
  Store,
  Users,
} from "lucide-react";
import { isCommerceModel, navShowsServicesFirst } from "@/lib/commerce-model";
import {
  OnboardingCard,
  OnboardingHeading,
  OnboardingShell,
} from "@/components/onboarding/onboarding-shell";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { useWorkspace } from "@/hooks/use-workspace";
import { getSetupProgressFn, getWorkspace, markSetupCompleteFn } from "@/lib/business.functions";
import { shouldSendToCreateShop } from "@/lib/auth/post-auth-destination";

export const Route = createFileRoute("/_authenticated/setup")({
  beforeLoad: async () => {
    try {
      const workspace = await getWorkspace();
      if (!workspace) {
        throw redirect({ to: "/onboarding", replace: true });
      }
      if (workspace.business.setup_completed_at) {
        throw redirect({ to: "/dashboard", replace: true });
      }
    } catch (error) {
      if (isRedirect(error)) throw error;
      // Stay on /setup with retry, a load failure is not "no shop".
    }
  },
  head: () => ({
    meta: [
      { title: `Set up your workspace | ${BRAND.name}` },
      { name: "description", content: "Get your business workspace ready." },
    ],
  }),
  component: Setup,
});

type ChecklistItem = {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: typeof Package;
  done: boolean;
  optional?: boolean;
};

function Setup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useWorkspace();
  const fetchProgress = useServerFn(getSetupProgressFn);
  const markComplete = useServerFn(markSetupCompleteFn);

  const businessId = workspace.data?.business.id;

  useEffect(() => {
    if (workspace.data?.business.setup_completed_at) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [workspace.data, navigate]);

  useEffect(() => {
    if (
      shouldSendToCreateShop({
        isLoading: workspace.isLoading,
        isError: workspace.isError,
        workspace: workspace.data,
      })
    ) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.isError, workspace.data, navigate]);

  const progress = useQuery({
    queryKey: ["setup-progress", businessId],
    queryFn: () => fetchProgress({ data: { businessId: businessId! } }),
    enabled: !!businessId,
    refetchInterval: 30_000,
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      await markComplete({ data: { businessId: businessId! } });
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["workspace"] });
      toast.success("Setup complete! Welcome to your dashboard.");
      navigate({ to: "/dashboard", replace: true });
    },
    onError: () => toast.error("Could not complete setup. Please try again."),
  });

  if (workspace.isError) {
    return (
      <OnboardingShell step={0} totalSteps={1} stepTitle="Couldn't load">
        <OnboardingHeading
          title="We couldn't load your shop"
          description="Nothing was deleted. Try again, or go back to the dashboard."
        />
        <div className="mt-6 flex flex-wrap gap-3">
          <Button className="rounded-full" onClick={() => void workspace.refetch()}>
            Try again
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </OnboardingShell>
    );
  }

  if (!workspace.data || !businessId) {
    return (
      <OnboardingShell step={0} totalSteps={1} stepTitle="Loading">
        <Loader2 className="mt-8 size-8 animate-spin text-primary" aria-label="Loading" />
      </OnboardingShell>
    );
  }

  const p = progress.data;
  const businessName = workspace.data.business.name;
  const isFull = p?.business_path === "full";
  const model = isCommerceModel(p?.commerce_model)
    ? p.commerce_model
    : isCommerceModel(workspace.data.business.commerce_model)
      ? workspace.data.business.commerce_model
      : "products";
  const servicesFirst = navShowsServicesFirst(model);

  const checklist: ChecklistItem[] = [
    ...(servicesFirst
      ? [
          {
            key: "service",
            title: "Add your first service",
            description: "Add what you offer, with a price or quote, so customers can book.",
            href: "/services",
            icon: Briefcase,
            done: !!p?.has_services,
          } satisfies ChecklistItem,
        ]
      : []),
    {
      key: "product",
      title: servicesFirst ? "Add products (optional)" : "Add your first product",
      description: servicesFirst
        ? "You can also sell physical goods from the same till and shop."
        : "Add products so you can start making sales.",
      href: "/inventory",
      icon: Package,
      done: !!p?.has_products,
      optional: servicesFirst && model !== "hybrid",
    },
    {
      key: "sale",
      title: "Make your first sale",
      description: "Record a sale to see how Kwetuu tracks your revenue.",
      href: "/sales",
      icon: Receipt,
      done: !!p?.has_sales,
    },
    ...(isFull
      ? [
          {
            key: "storefront",
            title: "Set up your online store",
            description: "Choose a design and preview your store before publishing.",
            href: "/storefront",
            icon: Store,
            done: !!p?.storefront_enabled,
          },
        ]
      : []),
    {
      key: "team",
      title: "Invite your team",
      description: "Add staff members so they can help manage your business.",
      href: "/settings/team",
      icon: Users,
      done: !!p?.has_team,
      optional: true,
    },
  ];

  const requiredDone = checklist.filter((c) => !c.optional && c.done).length;
  const requiredTotal = checklist.filter((c) => !c.optional).length;
  const allRequiredDone = requiredDone >= requiredTotal;

  return (
    <OnboardingShell
      step={requiredDone}
      totalSteps={requiredTotal}
      stepTitle={`Setting up ${businessName}`}
      badge="Your workspace is ready"
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => completeMutation.mutate()}
            className="text-muted-foreground"
          >
            Skip for now
          </Button>
          {allRequiredDone ? (
            <Button
              className="gap-1.5 rounded-full px-6"
              disabled={completeMutation.isPending}
              onClick={() => completeMutation.mutate()}
            >
              {completeMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Go to dashboard <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      }
    >
      <OnboardingHeading
        title={`Welcome to ${businessName}!`}
        description="Complete these steps to get the most out of Kwetuu. You can always come back to them later."
      />

      {progress.isError ? (
        <div className="mt-6 space-y-3 rounded-2xl border bg-card p-4">
          <p className="text-sm font-semibold">We couldn't load your setup checklist</p>
          <p className="text-sm text-muted-foreground">
            Nothing was deleted. Try again, you can still skip and open the dashboard.
          </p>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => void progress.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {checklist.map((item) => (
            <Link
              key={item.key}
              to={
                item.href as
                  "/inventory" | "/services" | "/sales" | "/storefront" | "/settings/team"
              }
              className="group flex items-center gap-4 rounded-2xl border bg-card p-4 transition hover:border-primary"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10">
                <item.icon className="size-5 text-primary" aria-hidden="true" />
              </span>
              <span className="flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{item.title}</span>
                  {item.optional ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      Optional
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {item.description}
                </span>
              </span>
              {item.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-green-500" aria-label="Done" />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground/40" aria-label="To do" />
              )}
            </Link>
          ))}
        </div>
      )}
    </OnboardingShell>
  );
}
