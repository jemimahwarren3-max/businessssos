import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { formatMoney, friendlyDateTime, readableError } from "@/lib/format";
import { fulfilmentHowLabel, paymentHowLabel } from "@/lib/storefront/receipt";
import { shopHostsEnabled, storePublicUrl } from "@/lib/storefront/host";
import {
  getAdminOrderFn,
  generateShopDraftFn,
  getMarketplaceListingFn,
  getStorefrontAdminFn,
  hideReviewFn,
  listComplaintsFn,
  listListingReportsFn,
  listReviewsAdminFn,
  publishStorefrontFn,
  removeStorefrontProductImageFn,
  respondReviewFn,
  saveShopPaynowFn,
  respondComplaintFn,
  respondListingReportFn,
  setMarketplaceVisibleFn,
  saveListingFn,
  saveStorefrontFn,
  transitionOrderFn,
  uploadStorefrontProductImageFn,
} from "@/lib/storefront/storefront.functions";
import { STORE_TEMPLATES, getTemplate } from "@/lib/storefront/templates";
import { TEMPLATE_CATEGORIES } from "@/lib/storefront/templates";
import {
  STOREFRONT_THEME_SCHEMA,
  STORE_PALETTES,
  themeContrastWarnings,
  themeFromPalette,
  type StorefrontTheme,
} from "@/lib/storefront/theme";
import { TemplatePreview } from "@/components/storefront/template-preview";
import { LiveTemplatePreview } from "@/components/storefront/live-template-preview";
import { BRAND } from "@/lib/brand";
import { OrderReceipt } from "@/components/storefront/order-receipt";
import { ACTION_LABEL, fulfilmentActions } from "@/lib/storefront/transitions";
import {
  MANUAL_PAYMENT_LABELS,
  mergeManualMethods,
  type ManualPaymentMethod,
} from "@/lib/storefront/manual-payments";
import {
  HoursEditor,
  hoursStateFrom,
  weeklyHoursFromState,
} from "@/components/storefront/hours-editor";
import { parseHhmm, SHOP_TIMEZONE, type CollectionWindow } from "@/lib/storefront/clocks";
import type {
  AdminOrder,
  AdminReviewItem,
  AdminStore,
  ComplaintItem,
  ListingReportItem,
  StorefrontContent,
} from "@/lib/storefront/contract";
import type { ShopDraft } from "@/lib/storefront/shop-draft";

export const Route = createFileRoute("/_authenticated/storefront")({
  head: () => ({
    meta: [{ title: `Storefront | ${BRAND.name}` }, { name: "robots", content: "noindex" }],
  }),
  component: StorefrontPage,
});

const STEPS = [
  ["name", "Shop name and a phone number"],
  ["template", "Choose a design"],
  ["products", "Publish products from your existing catalogue"],
  ["payments", "Turn on a payment method customers can use"],
  ["fulfilment", "Turn on pickup, delivery, or quotes"],
  ["policies", "Write a short policy"],
  ["previewed", "Preview the shop"],
  ["published", "Publish the link"],
] as const;

function StorefrontPage() {
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const load = useServerFn(getStorefrontAdminFn);
  const admin = useQuery({
    queryKey: ["storefront", businessId],
    enabled: Boolean(businessId),
    queryFn: () => load({ data: { businessId: businessId! } }),
  });

  const workspaceData = workspace.data;
  if (!workspaceData) {
    return (
      <AppShell businessName="" role="" plan="" title="Storefront">
        <Skeleton className="h-64" />
      </AppShell>
    );
  }

  return (
    <AppShell
      businessName={workspaceData.business.name}
      role={workspaceData.role}
      plan={workspaceData.plan}
      isReadOnly={workspaceData.isReadOnly}
      billingEnabled={workspaceData.billingEnabled}
      title="Storefront"
      subtitle="Publish products you already sell. Customers get a receipt; you see the same one here. Manual payments stay seller-confirmed; automated seller Paynow is currently disabled."
    >
      {admin.isLoading ? <Skeleton className="h-64" /> : null}
      {admin.isError ? (
        <p className="text-sm text-destructive">
          {readableError(admin.error as Error, "The storefront could not be loaded.")}
        </p>
      ) : null}
      {admin.data && businessId ? (
        <StorefrontEditor
          businessId={businessId}
          initial={admin.data}
          permissions={workspaceData.permissions}
        />
      ) : null}
    </AppShell>
  );
}

function StorefrontEditor({
  businessId,
  initial,
  permissions,
}: {
  businessId: string;
  initial: AdminStore;
  permissions: string[];
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveStorefrontFn);
  const publish = useServerFn(publishStorefrontFn);
  const loadListing = useServerFn(getMarketplaceListingFn);
  const setListed = useServerFn(setMarketplaceVisibleFn);
  const saveListing = useServerFn(saveListingFn);
  const loadOrder = useServerFn(getAdminOrderFn);
  const transition = useServerFn(transitionOrderFn);
  const loadComplaints = useServerFn(listComplaintsFn);
  const respondComplaint = useServerFn(respondComplaintFn);
  const loadReviews = useServerFn(listReviewsAdminFn);
  const hideReview = useServerFn(hideReviewFn);
  const saveReviewResponse = useServerFn(respondReviewFn);
  const loadReports = useServerFn(listListingReportsFn);
  const respondReport = useServerFn(respondListingReportFn);
  const complaints = useQuery({
    queryKey: ["store-complaints", businessId],
    queryFn: () => loadComplaints({ data: { businessId } }),
  });
  const reviews = useQuery({
    queryKey: ["store-reviews", businessId],
    queryFn: () => loadReviews({ data: { businessId } }),
  });
  const listingReports = useQuery({
    queryKey: ["store-listing-reports", businessId],
    queryFn: () => loadReports({ data: { businessId } }),
  });
  const store = initial.store;
  const [storeName, setStoreName] = useState(store?.storeName ?? "");
  const [phone, setPhone] = useState(store?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(store?.whatsapp ?? "");
  const [tagline, setTagline] = useState(store?.tagline ?? "");
  const [about, setAbout] = useState(store?.about ?? "");
  const [email, setEmail] = useState(store?.email ?? "");
  const [socials, setSocials] = useState({
    instagram: store?.socials.instagram ?? "",
    facebook: store?.socials.facebook ?? "",
    website: store?.socials.website ?? "",
    tiktok: store?.socials.tiktok ?? "",
  });
  const [content, setContent] = useState<StorefrontContent>(
    () =>
      store?.content ?? {
        announcement: "",
        collections: [],
        promoTiles: [],
        faqs: [],
        deliveryPolicy: "",
        returnsPolicy: "",
        privacyPolicy: "",
      },
  );
  const [policies, setPolicies] = useState(store?.policies ?? "");
  const [hours, setHours] = useState(store?.hours ?? "");
  const [address, setAddress] = useState(store?.address ?? "");
  const [heroTitle, setHeroTitle] = useState(store?.heroTitle ?? "");
  const [heroSubtitle, setHeroSubtitle] = useState(store?.heroSubtitle ?? "");
  const [logoUrl, setLogoUrl] = useState(store?.logoUrl ?? "");
  const [templateId, setTemplateId] = useState(store?.templateId ?? "modern-minimal");
  const [theme, setTheme] = useState<StorefrontTheme>(() =>
    STOREFRONT_THEME_SCHEMA.parse(
      store?.theme ??
        themeFromPalette(
          getTemplate(store?.templateId ?? "modern-minimal").defaultPalette,
          store?.accentColor ?? undefined,
        ),
    ),
  );
  const [shopBrief, setShopBrief] = useState("");
  const [shopDraft, setShopDraft] = useState<ShopDraft | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateCategory, setTemplateCategory] = useState("all");
  const [previewViewport, setPreviewViewport] = useState<"mobile" | "desktop">("desktop");
  const [slug, setSlug] = useState(store?.slug ?? "");
  const [pickup, setPickup] = useState(store?.delivery.pickupEnabled ?? true);
  const [delivery, setDelivery] = useState(store?.delivery.deliveryEnabled ?? false);
  const [flatFee, setFlatFee] = useState(String(store?.delivery.flatFee ?? 0));
  const [freeOver, setFreeOver] = useState(
    store?.delivery.freeOver == null ? "" : String(store.delivery.freeOver),
  );
  const [minimum, setMinimum] = useState(String(store?.delivery.minimumOrder ?? 0));
  const [areas, setAreas] = useState(store?.delivery.areas ?? "");
  const [estimate, setEstimate] = useState(store?.delivery.estimate ?? "");
  const [quoteRequired, setQuoteRequired] = useState(store?.delivery.quoteRequired ?? false);
  const [autoAccept, setAutoAccept] = useState(store?.delivery.autoAccept ?? false);
  const [prepMinutes, setPrepMinutes] = useState(String(store?.delivery.prepMinutes ?? 0));
  const [cutoffTime, setCutoffTime] = useState(
    store?.delivery.cutoffTime ??
      (parseHhmm(store?.delivery.cutoff) ? (store?.delivery.cutoff ?? "") : ""),
  );
  const [hoursState, setHoursState] = useState(hoursStateFrom(store?.delivery.weeklyHours));
  const [windows, setWindows] = useState<CollectionWindow[]>(store?.delivery.windows ?? []);
  const [payPickup, setPayPickup] = useState(store?.payments.payOnPickup ?? true);
  const [payDelivery, setPayDelivery] = useState(store?.payments.payOnDelivery ?? false);
  const [quotes, setQuotes] = useState(store?.payments.quotes ?? false);
  const [cashCurrencies, setCashCurrencies] = useState(store?.payments.cashCurrencies ?? "");
  const [exactCash, setExactCash] = useState(store?.payments.exactCash ?? false);
  const [changeProvided, setChangeProvided] = useState(store?.payments.changeProvided ?? false);
  const [acceptPaynow, setAcceptPaynow] = useState(store?.payments.acceptPaynow ?? false);
  const [manualMethods, setManualMethods] = useState<ManualPaymentMethod[]>(() =>
    mergeManualMethods(store?.payments.manualMethods),
  );
  const [paynowId, setPaynowId] = useState("");
  const [paynowKey, setPaynowKey] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [checkedAccount, setCheckedAccount] = useState(false);
  const savePaynow = useServerFn(saveShopPaynowFn);
  const generateShopDraft = useServerFn(generateShopDraftFn);

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          businessId,
          storeName,
          slug: slug || undefined,
          templateId,
          tagline,
          about,
          email,
          socials,
          content,
          whatsapp,
          phone,
          address,
          logoUrl,
          accentColor: theme.accent,
          theme,
          heroTitle,
          heroSubtitle,
          policies,
          hours,
          delivery: {
            pickupEnabled: pickup,
            deliveryEnabled: delivery,
            flatFee: Number(flatFee) || 0,
            freeOver: freeOver === "" ? null : Number(freeOver),
            minimumOrder: Number(minimum) || 0,
            areas,
            estimate,
            quoteRequired,
            autoAccept,
            prepMinutes: Number(prepMinutes) || 0,
            cutoff: cutoffTime,
            cutoffTime: cutoffTime || null,
            collectionWindows: "",
            timezone: SHOP_TIMEZONE,
            weeklyHours: weeklyHoursFromState(hoursState),
            windows,
          },
          payments: {
            payOnPickup: payPickup,
            payOnDelivery: payDelivery,
            quotes,
            acceptPaynow,
            cashCurrencies,
            exactCash,
            changeProvided: changeProvided && !exactCash,
            manualMethods,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Shop draft saved");
      void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not save the shop")),
  });
  const shopDraftMutation = useMutation({
    mutationFn: () => generateShopDraft({ data: { businessId, brief: shopBrief } }),
    onSuccess: setShopDraft,
    onError: (error: Error) =>
      toast.error(readableError(error, "Could not generate a shop draft.")),
  });

  const listing = useQuery({
    queryKey: ["marketplace-listing", businessId],
    enabled: Boolean(businessId),
    queryFn: () => loadListing({ data: { businessId: businessId! } }),
  });
  const listingMutation = useMutation({
    mutationFn: (listed: boolean) => setListed({ data: { businessId: businessId!, listed } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["marketplace-listing", businessId], data);
      toast.success(
        data.listed ? "Shop listed in the marketplace" : "Shop hidden from the marketplace",
      );
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "Could not update the marketplace listing")),
  });
  const publishMutation = useMutation({
    mutationFn: (published: boolean) => publish({ data: { businessId, published } }),
    onSuccess: (_data, published) => {
      toast.success(published ? "Shop published" : "Shop unpublished");
      void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not change publication")),
  });

  const publicUrl = store ? storePublicUrl(store.slug) : "";

  return (
    <div className="space-y-10">
      <section className="surface space-y-3 p-4">
        <h2 className="text-base font-semibold">Setup</h2>
        <ol className="space-y-1 text-sm">
          {STEPS.map(([key, label]) => (
            <li key={key}>
              {initial.checklist[key] ? "Done" : "To do"}, {label}
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">
          Cash on pickup/delivery still works without Paynow. EcoCash, InnBucks, and bank
          instructions are only shown when you turn them on and fill in the details. Recording
          payment creates a sale after you check your own account. Shop Paynow, if later approved,
          uses this shop's keys, never the {BRAND.name} billing keys.
        </p>
        {publicUrl ? (
          <p className="text-sm">
            Link: <a href={publicUrl}>{publicUrl}</a>
            {shopHostsEnabled() ? (
              <span className="mt-1 block text-muted-foreground">
                Customers open this shop on its own subdomain. *.{BRAND.domain} must point at this
                service.
              </span>
            ) : (
              <span className="mt-1 block text-muted-foreground">
                This host cannot serve shop subdomains (Cloud Run .run.app). Shops stay at
                /store/your-slug here.
              </span>
            )}
            {" · "}
            <Link to="/store/$slug" params={{ slug: store!.slug }} search={{ preview: "1" }}>
              Preview with your published products
            </Link>
            <button
              className="ml-2 underline"
              type="button"
              onClick={() => void navigator.clipboard.writeText(publicUrl)}
            >
              Copy link
            </button>
          </p>
        ) : null}
        <p className="text-sm">
          Status: {store?.status ?? "not started"} · Open orders: {initial.metrics.openOrders} ·
          Unpaid: {initial.metrics.unpaidOrders} · Published products out of stock:{" "}
          {initial.metrics.outOfStockPublished} · Low stock: {initial.metrics.lowStockPublished}
        </p>
      </section>

      {permissions.includes("business.settings") && permissions.includes("ai.use") ? (
        <section className="surface space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-base font-semibold">Build a shop draft with AI</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Describe your products, customers, and the look you want. AI suggests shop copy, a
            design, and a colour palette. Review everything before applying; it will not save or
            publish your shop.
          </p>
          <Textarea
            value={shopBrief}
            onChange={(event) => setShopBrief(event.target.value)}
            maxLength={1200}
            placeholder="For example: I sell handmade skincare in Harare. I want a calm botanical look, clear product descriptions, and a friendly tone for gift buyers."
            aria-label="Describe the shop you want"
          />
          <Button
            type="button"
            variant="outline"
            disabled={shopDraftMutation.isPending || shopBrief.trim().length < 10}
            onClick={() => shopDraftMutation.mutate()}
          >
            {shopDraftMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
            Generate shop ideas
          </Button>
          {shopDraft ? (
            <div className="space-y-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">{shopDraft.storeName}</p>
                <p className="text-sm text-muted-foreground">{shopDraft.rationale}</p>
                <p className="mt-1 text-sm">
                  Suggested design: {getTemplate(shopDraft.templateId).name}
                </p>
              </div>
              <p className="text-sm">
                <span className="font-medium">{shopDraft.heroTitle}</span>
                {shopDraft.heroSubtitle ? `: ${shopDraft.heroSubtitle}` : ""}
              </p>
              <Button
                type="button"
                onClick={() => {
                  setStoreName(shopDraft.storeName);
                  setTagline(shopDraft.tagline);
                  setAbout(shopDraft.about);
                  setHeroTitle(shopDraft.heroTitle);
                  setHeroSubtitle(shopDraft.heroSubtitle);
                  setTemplateId(shopDraft.templateId);
                  setTheme(
                    themeFromPalette(
                      shopDraft.paletteId,
                      getTemplate(shopDraft.templateId).defaultAccent,
                    ),
                  );
                  toast.success("AI ideas added to your editable shop draft. Save when ready.");
                }}
              >
                Apply ideas to editor
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Design</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <Label htmlFor="template-search">Search designs</Label>
            <Input
              id="template-search"
              value={templateSearch}
              onChange={(event) => setTemplateSearch(event.target.value)}
              placeholder="Search layouts, categories, or styles"
            />
          </label>
          <label className="text-sm">
            <Label htmlFor="template-category">Category</Label>
            <select
              id="template-category"
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
              value={templateCategory}
              onChange={(event) => setTemplateCategory(event.target.value)}
            >
              <option value="all">All categories (60 designs)</option>
              {TEMPLATE_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} (6)
                </option>
              ))}
            </select>
          </label>
        </div>
        {(() => {
          const query = templateSearch.trim().toLowerCase();
          const templates = STORE_TEMPLATES.filter((template) => {
            const matchesCategory =
              templateCategory === "all" || template.category === templateCategory;
            const matchesSearch =
              !query ||
              `${template.name} ${template.categoryName} ${template.description} ${template.bestFor}`
                .toLowerCase()
                .includes(query);
            return matchesCategory && matchesSearch;
          });
          return (
            <>
              <p className="text-sm text-muted-foreground">
                Showing {templates.length} of {STORE_TEMPLATES.length} storefront designs.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setTemplateId(template.id)}
                    className="rounded-lg border p-3 text-left"
                    style={{
                      outline: templateId === template.id ? "2px solid var(--primary)" : undefined,
                    }}
                    aria-pressed={templateId === template.id}
                  >
                    <TemplatePreview template={template} className="mb-3 h-24" />
                    <p className="text-xs text-muted-foreground">{template.categoryName}</p>
                    <p className="font-medium">{template.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
                  </button>
                ))}
                {templates.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
                    No designs match this search. Try another phrase or category.
                  </p>
                ) : null}
              </div>
            </>
          );
        })()}
        <div className="space-y-3 rounded-xl border p-4">
          <div>
            <h3 className="font-semibold">Brand and storefront theme</h3>
            <p className="text-sm text-muted-foreground">
              Palette, colors, typography, logo, cover image, and visible sections update the
              preview below and are saved with this shop.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {STORE_PALETTES.map((palette) => (
              <button
                key={palette.id}
                type="button"
                className="flex items-center gap-2 rounded-lg border p-2 text-left text-sm"
                onClick={() =>
                  setTheme((current) => ({
                    ...themeFromPalette(palette.id),
                    fontPair: current.fontPair,
                    coverUrl: current.coverUrl,
                    sections: current.sections,
                  }))
                }
              >
                <span className="flex overflow-hidden rounded-full border">
                  {[palette.colors.primary, palette.colors.accent, palette.colors.background].map(
                    (color) => (
                      <span key={color} className="size-5" style={{ backgroundColor: color }} />
                    ),
                  )}
                </span>
                {palette.name}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["primary", "Primary"],
                ["accent", "Accent"],
                ["background", "Background"],
                ["surface", "Surface"],
                ["text", "Text"],
                ["button", "Button"],
                ["buttonText", "Button text"],
                ["link", "Link"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  aria-label={`${label} color`}
                  type="color"
                  value={theme[key]}
                  onChange={(event) =>
                    setTheme((current) => ({ ...current, [key]: event.target.value }))
                  }
                  className="size-9 cursor-pointer rounded border p-0.5"
                />
                <span>
                  {label}
                  <span className="block text-xs text-muted-foreground">{theme[key]}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <Label>Font pairing</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
                value={theme.fontPair}
                onChange={(event) =>
                  setTheme((current) => ({
                    ...current,
                    fontPair: event.target.value as StorefrontTheme["fontPair"],
                  }))
                }
              >
                <option value="system">Modern system</option>
                <option value="editorial">Editorial serif</option>
                <option value="humanist">Humanist</option>
                <option value="geometric">Geometric</option>
                <option value="rounded">Rounded</option>
                <option value="mono">Monospace</option>
              </select>
            </label>
            <label className="text-sm">
              <Label>Cover image URL (HTTPS)</Label>
              <Input
                value={theme.coverUrl}
                onChange={(event) =>
                  setTheme((current) => ({ ...current, coverUrl: event.target.value }))
                }
                placeholder="https://..."
              />
            </label>
            <label className="text-sm">
              <Label>Logo image URL (HTTPS)</Label>
              <Input
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                placeholder="https://..."
              />
            </label>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">Visible storefront sections</legend>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              {(
                [
                  ["hero", "Hero"],
                  ["categories", "Categories"],
                  ["featured", "Featured products"],
                  ["about", "About text"],
                  ["announcement", "Announcement bar"],
                  ["collections", "Curated collections"],
                  ["promoTiles", "Promotional tiles"],
                  ["faqs", "Frequently asked questions"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={theme.sections[key]}
                    onChange={(event) =>
                      setTheme((current) => ({
                        ...current,
                        sections: { ...current.sections, [key]: event.target.checked },
                      }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {themeContrastWarnings(theme).length > 0 ? (
            <div role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-medium">Check color contrast before publishing</p>
              <ul className="mt-1 list-inside list-disc">
                {themeContrastWarnings(theme).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-green-700">
              Selected text and button colors meet 4.5:1 contrast.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const template = getTemplate(templateId);
              setTheme(themeFromPalette(template.defaultPalette, template.defaultAccent));
            }}
          >
            Reset theme to template defaults
          </Button>
        </div>
        <div className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Storefront preview</h3>
              <p className="text-sm text-muted-foreground">
                Uses your current draft branding and published catalogue items.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={previewViewport === "desktop" ? "default" : "outline"}
                onClick={() => setPreviewViewport("desktop")}
                aria-pressed={previewViewport === "desktop"}
              >
                Desktop
              </Button>
              <Button
                type="button"
                size="sm"
                variant={previewViewport === "mobile" ? "default" : "outline"}
                onClick={() => setPreviewViewport("mobile")}
                aria-pressed={previewViewport === "mobile"}
              >
                Mobile
              </Button>
            </div>
          </div>
          <LiveTemplatePreview
            template={getTemplate(templateId)}
            storeName={storeName}
            currency={initial.currency}
            tagline={tagline}
            about={about}
            phone={phone}
            email={email}
            address={address}
            policies={policies}
            content={content}
            heroTitle={heroTitle}
            heroSubtitle={heroSubtitle}
            logoUrl={logoUrl}
            theme={theme}
            products={initial.products}
            viewport={previewViewport}
          />
        </div>
        <div className="space-y-4 rounded-xl border p-4">
          <div>
            <h3 className="font-semibold">Store content sections</h3>
            <p className="text-sm text-muted-foreground">
              Add useful shop information and merchandising. Empty sections stay hidden.
            </p>
          </div>
          <label className="block text-sm">
            Announcement bar
            <Input
              className="mt-1"
              maxLength={200}
              value={content.announcement}
              onChange={(event) =>
                setContent((current) => ({ ...current, announcement: event.target.value }))
              }
              placeholder="For example: Free delivery in Harare this weekend"
            />
          </label>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Curated collections</legend>
            {content.collections.map((collection, index) => (
              <div key={collection.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
                <Input
                  aria-label={`Collection ${index + 1} title`}
                  value={collection.title}
                  maxLength={80}
                  placeholder="Collection title"
                  onChange={(event) =>
                    setContent((current) => ({
                      ...current,
                      collections: current.collections.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, title: event.target.value } : item,
                      ),
                    }))
                  }
                />
                <Input
                  aria-label={`Collection ${index + 1} description`}
                  value={collection.description}
                  maxLength={200}
                  placeholder="Short description"
                  onChange={(event) =>
                    setContent((current) => ({
                      ...current,
                      collections: current.collections.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, description: event.target.value } : item,
                      ),
                    }))
                  }
                />
                <div className="flex gap-2">
                  <select
                    aria-label={`Collection ${index + 1} category`}
                    className="h-10 min-w-0 flex-1 rounded-md border bg-background px-2"
                    value={collection.categoryName}
                    onChange={(event) =>
                      setContent((current) => ({
                        ...current,
                        collections: current.collections.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, categoryName: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  >
                    {Array.from(
                      new Set(
                        initial.products
                          .map((product) => product.categoryName)
                          .filter((name): name is string => Boolean(name)),
                      ),
                    ).map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setContent((current) => ({
                        ...current,
                        collections: current.collections.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={
                content.collections.length >= 6 ||
                initial.products.every((product) => !product.categoryName)
              }
              onClick={() => {
                const categoryName =
                  initial.products.find((product) => product.categoryName)?.categoryName ?? "";
                setContent((current) => ({
                  ...current,
                  collections: [
                    ...current.collections,
                    { id: `collection-${Date.now()}`, title: "", description: "", categoryName },
                  ],
                }));
              }}
            >
              Add collection
            </Button>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Promotional tiles</legend>
            {content.promoTiles.map((tile, index) => (
              <div key={tile.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                <Input
                  aria-label={`Promotion ${index + 1} title`}
                  value={tile.title}
                  maxLength={80}
                  placeholder="Promotion title"
                  onChange={(event) =>
                    setContent((current) => ({
                      ...current,
                      promoTiles: current.promoTiles.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, title: event.target.value } : item,
                      ),
                    }))
                  }
                />
                <Input
                  aria-label={`Promotion ${index + 1} subtitle`}
                  value={tile.subtitle}
                  maxLength={160}
                  placeholder="Short supporting text"
                  onChange={(event) =>
                    setContent((current) => ({
                      ...current,
                      promoTiles: current.promoTiles.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, subtitle: event.target.value } : item,
                      ),
                    }))
                  }
                />
                <Input
                  aria-label={`Promotion ${index + 1} image URL`}
                  value={tile.imageUrl}
                  maxLength={500}
                  placeholder="https:// image URL"
                  onChange={(event) =>
                    setContent((current) => ({
                      ...current,
                      promoTiles: current.promoTiles.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, imageUrl: event.target.value } : item,
                      ),
                    }))
                  }
                />
                <div className="flex gap-2">
                  <select
                    aria-label={`Promotion ${index + 1} category`}
                    className="h-10 min-w-0 flex-1 rounded-md border bg-background px-2"
                    value={tile.categoryName}
                    onChange={(event) =>
                      setContent((current) => ({
                        ...current,
                        promoTiles: current.promoTiles.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, categoryName: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  >
                    {Array.from(
                      new Set(
                        initial.products
                          .map((product) => product.categoryName)
                          .filter((name): name is string => Boolean(name)),
                      ),
                    ).map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setContent((current) => ({
                        ...current,
                        promoTiles: current.promoTiles.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={
                content.promoTiles.length >= 4 ||
                initial.products.every((product) => !product.categoryName)
              }
              onClick={() => {
                const categoryName =
                  initial.products.find((product) => product.categoryName)?.categoryName ?? "";
                setContent((current) => ({
                  ...current,
                  promoTiles: [
                    ...current.promoTiles,
                    {
                      id: `promotion-${Date.now()}`,
                      title: "",
                      subtitle: "",
                      imageUrl: "",
                      categoryName,
                    },
                  ],
                }));
              }}
            >
              Add promotion
            </Button>
          </fieldset>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Frequently asked questions</legend>
            {content.faqs.map((faq, index) => (
              <div key={`${index}-${faq.question}`} className="grid gap-2 rounded-lg border p-3">
                <Input
                  aria-label={`FAQ ${index + 1} question`}
                  value={faq.question}
                  maxLength={200}
                  placeholder="Question"
                  onChange={(event) =>
                    setContent((current) => ({
                      ...current,
                      faqs: current.faqs.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, question: event.target.value } : item,
                      ),
                    }))
                  }
                />
                <Textarea
                  aria-label={`FAQ ${index + 1} answer`}
                  value={faq.answer}
                  maxLength={1000}
                  placeholder="Answer"
                  onChange={(event) =>
                    setContent((current) => ({
                      ...current,
                      faqs: current.faqs.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, answer: event.target.value } : item,
                      ),
                    }))
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  className="justify-self-start"
                  onClick={() =>
                    setContent((current) => ({
                      ...current,
                      faqs: current.faqs.filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
                >
                  Remove FAQ
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={content.faqs.length >= 12}
              onClick={() =>
                setContent((current) => ({
                  ...current,
                  faqs: [...current.faqs, { question: "", answer: "" }],
                }))
              }
            >
              Add FAQ
            </Button>
          </fieldset>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              Delivery information
              <Textarea
                maxLength={2000}
                value={content.deliveryPolicy}
                onChange={(event) =>
                  setContent((current) => ({ ...current, deliveryPolicy: event.target.value }))
                }
              />
            </label>
            <label className="text-sm">
              Returns and refunds
              <Textarea
                maxLength={2000}
                value={content.returnsPolicy}
                onChange={(event) =>
                  setContent((current) => ({ ...current, returnsPolicy: event.target.value }))
                }
              />
            </label>
            <label className="text-sm">
              Privacy information
              <Textarea
                maxLength={2000}
                value={content.privacyPolicy}
                onChange={(event) =>
                  setContent((current) => ({ ...current, privacyPolicy: event.target.value }))
                }
              />
            </label>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Switching design keeps your existing products, orders, and store. Save the draft to apply
          these changes to the customer-facing storefront.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          <Label>Shop name</Label>
          <Input value={storeName} onChange={(event) => setStoreName(event.target.value)} />
        </label>
        <label className="text-sm">
          <Label>Link</Label>
          <Input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="your-shop"
          />
        </label>
        <label className="text-sm">
          <Label>Phone</Label>
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label className="text-sm">
          <Label>WhatsApp number</Label>
          <Input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} />
        </label>
        <label className="text-sm">
          <Label>Support email</Label>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="hello@example.com"
          />
        </label>
        <label className="text-sm">
          <Label>Website</Label>
          <Input
            type="url"
            value={socials.website}
            onChange={(event) =>
              setSocials((current) => ({ ...current, website: event.target.value }))
            }
            placeholder="https://..."
          />
        </label>
        <label className="text-sm">
          <Label>Instagram</Label>
          <Input
            type="url"
            value={socials.instagram}
            onChange={(event) =>
              setSocials((current) => ({ ...current, instagram: event.target.value }))
            }
            placeholder="https://..."
          />
        </label>
        <label className="text-sm">
          <Label>Facebook</Label>
          <Input
            type="url"
            value={socials.facebook}
            onChange={(event) =>
              setSocials((current) => ({ ...current, facebook: event.target.value }))
            }
            placeholder="https://..."
          />
        </label>
        <label className="text-sm">
          <Label>TikTok</Label>
          <Input
            type="url"
            value={socials.tiktok}
            onChange={(event) =>
              setSocials((current) => ({ ...current, tiktok: event.target.value }))
            }
            placeholder="https://..."
          />
        </label>
        <label className="text-sm md:col-span-2">
          <Label>Tagline</Label>
          <Input value={tagline} onChange={(event) => setTagline(event.target.value)} />
        </label>
        <label className="text-sm md:col-span-2">
          <Label>About</Label>
          <Textarea value={about} onChange={(event) => setAbout(event.target.value)} />
        </label>
        <label className="text-sm">
          <Label>Hero title</Label>
          <Input value={heroTitle} onChange={(event) => setHeroTitle(event.target.value)} />
        </label>
        <label className="text-sm md:col-span-2">
          <Label>Hero subtitle</Label>
          <Input value={heroSubtitle} onChange={(event) => setHeroSubtitle(event.target.value)} />
        </label>
        <label className="text-sm md:col-span-2">
          <Label>Address</Label>
          <Input value={address} onChange={(event) => setAddress(event.target.value)} />
        </label>
        <label className="text-sm md:col-span-2">
          <Label>Hours note on the shop</Label>
          <Textarea value={hours} onChange={(event) => setHours(event.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">
            Shown to customers. The weekday table below is what checkout enforces.
          </p>
        </label>
        <label className="text-sm md:col-span-2">
          <Label>Policies</Label>
          <Textarea value={policies} onChange={(event) => setPolicies(event.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={pickup}
            onChange={(event) => setPickup(event.target.checked)}
          />{" "}
          Pickup
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={delivery}
            onChange={(event) => setDelivery(event.target.checked)}
          />{" "}
          Local delivery
        </label>
        <label className="text-sm">
          <Label>Flat delivery fee</Label>
          <Input value={flatFee} onChange={(event) => setFlatFee(event.target.value)} />
        </label>
        <label className="text-sm">
          <Label>Free delivery over</Label>
          <Input
            value={freeOver}
            onChange={(event) => setFreeOver(event.target.value)}
            placeholder="Leave blank if none"
          />
        </label>
        <label className="text-sm">
          <Label>Minimum order</Label>
          <Input value={minimum} onChange={(event) => setMinimum(event.target.value)} />
        </label>
        <label className="text-sm">
          <Label>Delivery areas</Label>
          <Input value={areas} onChange={(event) => setAreas(event.target.value)} />
        </label>
        <label className="text-sm md:col-span-2">
          <Label>Delivery estimate</Label>
          <Input value={estimate} onChange={(event) => setEstimate(event.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={quoteRequired}
            onChange={(event) => setQuoteRequired(event.target.checked)}
          />{" "}
          Quote delivery instead of charging a fixed fee
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={autoAccept}
            onChange={(event) => setAutoAccept(event.target.checked)}
          />{" "}
          Accept eligible orders automatically. Payment is still unpaid until you record it.
        </label>
        <label className="text-sm">
          <Label>Preparation time (minutes)</Label>
          <Input value={prepMinutes} onChange={(event) => setPrepMinutes(event.target.value)} />
        </label>
        <HoursEditor
          hours={hoursState}
          onHours={setHoursState}
          windows={windows}
          onWindows={setWindows}
          cutoffTime={cutoffTime}
          onCutoffTime={setCutoffTime}
        />
        {store?.delivery.cutoff && !parseHhmm(store.delivery.cutoff) ? (
          <p className="text-sm text-muted-foreground md:col-span-2">
            Previous cut-off note (not a clock): {store.delivery.cutoff}
          </p>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={payPickup}
            onChange={(event) => setPayPickup(event.target.checked)}
          />{" "}
          Pay cash on collection
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={payDelivery}
            disabled={quoteRequired}
            onChange={(event) => setPayDelivery(event.target.checked)}
          />{" "}
          Pay cash on delivery
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={quotes}
            onChange={(event) => setQuotes(event.target.checked)}
          />{" "}
          Quote requests
        </label>
        <div className="space-y-3 text-sm md:col-span-2">
          <p className="font-medium">Payment instructions (not automatic)</p>
          <p className="text-muted-foreground">
            Customers see only the methods you enable. A customer payment note never marks an order
            paid. You still check EcoCash, InnBucks, or the bank yourself, then record payment.
          </p>
          <p className="text-muted-foreground">
            Configure only payment details and account arrangements you are authorized to use.
            Customers pay you directly; Kwetuu does not receive or verify manual payments.
          </p>
          {manualMethods.map((method, index) => (
            <div key={method.id} className="space-y-2 rounded-md border p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={method.enabled}
                  onChange={(event) =>
                    setManualMethods((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, enabled: event.target.checked } : row,
                      ),
                    )
                  }
                />{" "}
                {MANUAL_PAYMENT_LABELS[method.kind]}
              </label>
              <label className="block">
                <Label>Account name</Label>
                <Input
                  value={method.accountName}
                  onChange={(event) =>
                    setManualMethods((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, accountName: event.target.value } : row,
                      ),
                    )
                  }
                />
              </label>
              <label className="block">
                <Label>
                  {method.kind === "bank_transfer" ? "Account number" : "Number or account"}
                </Label>
                <Input
                  value={method.accountDetail}
                  onChange={(event) =>
                    setManualMethods((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, accountDetail: event.target.value } : row,
                      ),
                    )
                  }
                />
              </label>
              <label className="block">
                <Label>Instructions</Label>
                <Textarea
                  value={method.instructions}
                  onChange={(event) =>
                    setManualMethods((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, instructions: event.target.value } : row,
                      ),
                    )
                  }
                />
              </label>
            </div>
          ))}
        </div>
        <div className="space-y-2 text-sm md:col-span-2">
          <p className="font-medium">This shop's Paynow</p>
          <p className="text-muted-foreground">
            Paynow keys belong to this shop and are encrypted on the server. Automated checkout
            remains unavailable until Paynow confirms in writing that this platform arrangement is
            permitted and Kwetuu enables it.
          </p>
          {!store?.payments.paynowAvailable ? (
            <p className="text-sm text-amber-700">
              Automated seller Paynow checkout is currently disabled. Saving seller credentials does
              not enable payments.
            </p>
          ) : null}
          <p>
            {store?.payments.paynow ? "Shop Paynow keys are saved." : "No Paynow keys saved yet."}
          </p>
          <label className="block">
            <Label>Paynow integration ID</Label>
            <Input value={paynowId} onChange={(event) => setPaynowId(event.target.value)} />
          </label>
          <label className="block">
            <Label>Paynow integration key</Label>
            <Input
              type="password"
              autoComplete="off"
              value={paynowKey}
              onChange={(event) => setPaynowKey(event.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={!paynowId || !paynowKey}
            onClick={() =>
              void savePaynow({
                data: { businessId, integrationId: paynowId, integrationKey: paynowKey },
              })
                .then(() => {
                  toast.success("Paynow linked for this shop");
                  setPaynowKey("");
                  void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
                })
                .catch((error: Error) =>
                  toast.error(readableError(error, "Paynow could not be saved.")),
                )
            }
          >
            Save Paynow keys
          </Button>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={acceptPaynow}
              disabled={!store?.payments.paynowAvailable}
              onChange={(event) => setAcceptPaynow(event.target.checked)}
            />{" "}
            Let customers pay with this shop's Paynow at checkout
          </label>
        </div>
        <label className="text-sm">
          <Label>Cash currencies accepted</Label>
          <Input
            value={cashCurrencies}
            onChange={(event) => setCashCurrencies(event.target.value)}
            placeholder="USD, ZiG"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={exactCash}
            onChange={(event) => {
              setExactCash(event.target.checked);
              if (event.target.checked) setChangeProvided(false);
            }}
          />{" "}
          Exact cash required
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={changeProvided && !exactCash}
            disabled={exactCash}
            onChange={(event) => setChangeProvided(event.target.checked)}
          />{" "}
          Shop can give change
        </label>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            Save draft
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const template = getTemplate(templateId);
              setTheme(themeFromPalette(template.defaultPalette, template.defaultAccent));
              setHeroTitle("");
              setHeroSubtitle("");
            }}
          >
            Reset hero and theme
          </Button>
          <Button
            type="button"
            onClick={() => publishMutation.mutate(store?.status !== "published")}
            disabled={!store || publishMutation.isPending}
          >
            {store?.status === "published" ? "Unpublish" : "Publish"}
          </Button>
          {listing.data?.hasStore ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={listing.data.listed}
                disabled={listingMutation.isPending}
                onChange={(event) => listingMutation.mutate(event.target.checked)}
              />
              Show this shop on the BusinessOS marketplace
            </label>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Products</h2>
        <p className="text-sm text-muted-foreground">
          These are the same products as Inventory. Publishing one here does not copy it.
        </p>
        <StorefrontProductTable
          businessId={businessId}
          products={initial.products}
          onToggle={(product) =>
            void saveListing({
              data: {
                businessId,
                productId: product.id,
                published: !product.published,
                details: product.details,
                sizeGuide: product.sizeGuide,
                minQty: product.minQty,
                maxQty: product.maxQty,
                featured: product.featured,
              },
            })
              .then(() => queryClient.invalidateQueries({ queryKey: ["storefront", businessId] }))
              .catch((error: Error) =>
                toast.error(readableError(error, "Could not update the product")),
              )
          }
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Online orders</h2>
        <p className="text-sm text-muted-foreground">
          Purchase history for this shop. Open an order to see the same receipt the customer gets.
          Unpaid orders are not in sales reports. Record cash or a manual payment only after you
          have the money. A customer payment note is not confirmation. Paynow marks paid after
          Paynow confirms.
        </p>
        <ul className="divide-y rounded-lg border">
          {initial.orders.length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">No online orders yet.</li>
          ) : null}
          {initial.orders.map((order) => (
            <li
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
            >
              <button
                type="button"
                className="text-left"
                onClick={() =>
                  void loadOrder({ data: { businessId, orderId: order.id } }).then((next) => {
                    setSelectedOrder(next);
                    setCheckedAccount(false);
                    setPaymentReference("");
                  })
                }
              >
                <span className="font-medium">{order.reference}</span> · {order.customerName}
                <span className="mt-1 block text-muted-foreground">
                  {friendlyDateTime(order.createdAt)} · {formatMoney(order.total, order.currency)}
                </span>
                <span className="mt-1 block text-muted-foreground">
                  {order.itemSummary ?? `${order.itemCount} item(s)`} ·{" "}
                  {fulfilmentHowLabel(order.fulfilmentMethod)} ·{" "}
                  {paymentHowLabel(order.paymentMethod, order.paymentStatus === "paid")}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {selectedOrder ? (
          <div className="rounded-lg border p-4 text-sm">
            <OrderReceipt
              audience="merchant"
              order={{
                ...selectedOrder,
                storeName: store?.storeName ?? "Shop",
                paid: selectedOrder.paymentStatus === "paid" || Boolean(selectedOrder.saleId),
              }}
            />
            {selectedOrder.terms?.paymentProof?.reference || selectedOrder.proofUrl ? (
              <div className="mt-3 rounded-md border p-3 text-sm">
                <p className="font-medium">Customer payment proof</p>
                <p>
                  {formatMoney(selectedOrder.total, selectedOrder.currency)} ·{" "}
                  {selectedOrder.paymentMethod}
                </p>
                {selectedOrder.proofUrl ? (
                  selectedOrder.terms?.paymentProof?.storagePath?.endsWith(".pdf") ? (
                    <a className="mt-2 inline-block underline" href={selectedOrder.proofUrl}>
                      Open PDF
                    </a>
                  ) : (
                    <img
                      alt="Customer payment screenshot"
                      className="mt-2 max-h-72 rounded border"
                      src={selectedOrder.proofUrl}
                    />
                  )
                ) : null}
                {selectedOrder.terms?.paymentProof?.reference ? (
                  <p className="mt-2">{selectedOrder.terms.paymentProof.reference}</p>
                ) : null}
                {selectedOrder.terms?.paymentProof?.note ? (
                  <p className="mt-1">{selectedOrder.terms.paymentProof.note}</p>
                ) : null}
                <p className="mt-1 text-muted-foreground">
                  Look at this file, then check the money in EcoCash, InnBucks, or the bank. The
                  screenshot is not confirmation.
                </p>
                {selectedOrder.terms?.paymentProof?.rejectReason ? (
                  <p className="mt-1">Rejection: {selectedOrder.terms.paymentProof.rejectReason}</p>
                ) : null}
              </div>
            ) : null}
            {selectedOrder.paymentStatus !== "paid" &&
            selectedOrder.paymentMethod !== "paynow" &&
            (selectedOrder.paymentMethod !== "quote" ||
              selectedOrder.fulfilmentStatus !== "awaiting_confirmation") ? (
              <div className="mt-3 space-y-2 rounded-md border p-3">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={checkedAccount}
                    onChange={(event) => setCheckedAccount(event.target.checked)}
                  />
                  <span>
                    I received {formatMoney(selectedOrder.total, selectedOrder.currency)} directly
                    and checked my own account or received the cash.
                  </span>
                </label>
                {selectedOrder.paymentMethod === "manual" ||
                selectedOrder.paymentMethod === "quote" ? (
                  <label className="block">
                    Payment reference (optional)
                    <Input
                      className="mt-1"
                      maxLength={80}
                      value={paymentReference}
                      onChange={(event) => setPaymentReference(event.target.value)}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {fulfilmentActions({
                fulfilmentStatus: selectedOrder.fulfilmentStatus,
                fulfilmentMethod: selectedOrder.fulfilmentMethod,
                paymentMethod: selectedOrder.paymentMethod,
                paymentStatus: selectedOrder.paymentStatus,
                saleId: selectedOrder.saleId,
              }).map((action) => (
                <Button
                  key={action}
                  size="sm"
                  variant={action === "cancel" || action === "reject_proof" ? "outline" : "default"}
                  disabled={action === "mark_paid" && !checkedAccount}
                  onClick={() =>
                    void transition({
                      data: {
                        businessId,
                        orderId: selectedOrder.id,
                        action,
                        paymentReference:
                          action === "mark_paid" ? paymentReference.trim() : undefined,
                        reason:
                          action === "reject_proof"
                            ? "The shop could not confirm this payment. Send a new reference."
                            : undefined,
                      },
                    })
                      .then((next) => {
                        setSelectedOrder(next);
                        setCheckedAccount(false);
                        setPaymentReference("");
                        void queryClient.invalidateQueries({
                          queryKey: ["storefront", businessId],
                        });
                      })
                      .catch((error: Error) =>
                        toast.error(readableError(error, "Could not update the order")),
                      )
                  }
                >
                  {action === "mark_paid" &&
                  (selectedOrder.paymentMethod === "manual" ||
                    selectedOrder.paymentMethod === "pay_on_pickup" ||
                    selectedOrder.paymentMethod === "pay_on_delivery")
                    ? "Record payment after checking your account"
                    : ACTION_LABEL[action]}
                </Button>
              ))}
            </div>
            <ul className="mt-3 space-y-1 text-muted-foreground">
              {selectedOrder.events.map((event) => (
                <li key={event.createdAt + event.eventType}>{event.message}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Verified purchase reviews</h2>
        <p className="text-sm text-muted-foreground">
          Shoppers can review a line only with the order access code, after the order is ready, out
          for delivery, or completed. Hiding a review removes it from the public product page. It
          does not delete the record.
        </p>
        {reviews.isError ? (
          <p className="text-sm text-muted-foreground">
            {readableError(
              reviews.error as Error,
              "Reviews could not be loaded. Apply the latest database update if this shop is new.",
            )}
          </p>
        ) : null}
        <ul className="divide-y rounded-lg border">
          {(reviews.data ?? []).length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">No verified purchase reviews yet.</li>
          ) : null}
          {(reviews.data ?? []).map((item: AdminReviewItem) => (
            <li key={item.id} className="space-y-2 p-3 text-sm">
              <p className="font-medium">
                {item.displayName} · {item.rating}/5 · {item.status}
                {item.productName ? ` · ${item.productName}` : ""}
                {item.orderReference ? ` · ${item.orderReference}` : ""}
              </p>
              <p>{item.body}</p>
              <ReviewResponseEditor
                key={`${item.id}-${item.merchantRespondedAt ?? "new"}`}
                id={item.id}
                response={item.merchantResponse ?? ""}
                onSave={async (response) => {
                  const rows = await saveReviewResponse({
                    data: { businessId, reviewId: item.id, response },
                  });
                  queryClient.setQueryData(["store-reviews", businessId], rows);
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void hideReview({
                    data: {
                      businessId,
                      reviewId: item.id,
                      hidden: item.status !== "hidden",
                    },
                  })
                    .then((rows) => {
                      queryClient.setQueryData(["store-reviews", businessId], rows);
                    })
                    .catch((error: Error) =>
                      toast.error(readableError(error, "Could not update the review")),
                    )
                }
              >
                {item.status === "hidden" ? "Show on product page" : "Hide from product page"}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Listing reports</h2>
        <p className="text-sm text-muted-foreground">
          Anyone can report a published shop or product. Reports are not a public ranking.
        </p>
        {listingReports.isError ? (
          <p className="text-sm text-muted-foreground">
            {readableError(
              listingReports.error as Error,
              "Listing reports could not be loaded. Apply the latest database update if this shop is new.",
            )}
          </p>
        ) : null}
        <ul className="divide-y rounded-lg border">
          {(listingReports.data ?? []).length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">No listing reports yet.</li>
          ) : null}
          {(listingReports.data ?? []).map((item: ListingReportItem) => (
            <li key={item.id} className="space-y-2 p-3 text-sm">
              <p className="font-medium">
                {item.reason} · {item.status}
                {item.productName ? ` · ${item.productName}` : " · shop"}
              </p>
              <p>{item.detail}</p>
              {item.reporterContact ? (
                <p className="text-muted-foreground">{item.reporterContact}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {(["reviewing", "resolved"] as const).map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void respondReport({
                        data: {
                          businessId,
                          reportId: item.id,
                          status,
                          note: item.merchantNote ?? "",
                        },
                      })
                        .then((rows) => {
                          queryClient.setQueryData(["store-listing-reports", businessId], rows);
                        })
                        .catch((error: Error) =>
                          toast.error(readableError(error, "Could not update the report")),
                        )
                    }
                  >
                    Mark {status}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Customer reports</h2>
        <p className="text-sm text-muted-foreground">
          Shoppers can report a problem from checkout or the order page. Resolving a report here
          does not automatically refund money.
        </p>
        {complaints.isError ? (
          <p className="text-sm text-muted-foreground">
            {readableError(
              complaints.error as Error,
              "Customer reports could not be loaded. Apply the latest database update if this shop is new.",
            )}
          </p>
        ) : null}
        <ul className="divide-y rounded-lg border">
          {(complaints.data ?? []).length === 0 ? (
            <li className="p-3 text-sm text-muted-foreground">No customer reports yet.</li>
          ) : null}
          {(complaints.data ?? []).map((item: ComplaintItem) => (
            <li key={item.id} className="space-y-2 p-3 text-sm">
              <p className="font-medium">
                {item.customerName} · {item.status}
                {item.orderReference ? ` · ${item.orderReference}` : ""}
              </p>
              <p>{item.message}</p>
              {item.merchantNote ? (
                <p className="text-muted-foreground">{item.merchantNote}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {(["reviewing", "resolved"] as const).map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void respondComplaint({
                        data: {
                          businessId,
                          complaintId: item.id,
                          status,
                          note: item.merchantNote ?? "",
                        },
                      })
                        .then((rows) => {
                          queryClient.setQueryData(["store-complaints", businessId], rows);
                        })
                        .catch((error: Error) =>
                          toast.error(readableError(error, "Could not update the report")),
                        )
                    }
                  >
                    Mark {status}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ReviewResponseEditor({
  id,
  response,
  onSave,
}: {
  id: string;
  response: string;
  onSave: (response: string) => Promise<void>;
}) {
  const [value, setValue] = useState(response);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(value.trim());
    } catch (reason) {
      setError(readableError(reason as Error, "Could not save the shop response."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-2" onSubmit={(event) => void submit(event)}>
      <Label htmlFor={`review-response-${id}`}>Public shop response</Label>
      <Textarea
        id={`review-response-${id}`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        minLength={2}
        maxLength={1000}
        required
        placeholder="Reply to this review"
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        size="sm"
        variant="outline"
        type="submit"
        disabled={saving || value.trim().length < 2}
      >
        {saving ? "Saving…" : response ? "Update response" : "Reply publicly"}
      </Button>
    </form>
  );
}

type StorefrontProduct = AdminStore["products"][number];

function StorefrontProductTable({
  businessId,
  products,
  onToggle,
}: {
  businessId: string;
  products: StorefrontProduct[];
  onToggle: (product: StorefrontProduct) => void;
}) {
  const queryClient = useQueryClient();
  const uploadImage = useServerFn(uploadStorefrontProductImageFn);
  const removeImage = useServerFn(removeStorefrontProductImageFn);
  const uploadMutation = useMutation({
    mutationFn: ({ productId, file }: { productId: string; file: File }) => {
      const data = new FormData();
      data.set("businessId", businessId);
      data.set("productId", productId);
      data.set("file", file);
      return uploadImage({ data });
    },
    onSuccess: () => {
      toast.success("Product photo added");
      void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not add the product photo")),
  });
  const removeMutation = useMutation({
    mutationFn: (input: { productId: string; imageUrl: string }) =>
      removeImage({ data: { businessId, ...input } }),
    onSuccess: () => {
      toast.success("Product photo removed");
      void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "Could not remove the product photo")),
  });
  const columns: ColumnDef<StorefrontProduct, unknown>[] = [
    {
      accessorKey: "name",
      header: "Product",
      cell: ({ row }) => (
        <div>
          {row.original.name}
          <span className="block text-xs text-muted-foreground">{row.original.categoryName}</span>
        </div>
      ),
    },
    {
      accessorKey: "stock",
      header: "Stock",
    },
    {
      id: "photos",
      header: "Product photos",
      enableSorting: false,
      cell: ({ row }) => {
        const product = row.original;
        const uploading =
          uploadMutation.isPending && uploadMutation.variables?.productId === product.id;
        const removing =
          removeMutation.isPending && removeMutation.variables?.productId === product.id;
        return (
          <div className="flex max-w-64 flex-wrap items-center gap-2">
            {product.galleryUrls.map((imageUrl, index) => (
              <div key={imageUrl} className="relative size-12 overflow-hidden rounded border">
                <img
                  src={imageUrl}
                  alt={`${product.name} photo ${index + 2}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  className="absolute right-0 top-0 rounded-bl bg-background/90 px-1 text-xs"
                  aria-label={`Remove ${product.name} photo ${index + 2}`}
                  disabled={removing}
                  onClick={() => removeMutation.mutate({ productId: product.id, imageUrl })}
                >
                  ×
                </button>
              </div>
            ))}
            {product.published && product.galleryUrls.length < 8 ? (
              <label className="cursor-pointer rounded-md border px-2 py-1 text-xs hover:bg-muted">
                {uploading ? "Uploading…" : "Add photo"}
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label={`Add a product photo for ${product.name}`}
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadMutation.mutate({ productId: product.id, file });
                    event.target.value = "";
                  }}
                />
              </label>
            ) : product.published ? (
              <span className="text-xs text-muted-foreground">8 extra photos max</span>
            ) : (
              <span className="text-xs text-muted-foreground">Publish to add photos</span>
            )}
          </div>
        );
      },
    },
    {
      id: "online",
      header: "Online",
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          size="sm"
          variant={row.original.published ? "secondary" : "outline"}
          onClick={() => onToggle(row.original)}
        >
          {row.original.published ? "Unpublish" : "Publish"}
        </Button>
      ),
    },
  ];
  return <DataTable columns={columns} data={products} caption="Storefront products" />;
}
