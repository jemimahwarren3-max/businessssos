import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
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
import { addProduct, createBusiness } from "@/lib/business.functions";
import {
  BUSINESS_TYPES,
  CURRENCIES,
  createBusinessSchema,
  type CreateBusinessInput,
} from "@/lib/business.schemas";
import { BRAND } from "@/lib/brand";
import { readableError } from "@/lib/format";
import { useWorkspace } from "@/hooks/use-workspace";
import { defaultShopPatch } from "@/lib/storefront/onboarding-defaults";
import {
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

const NAME_STEPS = ["Business name", "Category", "Currency", "Create"];
const SHOP_STEPS = ["Template", "First product", "Pickup", "Publish"];

function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useWorkspace();
  const create = useServerFn(createBusiness);
  const saveShop = useServerFn(saveStorefrontFn);
  const createProductFn = useServerFn(addProduct);
  const saveListing = useServerFn(saveListingFn);
  const publish = useServerFn(publishStorefrontFn);
  const loadAdmin = useServerFn(getStorefrontAdminFn);

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
    onSuccess: () => {
      toast.success("Shop published.");
      void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
      navigate({ to: "/dashboard", replace: true });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not publish")),
  });

  const canContinueName =
    step === 0 ? form.name.trim().length >= 2 : step === 2 ? form.currency.length === 3 : true;

  const slug = admin.data?.store?.slug;
  const publicUrl = slug ? storePublicUrl(slug) : "";

  if (businessId) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="border-b border-border px-4 py-4">
          <Logo to="/" />
        </header>
        <div className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
          <p className="text-sm text-muted-foreground">
            Welcome{workspace.data?.business.name ? `, ${workspace.data.business.name}` : ""}. You
            can finish later.
          </p>
          <ol className="mt-4 flex items-center gap-2" aria-label="Shop setup">
            {SHOP_STEPS.map((label, index) => (
              <li key={label} className="flex flex-1 items-center gap-2">
                <span
                  className={
                    index <= shopStep
                      ? "grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                      : "grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground"
                  }
                >
                  {index < shopStep ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
                </span>
                {index < SHOP_STEPS.length - 1 ? (
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                ) : null}
              </li>
            ))}
          </ol>

          {shopStep === 0 ? (
            <div className="mt-8 space-y-4">
              <h1 className="text-xl font-bold tracking-tight">Choose a storefront</h1>
              <p className="text-sm text-muted-foreground">
                Layout and type only. Your products stay when you switch later.
              </p>
              <div className="grid max-h-[28rem] gap-2 overflow-y-auto">
                {STORE_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setTemplateId(template.id)}
                    className="flex gap-3 rounded-lg border p-2 text-left"
                    style={{
                      borderColor: templateId === template.id ? template.defaultAccent : undefined,
                    }}
                  >
                    <TemplatePreview template={template} className="h-16 w-24 shrink-0" />
                    <span className="min-w-0">
                      <span className="font-semibold">{template.name}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {template.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <Button
                className="w-full gap-1.5"
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
            </div>
          ) : null}

          {shopStep === 1 ? (
            <form
              className="mt-8 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                productMutation.mutate();
              }}
            >
              <h1 className="text-xl font-bold tracking-tight">Add the first product</h1>
              <p className="text-sm text-muted-foreground">
                It is listed on the shop immediately. You can add a photo later in Inventory.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="first-product">Name</Label>
                <Input
                  id="first-product"
                  required
                  minLength={1}
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="2kg sugar"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="first-price">Selling price</Label>
                  <Input
                    id="first-price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={productPrice}
                    onChange={(e) => setProductPrice(e.target.value)}
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
                  />
                </div>
              </div>
              <Button
                className="w-full"
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
            </form>
          ) : null}

          {shopStep === 2 ? (
            <div className="mt-8 space-y-4">
              <h1 className="text-xl font-bold tracking-tight">How customers receive orders</h1>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={pickup}
                  onChange={(e) => setPickup(e.target.checked)}
                />
                Collection / pickup
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={delivery}
                  onChange={(e) => setDelivery(e.target.checked)}
                />
                Delivery
              </label>
              <p className="text-sm text-muted-foreground">
                Paynow keys are optional. Cash on pickup works without them. Add keys later under
                Storefront.
              </p>
              <Button
                className="w-full"
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
            </div>
          ) : null}

          {shopStep === 3 ? (
            <div className="mt-8 space-y-4">
              <h1 className="text-xl font-bold tracking-tight">Publish when you are ready</h1>
              <p className="text-sm text-muted-foreground">
                Draft shops are not public. Preview uses your listed products, not sample data.
              </p>
              {slug ? (
                <p className="text-sm">
                  Preview:{" "}
                  <Link to="/store/$slug" params={{ slug }} search={{ preview: "1" }}>
                    /store/{slug}
                  </Link>
                </p>
              ) : null}
              {publicUrl ? (
                <p className="break-all text-sm text-muted-foreground">{publicUrl}</p>
              ) : null}
              <Button
                className="w-full"
                disabled={publishMutation.isPending}
                onClick={() => publishMutation.mutate()}
              >
                {publishMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Publish shop
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => navigate({ to: "/dashboard", replace: true })}
              >
                Go to dashboard without publishing
              </Button>
            </div>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            className="mt-6 w-full"
            onClick={() => navigate({ to: "/dashboard", replace: true })}
          >
            Finish later
          </Button>
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
          {NAME_STEPS.map((label, index) => (
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
              {index < NAME_STEPS.length - 1 ? (
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              ) : null}
            </li>
          ))}
        </ol>

        <div className="mt-8">
          {step === 0 ? (
            <div className="space-y-3">
              <h1 className="text-xl font-bold tracking-tight">What is the shop called?</h1>
              <Label htmlFor="biz-name">Business name</Label>
              <Input
                id="biz-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Mbare Fresh"
              />
            </div>
          ) : null}
          {step === 1 ? (
            <div className="space-y-3">
              <h1 className="text-xl font-bold tracking-tight">What do you sell?</h1>
              <Select
                value={form.businessType}
                onValueChange={(value) => {
                  setForm({ ...form, businessType: value as CreateBusinessInput["businessType"] });
                  setTemplateId(templateForBusinessType(value));
                }}
              >
                <SelectTrigger>
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
            </div>
          ) : null}
          {step === 2 ? (
            <div className="space-y-3">
              <h1 className="text-xl font-bold tracking-tight">Prices are in</h1>
              <Select
                value={form.currency}
                onValueChange={(value) => setForm({ ...form, currency: value })}
              >
                <SelectTrigger>
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
          ) : null}
          {step === 3 ? (
            <div className="space-y-3">
              <h1 className="text-xl font-bold tracking-tight">Create {form.name}</h1>
              <p className="text-sm text-muted-foreground">
                {BUSINESS_TYPES.find((t) => t.value === form.businessType)?.label} · {form.currency}
              </p>
              <Button
                className="w-full"
                disabled={createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Create business
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-8 flex gap-2">
          {step > 0 ? (
            <Button variant="outline" className="gap-1" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="size-4" aria-hidden="true" /> Back
            </Button>
          ) : null}
          {step < 3 ? (
            <Button
              className="ml-auto gap-1"
              disabled={!canContinueName}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
