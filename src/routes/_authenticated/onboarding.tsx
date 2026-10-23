import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import {
  OnboardingCard,
  OnboardingHeading,
  OnboardingShell,
} from "@/components/onboarding/onboarding-shell";
import { TemplatePreview } from "@/components/storefront/template-preview";
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
import { addProduct, completeOnboarding, createBusiness } from "@/lib/business.functions";
import { PLAN_MONTHLY_USD, planAmountZig } from "@/lib/billing-plans";
import {
  BUSINESS_TYPES,
  CURRENCIES,
  createBusinessSchema,
  type CreateBusinessInput,
} from "@/lib/business.schemas";
import { BRAND } from "@/lib/brand";
import { formatMoney, readableError } from "@/lib/format";
import { useWorkspace } from "@/hooks/use-workspace";
import { defaultShopPatch } from "@/lib/storefront/onboarding-defaults";
import { previewShopSlug } from "@/lib/storefront/slug-preview";
import {
  getPlatformFxFn,
  getStorefrontAdminFn,
  publishStorefrontFn,
  saveListingFn,
  saveStorefrontFn,
} from "@/lib/storefront/storefront.functions";
import {
  STORE_TEMPLATES,
  templateForBusinessType,
  type TemplateId,
} from "@/lib/storefront/templates";
import { storePublicUrl } from "@/lib/storefront/host";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: `Set up your shop | ${BRAND.name}` },
      {
        name: "description",
        content: "Name the business, pick a template, add a product, and publish.",
      },
    ],
  }),
  component: Onboarding,
});

const NAME_STEP_TITLES = ["Your shop", "What you sell", "Currency", "Create your shop"];
const SHOP_STEP_TITLES = ["Storefront design", "First product", "Fulfilment", "Publish"];

function previewShopHost(name: string): string {
  try {
    return new URL(storePublicUrl(previewShopSlug(name))).host;
  } catch {
    return `${previewShopSlug(name)}.…`;
  }
}

function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useWorkspace();
  const create = useServerFn(createBusiness);
  const markComplete = useServerFn(completeOnboarding);
  const saveShop = useServerFn(saveStorefrontFn);
  const createProductFn = useServerFn(addProduct);
  const saveListing = useServerFn(saveListingFn);
  const publish = useServerFn(publishStorefrontFn);
  const loadAdmin = useServerFn(getStorefrontAdminFn);
  const loadFx = useServerFn(getPlatformFxFn);

  const existingId = workspace.data?.business.id ?? null;
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CreateBusinessInput>({
    name: workspace.data?.business.name ?? "",
    businessType: "grocery",
    currency: workspace.data?.business.currency ?? "USD",
    phone: "",
    address: "",
  });
  const [businessId, setBusinessId] = useState<string | null>(existingId);
  const [templateId, setTemplateId] = useState<TemplateId>(
    templateForBusinessType(form.businessType),
  );
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("1");
  const [productStock, setProductStock] = useState("10");
  const [pickup, setPickup] = useState(true);
  const [delivery, setDelivery] = useState(false);
  const [shopStep, setShopStep] = useState(0);

  const fx = useQuery({
    queryKey: ["platform-fx"],
    queryFn: () => loadFx(),
  });

  useEffect(() => {
    if (existingId) setBusinessId(existingId);
  }, [existingId]);
  useEffect(() => {
    if (workspace.data?.business) {
      setForm((current) => ({
        ...current,
        name: workspace.data!.business.name,
        currency: workspace.data!.business.currency,
      }));
    }
  }, [workspace.data]);

  const admin = useQuery({
    queryKey: ["storefront", businessId],
    enabled: Boolean(businessId),
    queryFn: () => loadAdmin({ data: { businessId: businessId! } }),
  });

  const zigMonthly = useMemo(() => planAmountZig(PLAN_MONTHLY_USD.pro, fx.data ?? null), [fx.data]);

  const exitToDashboard = async () => {
    try {
      await markComplete({});
      queryClient.removeQueries({ queryKey: ["workspace"] });
    } catch {
      // Still send merchants with a workspace to the dashboard.
    }
    navigate({ to: "/dashboard", replace: true });
  };

  const createMutation = useMutation({
    mutationFn: async () => create({ data: createBusinessSchema.parse(form) }),
    onSuccess: async (newBusinessId) => {
      queryClient.removeQueries({ queryKey: ["workspace"] });
      setBusinessId(newBusinessId);
      setTemplateId(templateForBusinessType(form.businessType));
      toast.success(`${form.name} is ready. Next, pick a shop layout.`);
    },
    onError: (error: Error) => toast.error(error.message || "We couldn't create your business."),
  });

  const saveShopMutation = useMutation({
    mutationFn: async (extra: { pickupEnabled?: boolean; deliveryEnabled?: boolean } = {}) => {
      if (!businessId) throw new Error("Create the business first.");
      return saveShop({
        data: defaultShopPatch({
          businessId,
          storeName: form.name || workspace.data?.business.name || "Shop",
          templateId,
          phone: form.phone ?? "",
          address: form.address ?? "",
          pickupEnabled: extra.pickupEnabled ?? pickup,
          deliveryEnabled: extra.deliveryEnabled ?? delivery,
        }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not save the shop")),
  });

  const productMutation = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("Create the business first.");
      const created = await createProductFn({
        data: {
          businessId,
          name: productName.trim(),
          sku: "",
          barcode: "",
          unit: "unit",
          costPrice: 0,
          sellingPrice: Number(productPrice) || 0,
          stock: Number(productStock) || 0,
          minStock: 0,
          taxRate: 0,
          description: "",
          supplierId: "",
        },
      });
      const productId = Array.isArray(created) ? created[0]?.id : created.id;
      if (!productId) throw new Error("The product was not created.");
      await saveListing({
        data: {
          businessId,
          productId,
          published: true,
          details: "",
          sizeGuide: "",
          minQty: 1,
          maxQty: null,
          featured: true,
        },
      });
    },
    onSuccess: () => {
      toast.success("Product listed on the shop.");
      void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
      setShopStep(2);
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not add the product")),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("Create the business first.");
      await saveShopMutation.mutateAsync({});
      return publish({ data: { businessId, published: true } });
    },
    onSuccess: async () => {
      toast.success("Shop published.");
      void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
      try {
        await markComplete({});
        queryClient.removeQueries({ queryKey: ["workspace"] });
      } catch {
        /* best-effort */
      }
      navigate({ to: "/dashboard", replace: true });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not publish")),
  });

  const canContinueName =
    step === 0 ? form.name.trim().length >= 2 : step === 2 ? form.currency.length === 3 : true;

  const slug = admin.data?.store?.slug;
  const publicUrl = slug ? storePublicUrl(slug) : "";
  const shopName = form.name || workspace.data?.business.name || "Your shop";

  const nameFooter = (
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
      {step < 3 ? (
        <Button
          type="button"
          className="ml-auto gap-1.5 rounded-full px-6"
          disabled={!canContinueName}
          onClick={() => setStep((s) => s + 1)}
        >
          Continue <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );

  if (businessId) {
    const shopFooter =
      shopStep < 3 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {shopStep > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={() => setShopStep((s) => s - 1)}
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> Back
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => void exitToDashboard()}
          >
            Finish later
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:flex-1"
            onClick={() => void exitToDashboard()}
          >
            Go to dashboard without publishing
          </Button>
        </div>
      );

    return (
      <OnboardingShell
        step={shopStep}
        totalSteps={SHOP_STEP_TITLES.length}
        stepTitle={SHOP_STEP_TITLES[shopStep] ?? "Shop setup"}
        footer={shopFooter}
      >
        {shopStep === 0 ? (
          <>
            <OnboardingHeading
              title="Pick a look for your storefront"
              description="Layout and style only — your products and settings stay when you switch later."
            />
            <div className="mt-6 grid max-h-[28rem] gap-3 overflow-y-auto sm:grid-cols-2">
              {STORE_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setTemplateId(template.id)}
                  className={
                    templateId === template.id
                      ? "flex gap-3 overflow-hidden rounded-xl border-2 border-primary bg-card p-2 text-left shadow-soft transition"
                      : "flex gap-3 overflow-hidden rounded-xl border-2 border-transparent bg-card p-2 text-left transition hover:border-border"
                  }
                >
                  <TemplatePreview template={template} className="h-16 w-24 shrink-0" />
                  <span className="min-w-0 py-1">
                    <span className="font-semibold">{template.name}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {template.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <Button
              className="mt-6 w-full gap-1.5 rounded-full"
              disabled={saveShopMutation.isPending}
              onClick={() => {
                saveShopMutation.mutate({}, { onSuccess: () => setShopStep(1) });
              }}
            >
              {saveShopMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="size-4" aria-hidden="true" />
              )}
              Use this template
            </Button>
          </>
        ) : null}

        {shopStep === 1 ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              productMutation.mutate();
            }}
          >
            <OnboardingHeading
              title="Add your first product"
              description="It goes live on your shop right away. You can add photos later in Inventory."
            />
            <OnboardingCard>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="first-product">Product name</Label>
                  <Input
                    id="first-product"
                    required
                    minLength={1}
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="2kg sugar"
                    className="h-11"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="first-price">Selling price ({form.currency})</Label>
                    <Input
                      id="first-price"
                      type="number"
                      min={0}
                      step="0.01"
                      value={productPrice}
                      onChange={(e) => setProductPrice(e.target.value)}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="first-stock">Stock</Label>
                    <Input
                      id="first-stock"
                      type="number"
                      min={0}
                      step="1"
                      value={productStock}
                      onChange={(e) => setProductStock(e.target.value)}
                      className="h-11"
                    />
                  </div>
                </div>
                <Button
                  className="w-full rounded-full"
                  disabled={productMutation.isPending || !productName.trim()}
                >
                  {productMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  List on the shop
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => setShopStep(2)}
                >
                  Skip for now
                </Button>
              </div>
            </OnboardingCard>
          </form>
        ) : null}

        {shopStep === 2 ? (
          <>
            <OnboardingHeading
              title="Delivery and collection"
              description="Choose how customers can receive orders. You can refine fees and zones in Storefront settings."
            />
            <div className="mt-6 space-y-3">
              <label className="flex items-center justify-between rounded-xl border bg-card p-5">
                <span className="font-semibold">Customers can collect from me</span>
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={pickup}
                  onChange={(e) => setPickup(e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between rounded-xl border bg-card p-5">
                <span className="font-semibold">I offer delivery</span>
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={delivery}
                  onChange={(e) => setDelivery(e.target.checked)}
                />
              </label>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              EcoCash, bank transfer, and cash on collection work without Paynow keys. Add automated
              checkout keys later under Storefront if you need them.
            </p>
            <Button
              className="mt-6 w-full rounded-full"
              disabled={saveShopMutation.isPending || (!pickup && !delivery)}
              onClick={() => {
                saveShopMutation.mutate(
                  { pickupEnabled: pickup, deliveryEnabled: delivery },
                  { onSuccess: () => setShopStep(3) },
                );
              }}
            >
              Continue
            </Button>
          </>
        ) : null}

        {shopStep === 3 ? (
          <>
            <OnboardingHeading
              title="Launch when you are ready"
              description="Building and previewing your store is free. Your shop only becomes public when you publish and billing rules are satisfied."
            />
            <OnboardingCard>
              <p className="font-display text-2xl">{shopName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {slug ? (
                  <>
                    Live address after publish:{" "}
                    <span className="break-all font-medium text-foreground">{publicUrl}</span>
                  </>
                ) : (
                  <>Example address: {previewShopHost(shopName)}</>
                )}
              </p>
              {slug ? (
                <p className="mt-3 text-sm">
                  Preview now:{" "}
                  <Link
                    to="/store/$slug"
                    params={{ slug }}
                    search={{ preview: "1" }}
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Open draft preview
                  </Link>
                </p>
              ) : null}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border-2 border-primary/30 p-5">
                  <p className="font-display text-3xl tabular-nums text-primary">
                    {formatMoney(PLAN_MONTHLY_USD.pro, "USD")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    USD per month when billing applies
                  </p>
                </div>
                <div className="rounded-xl border-2 border-primary/30 p-5">
                  <p className="font-display text-3xl tabular-nums text-primary">
                    {zigMonthly != null ? formatMoney(zigMonthly, "ZWG") : "ZiG —"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ZiG per month (separate price, not converted)
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Draft shops stay private until you publish. Customer payments go to you directly —{" "}
                {BRAND.name} subscription billing is separate from shop checkout.
              </p>
              <div className="mt-6 rounded-xl border border-border p-4">
                <h2 className="text-sm font-semibold">Before you publish</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Add products, set EcoCash or bank instructions in Storefront, then share your link
                  when orders are ready to go live.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link to="/inventory">Add products</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/storefront">Payment &amp; publish settings</Link>
                  </Button>
                </div>
              </div>
            </OnboardingCard>
            <Button
              className="mt-6 w-full rounded-full"
              disabled={publishMutation.isPending}
              onClick={() => publishMutation.mutate()}
            >
              {publishMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Publish shop
            </Button>
          </>
        ) : null}
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      step={step}
      totalSteps={NAME_STEP_TITLES.length}
      stepTitle={NAME_STEP_TITLES[step] ?? "Get started"}
      footer={nameFooter}
    >
      {step === 0 ? (
        <>
          <OnboardingHeading
            title="Let's build your shop's home"
            description="Just the basics — you can change everything later."
          />
          <OnboardingCard>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="biz-name">Shop name</Label>
                <Input
                  id="biz-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Rudo's Beauty Corner"
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-phone">WhatsApp or phone (optional)</Label>
                <Input
                  id="biz-phone"
                  value={form.phone ?? ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+263 77 123 4567"
                  className="h-11"
                />
              </div>
            </div>
          </OnboardingCard>
          {form.name.trim().length >= 2 ? (
            <OnboardingCard>
              <p className="text-sm text-muted-foreground">Example address after you publish</p>
              <p className="mt-1 break-all font-display text-2xl sm:text-3xl">
                <span className="text-primary">{previewShopHost(form.name)}</span>
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                We check availability when you publish. Nothing is reserved yet.
              </p>
            </OnboardingCard>
          ) : null}
        </>
      ) : null}

      {step === 1 ? (
        <>
          <OnboardingHeading
            title="What do you sell?"
            description="This helps us suggest a storefront layout."
          />
          <OnboardingCard>
            <Select
              value={form.businessType}
              onValueChange={(value) => {
                setForm({ ...form, businessType: value as CreateBusinessInput["businessType"] });
                setTemplateId(templateForBusinessType(value));
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </OnboardingCard>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <OnboardingHeading
            title="Prices are shown in"
            description="Orders and reports stay in this currency — we do not silently convert USD and ZiG."
          />
          <OnboardingCard>
            <Select
              value={form.currency}
              onValueChange={(value) => setForm({ ...form, currency: value })}
            >
              <SelectTrigger className="h-11">
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
          </OnboardingCard>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <OnboardingHeading
            title={`Create ${form.name.trim() || "your shop"}`}
            description="You'll pick a storefront design and add products next — still free until you publish."
          />
          <OnboardingCard>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                {BUSINESS_TYPES.find((t) => t.value === form.businessType)?.label}
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                Prices in {form.currency}
              </li>
              <li className="flex items-center gap-2">
                <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                {previewShopHost(form.name)}
              </li>
            </ul>
            <Button
              className="mt-6 w-full rounded-full"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Create shop
            </Button>
          </OnboardingCard>
        </>
      ) : null}
    </OnboardingShell>
  );
}
