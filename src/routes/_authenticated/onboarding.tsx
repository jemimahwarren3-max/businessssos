import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, isRedirect, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Briefcase, Check, Loader2, Store } from "lucide-react";
import {
  OnboardingCard,
  OnboardingHeading,
  OnboardingShell,
} from "@/components/onboarding/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createBusiness, completeOnboarding, getWorkspace } from "@/lib/business.functions";
import { onboardingPageDestination } from "@/lib/auth/post-auth-destination";
import { PLAN_MONTHLY_USD, TRIAL_LENGTH_LABEL, planAmountZig } from "@/lib/billing-plans";
import {
  BUSINESS_TYPES,
  BUSINESS_SUBCATEGORIES,
  CURRENCIES,
  SELLING_CHANNELS,
  PAYMENT_METHOD_OPTIONS,
  createBusinessSchema,
  type BusinessPath,
  type CreateBusinessInput,
  type OnboardingConfig,
} from "@/lib/business.schemas";
import { BRAND } from "@/lib/brand";
import { readableError } from "@/lib/format";
import { useWorkspace } from "@/hooks/use-workspace";
import { getPlatformFxFn } from "@/lib/storefront/storefront.functions";
import { ONBOARDING_LOAD_TIMEOUT_MS, onboardingLoadGate } from "@/lib/onboarding-resume";

export const Route = createFileRoute("/_authenticated/onboarding")({
  beforeLoad: async () => {
    try {
      const workspace = await getWorkspace();
      const next = onboardingPageDestination({
        hasMembership: Boolean(workspace),
        setupCompleted: Boolean(workspace?.business.setup_completed_at),
      });
      if (next) throw redirect({ to: next, replace: true });
    } catch (error) {
      if (isRedirect(error)) throw error;
      // A failed workspace load must not show the create-shop wizard.
      // The page renders retry copy instead.
    }
  },
  head: () => ({
    meta: [
      { title: `Set up your business | ${BRAND.name}` },
      { name: "description", content: "Create your business workspace on Kwetuu." },
    ],
  }),
  component: Onboarding,
});

const STEP_TITLES = [
  "Your business",
  "What you do",
  "How you'll use Kwetuu",
  "How your business works",
  "Your online store",
  "Review & create",
];

function getStepsForPath(path: BusinessPath): string[] {
  if (path === "full") return STEP_TITLES;
  return STEP_TITLES.filter((_, i) => i !== 4);
}

const TYPE_QUESTIONS: Record<string, { label: string; key: keyof OnboardingConfig }[]> = {
  grocery: [
    { label: "Do you track stock quantities?", key: "tracksStock" },
    { label: "Do you allow customers to buy on credit?", key: "allowsCredit" },
  ],
  boutique: [
    { label: "Do you track stock quantities?", key: "tracksStock" },
    { label: "Do you accept deposits or lay-by?", key: "allowsLayby" },
  ],
  salon: [
    { label: "Do you sell products as well as services?", key: "tracksStock" },
    { label: "Do you accept deposits?", key: "allowsLayby" },
  ],
  restaurant: [
    { label: "Do you track ingredient stock?", key: "tracksStock" },
    { label: "Do you offer delivery?", key: "offersDelivery" },
  ],
  wholesale: [
    { label: "Do you allow customers to buy on credit?", key: "allowsCredit" },
    { label: "Do you have multiple branches?", key: "hasMultipleBranches" },
  ],
  services: [
    { label: "Do you also sell physical products?", key: "tracksStock" },
    { label: "Do you allow customers to buy on credit?", key: "allowsCredit" },
  ],
};

function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useWorkspace();
  const create = useServerFn(createBusiness);
  const markComplete = useServerFn(completeOnboarding);
  const loadFx = useServerFn(getPlatformFxFn);

  const existingId = workspace.data?.business.id ?? null;

  const [step, setStep] = useState(0);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [form, setForm] = useState<CreateBusinessInput>({
    name: "",
    businessType: "grocery",
    currency: "USD",
    phone: "",
    address: "",
    businessPath: "management",
    onboardingConfig: {
      sellingChannel: "physical",
      isExistingBusiness: true,
      hasPhysicalLocation: true,
      subcategory: "",
      businessPhone: "",
      sellsProducts: true,
      sellsServices: false,
      paymentMethods: ["cash"],
      allowsCredit: false,
      allowsLayby: false,
      tracksStock: true,
      pricingModel: "retail",
      offersDelivery: false,
      offersCollection: true,
      hasMultipleBranches: false,
      hasEmployees: false,
      completedSteps: [],
    },
  });

  const config = form.onboardingConfig!;
  const setConfig = useCallback(
    (patch: Partial<OnboardingConfig>) =>
      setForm((f) => ({ ...f, onboardingConfig: { ...f.onboardingConfig!, ...patch } })),
    [],
  );

  const fx = useQuery({ queryKey: ["platform-fx"], queryFn: () => loadFx() });
  const zigMonthly = useMemo(() => planAmountZig(PLAN_MONTHLY_USD.pro, fx.data ?? null), [fx.data]);

  const steps = getStepsForPath(form.businessPath);
  const totalSteps = steps.length;

  useEffect(() => {
    if (existingId && workspace.data?.business.setup_completed_at) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [existingId, workspace.data, navigate]);

  useEffect(() => {
    if (!workspace.isLoading) {
      setLoadTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setLoadTimedOut(true), ONBOARDING_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [workspace.isLoading]);

  useEffect(() => {
    if (workspace.data?.business) {
      const b = workspace.data.business;
      setForm((f) => ({
        ...f,
        name: b.name || f.name,
        currency: b.currency || f.currency,
        businessType: BUSINESS_TYPES.some((t) => t.value === b.business_type)
          ? (b.business_type as CreateBusinessInput["businessType"])
          : f.businessType,
      }));
    }
  }, [workspace.data]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = createBusinessSchema.safeParse(form);
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues[0]?.message ?? "Check your business details and try again.",
        );
      }
      const result = await create({ data: parsed.data });
      if (!result?.ok) throw new Error(result?.error ?? "We couldn't create your business.");
      return result.businessId;
    },
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["workspace"] });
      toast.success(`${form.name} is ready! Let's set things up.`);
      navigate({ to: "/setup", replace: true });
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "We couldn't create your business.")),
  });

  const exitToDashboard = async () => {
    try {
      await markComplete({});
      queryClient.removeQueries({ queryKey: ["workspace"] });
    } catch {
      // still send existing merchants through
    }
    navigate({ to: "/dashboard", replace: true });
  };

  const loadGate = onboardingLoadGate({
    workspaceLoading: workspace.isLoading,
    workspaceError: workspace.isError,
    businessId: existingId,
    adminLoading: false,
    hasAdminData: true,
    adminError: false,
    timedOut: loadTimedOut,
  });

  if (loadGate === "spinner") {
    return (
      <OnboardingShell step={0} totalSteps={1} stepTitle="Your shop">
        <OnboardingHeading
          title="Loading your shop"
          description="We're picking up where you left off. Your products and settings are still saved."
        />
        <Loader2 className="mt-8 size-8 animate-spin text-primary" aria-label="Loading" />
        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            className="rounded-full"
            variant="outline"
            onClick={() => {
              setLoadTimedOut(false);
              void workspace.refetch();
            }}
          >
            Try again
          </Button>
          <Button variant="ghost" className="rounded-full" onClick={() => void exitToDashboard()}>
            Go to dashboard
          </Button>
        </div>
      </OnboardingShell>
    );
  }

  if (loadGate === "workspace-error") {
    return (
      <OnboardingShell step={0} totalSteps={1} stepTitle="Your shop">
        <OnboardingHeading
          title="We couldn't load your shop"
          description="Nothing was deleted. This failed to open an existing shop, do not create a second one."
        />
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            className="rounded-full"
            onClick={() => {
              setLoadTimedOut(false);
              void workspace.refetch();
            }}
          >
            Try again
          </Button>
          <Button variant="outline" className="rounded-full" onClick={() => void exitToDashboard()}>
            Go to dashboard
          </Button>
        </div>
      </OnboardingShell>
    );
  }

  if (existingId && !workspace.data?.business.setup_completed_at) {
    navigate({ to: "/setup", replace: true });
    return null;
  }

  if (existingId) {
    navigate({ to: "/dashboard", replace: true });
    return null;
  }

  const canContinue = (() => {
    switch (step) {
      case 0:
        return form.name.trim().length >= 2;
      case 1:
        return !!form.businessType;
      case 2:
        return !!form.businessPath;
      case 3:
        return form.currency.length === 3;
      default:
        return true;
    }
  })();

  const subcategories = BUSINESS_SUBCATEGORIES[form.businessType] ?? [];
  const typeQuestions = TYPE_QUESTIONS[form.businessType] ?? TYPE_QUESTIONS["grocery"]!;

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {step > 0 ? (
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          onClick={() => setStep((s) => s - 1)}
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Back
        </Button>
      ) : (
        <span />
      )}
      {step < totalSteps - 1 ? (
        <Button
          type="button"
          className="ml-auto gap-1.5 rounded-full px-6"
          disabled={!canContinue}
          onClick={() => {
            if (step === 2 && form.businessPath === "management") {
              const fullStepIndex = STEP_TITLES.indexOf("Your online store");
              if (fullStepIndex > step + 1) {
                setStep(step + 1);
                return;
              }
            }
            setStep((s) => s + 1);
          }}
        >
          Continue <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );

  return (
    <OnboardingShell
      step={step}
      totalSteps={totalSteps}
      stepTitle={steps[step] ?? "Get started"}
      footer={footer}
      badge="Let's get to know your business"
    >
      {/* Step 0: Business name & contact */}
      {step === 0 ? (
        <>
          <OnboardingHeading
            title="What is your business called?"
            description="This is the name your customers see on receipts, invoices and your online store."
          />
          <OnboardingCard>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="biz-name">Business name</Label>
                <Input
                  id="biz-name"
                  autoFocus
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Sarah's Grocery"
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-phone">WhatsApp or phone number (optional)</Label>
                <Input
                  id="biz-phone"
                  type="tel"
                  maxLength={40}
                  value={form.phone ?? ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+263 77 000 0000"
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-address">Business location (optional)</Label>
                <Input
                  id="biz-address"
                  maxLength={240}
                  value={form.address ?? ""}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="12 Main Street, Harare"
                  className="h-11"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setConfig({ isExistingBusiness: true })}
                  className={
                    config.isExistingBusiness
                      ? "rounded-xl border-2 border-primary bg-accent p-3 text-sm font-medium"
                      : "rounded-xl border border-border p-3 text-sm font-medium hover:bg-muted"
                  }
                >
                  Existing business
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ isExistingBusiness: false })}
                  className={
                    !config.isExistingBusiness
                      ? "rounded-xl border-2 border-primary bg-accent p-3 text-sm font-medium"
                      : "rounded-xl border border-border p-3 text-sm font-medium hover:bg-muted"
                  }
                >
                  Just starting
                </button>
              </div>
            </div>
          </OnboardingCard>
        </>
      ) : null}

      {/* Step 1: Business type */}
      {step === 1 ? (
        <>
          <OnboardingHeading
            title="What type of business do you run?"
            description="We'll set up Kwetuu around the way you work."
          />
          <OnboardingCard>
            <div className="grid gap-2 sm:grid-cols-2">
              {BUSINESS_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => {
                    setForm({
                      ...form,
                      businessType: type.value as CreateBusinessInput["businessType"],
                    });
                    if (type.value === "salon" || type.value === "services") {
                      setConfig({ sellsServices: true, sellsProducts: type.value !== "services" });
                    } else {
                      setConfig({ sellsServices: false, sellsProducts: true });
                    }
                  }}
                  className={
                    form.businessType === type.value
                      ? "rounded-xl border-2 border-primary bg-accent px-3.5 py-3 text-left text-sm font-medium"
                      : "rounded-xl border border-border px-3.5 py-3 text-left text-sm font-medium hover:bg-muted"
                  }
                >
                  {type.label}
                </button>
              ))}
            </div>
            {subcategories.length > 0 ? (
              <div className="mt-4 space-y-1.5">
                <Label htmlFor="subcategory">More specifically</Label>
                <Select
                  value={config.subcategory || ""}
                  onValueChange={(v) => setConfig({ subcategory: v })}
                >
                  <SelectTrigger id="subcategory" className="h-11">
                    <SelectValue placeholder="Choose a subcategory (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {subcategories.map((sub) => (
                      <SelectItem key={sub.value} value={sub.value}>
                        {sub.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="mt-4 space-y-1.5">
              <Label>How do you currently sell?</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {SELLING_CHANNELS.map((ch) => (
                  <button
                    key={ch.value}
                    type="button"
                    onClick={() => setConfig({ sellingChannel: ch.value })}
                    className={
                      config.sellingChannel === ch.value
                        ? "rounded-lg border-2 border-primary bg-accent px-3 py-2.5 text-left text-sm font-medium"
                        : "rounded-lg border border-border px-3 py-2.5 text-left text-sm font-medium hover:bg-muted"
                    }
                  >
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label>Do you sell products, services or both?</Label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: "products", label: "Products" },
                    { key: "services", label: "Services" },
                    { key: "both", label: "Both" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() =>
                      setConfig({
                        sellsProducts: opt.key === "products" || opt.key === "both",
                        sellsServices: opt.key === "services" || opt.key === "both",
                      })
                    }
                    className={
                      (opt.key === "both" && config.sellsProducts && config.sellsServices) ||
                      (opt.key === "products" && config.sellsProducts && !config.sellsServices) ||
                      (opt.key === "services" && !config.sellsProducts && config.sellsServices)
                        ? "rounded-lg border-2 border-primary bg-accent px-3 py-2 text-sm font-medium"
                        : "rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </OnboardingCard>
        </>
      ) : null}

      {/* Step 2: Business path */}
      {step === 2 ? (
        <>
          <OnboardingHeading
            title="How would you like to use Kwetuu?"
            description={`Both options cost the same ($${PLAN_MONTHLY_USD.pro}/month${zigMonthly != null ? ` or ZiG ${zigMonthly}` : " or ZiG"} after your ${TRIAL_LENGTH_LABEL} free trial). You can always add an online store later.`}
          />
          <div className="mt-6 grid gap-4">
            <button
              type="button"
              onClick={() => setForm({ ...form, businessPath: "management" })}
              className={
                form.businessPath === "management"
                  ? "flex items-start gap-4 rounded-2xl border-2 border-primary bg-accent p-5 text-left"
                  : "flex items-start gap-4 rounded-2xl border-2 border-transparent bg-card p-5 text-left transition hover:border-primary"
              }
            >
              <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10">
                <Briefcase className="size-5 text-primary" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-base font-semibold">Business management</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Inventory, sales, invoices, expenses, reports and team management. For businesses
                  that sell in person or just need back-office tools.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, businessPath: "full" })}
              className={
                form.businessPath === "full"
                  ? "flex items-start gap-4 rounded-2xl border-2 border-primary bg-accent p-5 text-left"
                  : "flex items-start gap-4 rounded-2xl border-2 border-transparent bg-card p-5 text-left transition hover:border-primary"
              }
            >
              <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10">
                <Store className="size-5 text-primary" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-base font-semibold">Business + online store</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Everything above, plus a customer-facing storefront where people can browse and
                  order from you online.
                </span>
              </span>
            </button>
          </div>
        </>
      ) : null}

      {/* Step 3: Configure operations */}
      {step === 3 ? (
        <>
          <OnboardingHeading
            title="How does your business work?"
            description="We'll configure Kwetuu based on how you operate. You can change any of this later."
          />
          <OnboardingCard>
            <div className="space-y-6">
              <div className="space-y-1.5">
                <Label htmlFor="currency">Which currency do you mainly use?</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setForm({ ...form, currency: v })}
                >
                  <SelectTrigger id="currency" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.businessType === "wholesale" || form.businessType === "grocery" ? (
                <div className="space-y-1.5">
                  <Label>Pricing model</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["retail", "wholesale", "both"] as const).map((pm) => (
                      <button
                        key={pm}
                        type="button"
                        onClick={() => setConfig({ pricingModel: pm })}
                        className={
                          config.pricingModel === pm
                            ? "rounded-lg border-2 border-primary bg-accent px-3 py-2 text-sm font-medium capitalize"
                            : "rounded-lg border border-border px-3 py-2 text-sm font-medium capitalize hover:bg-muted"
                        }
                      >
                        {pm}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>Which payment methods do you accept?</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PAYMENT_METHOD_OPTIONS.map((pm) => {
                    const selected = config.paymentMethods.includes(pm.value);
                    return (
                      <button
                        key={pm.value}
                        type="button"
                        onClick={() =>
                          setConfig({
                            paymentMethods: selected
                              ? config.paymentMethods.filter((m) => m !== pm.value)
                              : [...config.paymentMethods, pm.value],
                          })
                        }
                        className={
                          selected
                            ? "flex items-center gap-2 rounded-lg border-2 border-primary bg-accent px-3 py-2.5 text-sm font-medium"
                            : "flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted"
                        }
                      >
                        {selected ? (
                          <Check className="size-4 text-primary" aria-hidden="true" />
                        ) : (
                          <span className="size-4" />
                        )}
                        {pm.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <Label>Your business operations</Label>
                {typeQuestions.map((q) => (
                  <label
                    key={q.key}
                    className="flex items-center justify-between rounded-xl border bg-card p-4"
                  >
                    <span className="text-sm font-medium">{q.label}</span>
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={Boolean(config[q.key])}
                      onChange={(e) => setConfig({ [q.key]: e.target.checked })}
                    />
                  </label>
                ))}
                <label className="flex items-center justify-between rounded-xl border bg-card p-4">
                  <span className="text-sm font-medium">
                    Do employees help you run the business?
                  </span>
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    checked={config.hasEmployees}
                    onChange={(e) => setConfig({ hasEmployees: e.target.checked })}
                  />
                </label>
              </div>
            </div>
          </OnboardingCard>
        </>
      ) : null}

      {/* Step 4: Online store setup (only for "full" path) */}
      {step === 4 && form.businessPath === "full" ? (
        <>
          <OnboardingHeading
            title="Your online store"
            description="We'll create a storefront for your business. You can customise the design, add products and publish when you're ready."
          />
          <OnboardingCard>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border bg-card p-4">
                <span className="text-sm font-medium">Customers can collect from me</span>
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={config.offersCollection}
                  onChange={(e) => setConfig({ offersCollection: e.target.checked })}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border bg-card p-4">
                <span className="text-sm font-medium">I offer delivery</span>
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={config.offersDelivery}
                  onChange={(e) => setConfig({ offersDelivery: e.target.checked })}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                You can choose a storefront design, add products and set delivery details after
                setup. Your store stays private until you choose to publish.
              </p>
            </div>
          </OnboardingCard>
        </>
      ) : null}

      {/* Final step: Review & create */}
      {step === totalSteps - 1 ? (
        <>
          <OnboardingHeading
            title={`Create ${form.name.trim() || "your business"}`}
            description={`We'll set up your workspace and start your ${TRIAL_LENGTH_LABEL} free trial. No card needed.`}
          />
          <OnboardingCard>
            <dl className="divide-y divide-border">
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-sm text-muted-foreground">Business</dt>
                <dd className="text-sm font-medium">{form.name}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-sm text-muted-foreground">Type</dt>
                <dd className="text-sm font-medium">
                  {BUSINESS_TYPES.find((t) => t.value === form.businessType)?.label}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-sm text-muted-foreground">Currency</dt>
                <dd className="text-sm font-medium">{form.currency}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-sm text-muted-foreground">Plan</dt>
                <dd className="text-sm font-medium">
                  {form.businessPath === "full" ? "Business + online store" : "Business management"}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-sm text-muted-foreground">Payments</dt>
                <dd className="text-right text-sm font-medium">
                  {config.paymentMethods
                    .map((m) => PAYMENT_METHOD_OPTIONS.find((o) => o.value === m)?.label ?? m)
                    .join(", ")}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-sm text-muted-foreground">Trial</dt>
                <dd className="text-sm font-medium">1 month free</dd>
              </div>
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-sm text-muted-foreground">After trial</dt>
                <dd className="text-sm font-medium">
                  ${PLAN_MONTHLY_USD.pro}/month
                  {zigMonthly != null ? ` or ZiG ${zigMonthly}` : ""}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-muted-foreground">
              Next we'll walk you through setting up your workspace step by step.
            </p>
            <Button
              className="mt-6 w-full rounded-full"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Create my business
            </Button>
          </OnboardingCard>
        </>
      ) : null}
    </OnboardingShell>
  );
}
