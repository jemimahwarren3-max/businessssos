import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
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
import { createBusiness, setStaffPasswordFn } from "@/lib/business.functions";
import {
  BUSINESS_TYPES,
  CURRENCIES,
  createBusinessSchema,
  type CreateBusinessInput,
} from "@/lib/business.schemas";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your business | BusinessOS AI" },
      { name: "description", content: "Create your business workspace in BusinessOS AI." },
      { property: "og:title", content: "Set up your business | BusinessOS AI" },
      { property: "og:description", content: "Name, type and currency, then you're ready." },
    ],
  }),
  component: Onboarding,
});

const STEPS = ["Business name", "Business type", "Locale", "Finish"];

function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useServerFn(createBusiness);
  const setShopPassword = useServerFn(setStaffPasswordFn);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CreateBusinessInput>({
    name: "",
    businessType: "grocery",
    currency: "USD",
    phone: "",
    address: "",
  });
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [shopPassword, setShopPasswordValue] = useState("");
  const [shopPasswordDone, setShopPasswordDone] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = createBusinessSchema.parse(form);
      return create({ data: parsed });
    },
    onSuccess: async (newBusinessId) => {
      // Evicts outright rather than invalidating — the dashboard's first
      // visit (redirecting here) already cached workspace:null with a 60s
      // staleTime, and invalidate alone leaves that stale null as the
      // synchronously-served value on the next mount (React Query returns
      // cached data immediately while revalidating in the background), so
      // the dashboard's "no workspace -> back to onboarding" effect fires
      // on the stale null before the real refetch ever lands. Removing the
      // entry forces a genuine isLoading:true fetch next time instead.
      queryClient.removeQueries({ queryKey: ["workspace"] });
      toast.success("Your business is ready.");
      setBusinessId(newBusinessId);
    },
    onError: (error: Error) => toast.error(error.message || "We couldn't create your business."),
  });

  const shopPasswordMutation = useMutation({
    mutationFn: () =>
      setShopPassword({ data: { businessId: businessId!, password: shopPassword } }),
    onSuccess: () => {
      setShopPasswordDone(true);
      toast.success("Shop password set.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't set the shop password."),
  });

  const canContinue =
    step === 0 ? form.name.trim().length >= 2 : step === 2 ? form.currency.length === 3 : true;

  if (businessId) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="border-b border-border px-4 py-4">
          <Logo />
        </header>
        <div className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
          <div className="surface p-6 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10">
              <Check className="size-6 text-primary" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-xl font-bold tracking-tight">{form.name} is ready</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              You and your team sign in with your business name (
              <span className="font-medium text-foreground">{form.name}</span>) and a shop password
             , set that below.
            </p>

            {shopPasswordDone ? (
              <div className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-sm text-success">
                <Check className="size-4" aria-hidden="true" />
                Shop password set.
              </div>
            ) : (
              <form
                className="mt-6 space-y-3 text-left"
                onSubmit={(event) => {
                  event.preventDefault();
                  shopPasswordMutation.mutate();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="onboarding-shop-password">Set a shop password</Label>
                  <Input
                    id="onboarding-shop-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={shopPassword}
                    onChange={(e) => setShopPasswordValue(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full gap-1.5"
                  disabled={shopPasswordMutation.isPending || shopPassword.length < 8}
                >
                  {shopPasswordMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Set shop password
                </Button>
              </form>
            )}

            <Button
              className="mt-3 w-full"
              disabled={!shopPasswordDone}
              onClick={() => navigate({ to: "/dashboard", replace: true })}
            >
              Continue to dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border px-4 py-4">
        <Logo />
      </header>
      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
        <ol className="flex items-center gap-2" aria-label="Setup progress">
          {STEPS.map((label, index) => (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={
                  index <= step
                    ? "grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                    : "grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground"
                }
              >
                {index < step ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
              </span>
              {index < STEPS.length - 1 ? (
                <span
                  className={index < step ? "h-0.5 flex-1 bg-primary" : "h-0.5 flex-1 bg-border"}
                />
              ) : null}
            </li>
          ))}
        </ol>

        <div className="surface mt-8 p-6">
          <h1 className="text-xl font-bold tracking-tight">{STEPS[step]}</h1>

          {step === 0 ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                This is the name your customers see on receipts and invoices.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="name">Business name</Label>
                <Input
                  id="name"
                  autoFocus
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Sarah's Grocery"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  maxLength={40}
                  value={form.phone ?? ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+263 77 000 0000"
                />
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="mt-5">
              <p className="text-sm text-muted-foreground">
                We use this to suggest sensible defaults. You can change it later.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {BUSINESS_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setForm({ ...form, businessType: type.value })}
                    aria-pressed={form.businessType === type.value}
                    className={
                      form.businessType === type.value
                        ? "rounded-xl border-2 border-primary bg-accent px-3.5 py-3 text-left text-sm font-medium text-accent-foreground"
                        : "rounded-xl border border-border px-3.5 py-3 text-left text-sm font-medium transition-colors hover:bg-muted"
                    }
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                All prices, totals and reports will use this currency.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(value) => setForm({ ...form, currency: value })}
                >
                  <SelectTrigger id="currency">
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
              <div className="space-y-1.5">
                <Label htmlFor="address">Business address (optional)</Label>
                <Input
                  id="address"
                  maxLength={240}
                  value={form.address ?? ""}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="12 Main Street, Harare"
                />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="mt-5 space-y-3 text-sm">
              <p className="text-muted-foreground">
                We'll create your workspace and start your 14-day Business trial. No card needed.
              </p>
              <dl className="divide-y divide-border rounded-xl border border-border">
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-muted-foreground">Business</dt>
                  <dd className="font-medium">{form.name}</dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="font-medium">
                    {BUSINESS_TYPES.find((t) => t.value === form.businessType)?.label}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-muted-foreground">Currency</dt>
                  <dd className="font-medium">{form.currency}</dd>
                </div>
              </dl>
              <p className="text-muted-foreground">
                Next you'll add your first products, that's when inventory tracking starts.
              </p>
            </div>
          ) : null}

          <div className="mt-7 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || mutation.isPending}
              className="gap-1.5"
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canContinue}
                className="gap-1.5"
              >
                Continue <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="gap-1.5"
              >
                {mutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Create my business
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
