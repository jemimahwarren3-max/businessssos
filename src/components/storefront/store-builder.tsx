import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplatePreview } from "@/components/storefront/template-preview";
import { LiveTemplatePreview } from "@/components/storefront/live-template-preview";
import { OnlineProductsManager } from "@/components/storefront/online-products-manager";
import { StoreBrandingUploadField } from "@/components/storefront/store-branding-upload";
import {
  HoursEditor,
  hoursStateFrom,
  weeklyHoursFromState,
} from "@/components/storefront/hours-editor";
import {
  BUILDER_TEMPLATE_CHOICES,
  builderChoiceForTemplateId,
  resolveBuilderTemplateId,
} from "@/lib/storefront/builder-templates";
import {
  MANUAL_PAYMENT_LABELS,
  mergeManualMethods,
  type ManualPaymentMethod,
} from "@/lib/storefront/manual-payments";
import { parseHhmm, SHOP_TIMEZONE, type CollectionWindow } from "@/lib/storefront/clocks";
import type { AdminStore, StorefrontContent } from "@/lib/storefront/contract";
import { readableError } from "@/lib/format";
import { storePublicUrl } from "@/lib/storefront/host";
import {
  getMarketplaceListingFn,
  getStoreLaunchEligibilityFn,
  publishStorefrontFn,
  saveStorefrontFn,
  setMarketplaceVisibleFn,
  uploadStorefrontBrandingFn,
} from "@/lib/storefront/storefront.functions";
import { getTemplate, type TemplateId } from "@/lib/storefront/templates";
import {
  STOREFRONT_THEME_SCHEMA,
  STORE_PALETTES,
  themeContrastWarnings,
  themeFromPalette,
  type StorefrontTheme,
} from "@/lib/storefront/theme";
import {
  snapshotsEqual,
  type StoreBuilderSnapshot,
} from "@/lib/storefront/store-builder-state";

function snapshotFromState(input: {
  storeName: string;
  slug: string;
  phone: string;
  whatsapp: string;
  tagline: string;
  about: string;
  email: string;
  socials: { instagram: string; facebook: string; website: string; tiktok: string };
  content: StorefrontContent;
  policies: string;
  hours: string;
  address: string;
  heroTitle: string;
  heroSubtitle: string;
  logoUrl: string;
  templateId: string;
  theme: StorefrontTheme;
  pickup: boolean;
  delivery: boolean;
  flatFee: string;
  freeOver: string;
  minimum: string;
  areas: string;
  estimate: string;
  quoteRequired: boolean;
  autoAccept: boolean;
  prepMinutes: string;
  cutoffTime: string;
  hoursState: ReturnType<typeof hoursStateFrom>;
  windows: CollectionWindow[];
  payPickup: boolean;
  payDelivery: boolean;
  quotes: boolean;
  cashCurrencies: string;
  exactCash: boolean;
  changeProvided: boolean;
  acceptPaynow: boolean;
  manualMethods: ManualPaymentMethod[];
}): StoreBuilderSnapshot {
  return { ...input };
}

export function StoreBuilder({
  businessId,
  initial,
  canManage,
}: {
  businessId: string;
  initial: AdminStore;
  canManage: boolean;
}) {
  const store = initial.store!;
  const queryClient = useQueryClient();
  const save = useServerFn(saveStorefrontFn);
  const publish = useServerFn(publishStorefrontFn);
  const uploadBranding = useServerFn(uploadStorefrontBrandingFn);
  const loadListing = useServerFn(getMarketplaceListingFn);
  const setListed = useServerFn(setMarketplaceVisibleFn);

  const [storeName, setStoreName] = useState(store.storeName ?? "");
  const [phone, setPhone] = useState(store.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(store.whatsapp ?? "");
  const [tagline, setTagline] = useState(store.tagline ?? "");
  const [about, setAbout] = useState(store.about ?? "");
  const [email, setEmail] = useState(store.email ?? "");
  const [socials, setSocials] = useState({
    instagram: store.socials.instagram ?? "",
    facebook: store.socials.facebook ?? "",
    website: store.socials.website ?? "",
    tiktok: store.socials.tiktok ?? "",
  });
  const [content, setContent] = useState<StorefrontContent>(
    () =>
      store.content ?? {
        announcement: "",
        seoTitle: "",
        seoDescription: "",
        collections: [],
        promoTiles: [],
        faqs: [],
        deliveryPolicy: "",
        returnsPolicy: "",
        privacyPolicy: "",
      },
  );
  const [policies, setPolicies] = useState(store.policies ?? "");
  const [hours, setHours] = useState(store.hours ?? "");
  const [address, setAddress] = useState(store.address ?? "");
  const [heroTitle, setHeroTitle] = useState(store.heroTitle ?? "");
  const [heroSubtitle, setHeroSubtitle] = useState(store.heroSubtitle ?? "");
  const [logoUrl, setLogoUrl] = useState(store.logoUrl ?? "");
  const [templateId, setTemplateId] = useState<TemplateId>(
    resolveBuilderTemplateId(store.templateId ?? "modern-minimal"),
  );
  const [theme, setTheme] = useState<StorefrontTheme>(() =>
    STOREFRONT_THEME_SCHEMA.parse(
      store.theme ??
        themeFromPalette(
          getTemplate(store.templateId ?? "modern-minimal").defaultPalette,
          store.accentColor ?? undefined,
        ),
    ),
  );
  const [previewViewport, setPreviewViewport] = useState<"mobile" | "desktop">("desktop");
  const [slug, setSlug] = useState(store.slug ?? "");
  const [pickup, setPickup] = useState(store.delivery.pickupEnabled ?? true);
  const [delivery, setDelivery] = useState(store.delivery.deliveryEnabled ?? false);
  const [flatFee, setFlatFee] = useState(String(store.delivery.flatFee ?? 0));
  const [freeOver, setFreeOver] = useState(
    store.delivery.freeOver == null ? "" : String(store.delivery.freeOver),
  );
  const [minimum, setMinimum] = useState(String(store.delivery.minimumOrder ?? 0));
  const [areas, setAreas] = useState(store.delivery.areas ?? "");
  const [estimate, setEstimate] = useState(store.delivery.estimate ?? "");
  const [quoteRequired, setQuoteRequired] = useState(store.delivery.quoteRequired ?? false);
  const [autoAccept, setAutoAccept] = useState(store.delivery.autoAccept ?? false);
  const [prepMinutes, setPrepMinutes] = useState(String(store.delivery.prepMinutes ?? 0));
  const [cutoffTime, setCutoffTime] = useState(
    store.delivery.cutoffTime ??
      (parseHhmm(store.delivery.cutoff) ? (store.delivery.cutoff ?? "") : ""),
  );
  const [hoursState, setHoursState] = useState(hoursStateFrom(store.delivery.weeklyHours));
  const [windows, setWindows] = useState<CollectionWindow[]>(store.delivery.windows ?? []);
  const [payPickup, setPayPickup] = useState(store.payments.payOnPickup ?? true);
  const [payDelivery, setPayDelivery] = useState(store.payments.payOnDelivery ?? false);
  const [quotes, setQuotes] = useState(store.payments.quotes ?? false);
  const [cashCurrencies, setCashCurrencies] = useState(store.payments.cashCurrencies ?? "");
  const [exactCash, setExactCash] = useState(store.payments.exactCash ?? false);
  const [changeProvided, setChangeProvided] = useState(store.payments.changeProvided ?? false);
  const [acceptPaynow, setAcceptPaynow] = useState(store.payments.acceptPaynow ?? false);
  const [manualMethods, setManualMethods] = useState<ManualPaymentMethod[]>(() =>
    mergeManualMethods(store.payments.manualMethods),
  );
  const savedRef = useRef<StoreBuilderSnapshot | null>(null);
  if (savedRef.current === null) {
    savedRef.current = snapshotFromState({
      storeName: store.storeName ?? "",
      slug: store.slug ?? "",
      phone: store.phone ?? "",
      whatsapp: store.whatsapp ?? "",
      tagline: store.tagline ?? "",
      about: store.about ?? "",
      email: store.email ?? "",
      socials: {
        instagram: store.socials.instagram ?? "",
        facebook: store.socials.facebook ?? "",
        website: store.socials.website ?? "",
        tiktok: store.socials.tiktok ?? "",
      },
      content: store.content ?? content,
      policies: store.policies ?? "",
      hours: store.hours ?? "",
      address: store.address ?? "",
      heroTitle: store.heroTitle ?? "",
      heroSubtitle: store.heroSubtitle ?? "",
      logoUrl: store.logoUrl ?? "",
      templateId: resolveBuilderTemplateId(store.templateId ?? "modern-minimal"),
      theme: STOREFRONT_THEME_SCHEMA.parse(store.theme ?? theme),
      pickup: store.delivery.pickupEnabled ?? true,
      delivery: store.delivery.deliveryEnabled ?? false,
      flatFee: String(store.delivery.flatFee ?? 0),
      freeOver: store.delivery.freeOver == null ? "" : String(store.delivery.freeOver),
      minimum: String(store.delivery.minimumOrder ?? 0),
      areas: store.delivery.areas ?? "",
      estimate: store.delivery.estimate ?? "",
      quoteRequired: store.delivery.quoteRequired ?? false,
      autoAccept: store.delivery.autoAccept ?? false,
      prepMinutes: String(store.delivery.prepMinutes ?? 0),
      cutoffTime:
        store.delivery.cutoffTime ??
        (parseHhmm(store.delivery.cutoff) ? (store.delivery.cutoff ?? "") : ""),
      hoursState: hoursStateFrom(store.delivery.weeklyHours),
      windows: store.delivery.windows ?? [],
      payPickup: store.payments.payOnPickup ?? true,
      payDelivery: store.payments.payOnDelivery ?? false,
      quotes: store.payments.quotes ?? false,
      cashCurrencies: store.payments.cashCurrencies ?? "",
      exactCash: store.payments.exactCash ?? false,
      changeProvided: store.payments.changeProvided ?? false,
      acceptPaynow: store.payments.acceptPaynow ?? false,
      manualMethods: mergeManualMethods(store.payments.manualMethods),
    });
  }

  const currentSnapshot = useMemo(
    () =>
      snapshotFromState({
        storeName,
        slug,
        phone,
        whatsapp,
        tagline,
        about,
        email,
        socials,
        content,
        policies,
        hours,
        address,
        heroTitle,
        heroSubtitle,
        logoUrl,
        templateId,
        theme,
        pickup,
        delivery,
        flatFee,
        freeOver,
        minimum,
        areas,
        estimate,
        quoteRequired,
        autoAccept,
        prepMinutes,
        cutoffTime,
        hoursState,
        windows,
        payPickup,
        payDelivery,
        quotes,
        cashCurrencies,
        exactCash,
        changeProvided,
        acceptPaynow,
        manualMethods,
      }),
    [
      storeName,
      slug,
      phone,
      whatsapp,
      tagline,
      about,
      email,
      socials,
      content,
      policies,
      hours,
      address,
      heroTitle,
      heroSubtitle,
      logoUrl,
      templateId,
      theme,
      pickup,
      delivery,
      flatFee,
      freeOver,
      minimum,
      areas,
      estimate,
      quoteRequired,
      autoAccept,
      prepMinutes,
      cutoffTime,
      hoursState,
      windows,
      payPickup,
      payDelivery,
      quotes,
      cashCurrencies,
      exactCash,
      changeProvided,
      acceptPaynow,
      manualMethods,
    ],
  );

  const isDirty = savedRef.current
    ? !snapshotsEqual(currentSnapshot, savedRef.current)
    : false;

  const applySnapshot = useCallback((snap: StoreBuilderSnapshot) => {
    setStoreName(snap.storeName);
    setSlug(snap.slug);
    setPhone(snap.phone);
    setWhatsapp(snap.whatsapp);
    setTagline(snap.tagline);
    setAbout(snap.about);
    setEmail(snap.email);
    setSocials(snap.socials);
    setContent(snap.content);
    setPolicies(snap.policies);
    setHours(snap.hours);
    setAddress(snap.address);
    setHeroTitle(snap.heroTitle);
    setHeroSubtitle(snap.heroSubtitle);
    setLogoUrl(snap.logoUrl);
    setTemplateId(resolveBuilderTemplateId(snap.templateId));
    setTheme(snap.theme);
    setPickup(snap.pickup);
    setDelivery(snap.delivery);
    setFlatFee(snap.flatFee);
    setFreeOver(snap.freeOver);
    setMinimum(snap.minimum);
    setAreas(snap.areas);
    setEstimate(snap.estimate);
    setQuoteRequired(snap.quoteRequired);
    setAutoAccept(snap.autoAccept);
    setPrepMinutes(snap.prepMinutes);
    setCutoffTime(snap.cutoffTime);
    setHoursState(snap.hoursState);
    setWindows(snap.windows);
    setPayPickup(snap.payPickup);
    setPayDelivery(snap.payDelivery);
    setQuotes(snap.quotes);
    setCashCurrencies(snap.cashCurrencies);
    setExactCash(snap.exactCash);
    setChangeProvided(snap.changeProvided);
    setAcceptPaynow(snap.acceptPaynow);
    setManualMethods(snap.manualMethods);
  }, []);

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
      savedRef.current = currentSnapshot;
      toast.success("Store draft saved");
      void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not save the shop")),
  });

  const publishMutation = useMutation({
    mutationFn: (published: boolean) => publish({ data: { businessId, published } }),
    onSuccess: (_data, published) => {
      toast.success(published ? "Shop published" : "Shop unpublished");
      void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not change publication")),
  });

  const loadEligibility = useServerFn(getStoreLaunchEligibilityFn);
  const eligibility = useQuery({
    queryKey: ["store-launch-eligibility", businessId],
    queryFn: () => loadEligibility({ data: { businessId } }),
  });

  const listing = useQuery({
    queryKey: ["marketplace-listing", businessId],
    queryFn: () => loadListing({ data: { businessId } }),
  });
  const listingMutation = useMutation({
    mutationFn: (listed: boolean) => setListed({ data: { businessId, listed } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["marketplace-listing", businessId], data);
      toast.success(
        data.listed ? "Shop listed in the marketplace" : "Shop hidden from the marketplace",
      );
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "Could not update the marketplace listing")),
  });

  const template = getTemplate(templateId);
  const builderChoice = builderChoiceForTemplateId(templateId);
  const publicUrl = store.slug ? storePublicUrl(store.slug) : "";
  const disabled = !canManage;

  return (
    <section id="store-builder" className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Store builder</h2>
          <p className="text-sm text-muted-foreground">
            Design, branding, online products, and customer-facing information. Preview uses your
            real catalogue — nothing is published until you choose Publish.
          </p>
        </div>
        {publicUrl ? (
          <Link
            to="/store/$slug"
            params={{ slug: store.slug }}
            search={{ preview: "1" }}
            className="text-sm font-medium underline"
          >
            Open full preview
          </Link>
        ) : null}
      </div>

      {isDirty ? (
        <p
          className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
        >
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          You have unsaved changes.
        </p>
      ) : null}

      <Tabs defaultValue="design" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="design">Design</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="info">Store information</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="design" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose a layout. Each theme changes hero, navigation, and product grid on your live shop.
          </p>
          <div className="grid gap-4 lg:grid-cols-3">
            {BUILDER_TEMPLATE_CHOICES.map((choice) => {
              const previewTemplate = getTemplate(choice.templateId);
              const selected = choice.templateId === templateId;
              return (
                <button
                  key={choice.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setTemplateId(choice.templateId);
                    setTheme((current) =>
                      themeFromPalette(previewTemplate.defaultPalette, previewTemplate.defaultAccent),
                    );
                  }}
                  className="rounded-xl border p-3 text-left transition-shadow hover:shadow-sm disabled:opacity-60"
                  style={{ outline: selected ? "2px solid var(--primary)" : undefined }}
                  aria-pressed={selected}
                >
                  <TemplatePreview template={previewTemplate} className="mb-3 h-32" />
                  <p className="font-semibold">{choice.title}</p>
                  <p className="text-xs text-muted-foreground">{choice.subtitle}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{choice.description}</p>
                </button>
              );
            })}
          </div>
          <fieldset className="rounded-xl border p-4">
            <legend className="px-1 text-sm font-medium">Visible storefront sections</legend>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              {(
                [
                  ["hero", "Hero"],
                  ["categories", "Categories"],
                  ["featured", "Featured products"],
                  ["about", "About & contact"],
                  ["announcement", "Announcement bar"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={disabled}
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
        </TabsContent>

        <TabsContent value="branding" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <Label>Store display name</Label>
              <Input
                value={storeName}
                disabled={disabled}
                onChange={(event) => setStoreName(event.target.value)}
              />
            </label>
            <label className="text-sm">
              <Label>Tagline</Label>
              <Input value={tagline} disabled={disabled} onChange={(event) => setTagline(event.target.value)} />
            </label>
            <label className="text-sm sm:col-span-2">
              <Label>Store description</Label>
              <Textarea value={about} disabled={disabled} onChange={(event) => setAbout(event.target.value)} />
            </label>
            <label className="text-sm">
              <Label>Hero title</Label>
              <Input value={heroTitle} disabled={disabled} onChange={(event) => setHeroTitle(event.target.value)} />
            </label>
            <label className="text-sm">
              <Label>Hero subtitle</Label>
              <Input
                value={heroSubtitle}
                disabled={disabled}
                onChange={(event) => setHeroSubtitle(event.target.value)}
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <StoreBrandingUploadField
              label="Logo"
              kind="logo"
              businessId={businessId}
              currentUrl={logoUrl}
              disabled={disabled}
              uploadFn={(formData) => uploadBranding({ data: formData })}
              onUploaded={setLogoUrl}
            />
            <StoreBrandingUploadField
              label="Banner / hero image"
              kind="cover"
              businessId={businessId}
              currentUrl={theme.coverUrl}
              disabled={disabled}
              uploadFn={(formData) => uploadBranding({ data: formData })}
              onUploaded={(url) => setTheme((current) => ({ ...current, coverUrl: url }))}
            />
          </div>
          <label className="text-sm">
            <Label>Logo URL (optional HTTPS)</Label>
            <Input value={logoUrl} disabled={disabled} onChange={(event) => setLogoUrl(event.target.value)} />
          </label>
          <label className="text-sm">
            <Label>Banner URL (optional HTTPS)</Label>
            <Input
              value={theme.coverUrl}
              disabled={disabled}
              onChange={(event) => setTheme((current) => ({ ...current, coverUrl: event.target.value }))}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {STORE_PALETTES.map((palette) => (
              <button
                key={palette.id}
                type="button"
                disabled={disabled}
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
                ["surface", "Secondary (surface)"],
                ["background", "Page background"],
                ["text", "Text"],
                ["button", "Button"],
                ["buttonText", "Button text"],
                ["link", "Links"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  aria-label={`${label} color`}
                  type="color"
                  disabled={disabled}
                  value={theme[key]}
                  onChange={(event) =>
                    setTheme((current) => ({ ...current, [key]: event.target.value }))
                  }
                  className="size-9 cursor-pointer rounded border p-0.5"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <label className="text-sm block max-w-md">
            <Label>Font</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
              disabled={disabled}
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
          {themeContrastWarnings(theme).length > 0 ? (
            <div role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-medium">Check color contrast before publishing</p>
              <ul className="mt-1 list-inside list-disc">
                {themeContrastWarnings(theme).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              const t = getTemplate(templateId);
              setTheme(themeFromPalette(t.defaultPalette, t.defaultAccent));
            }}
          >
            Reset branding to template defaults
          </Button>
        </TabsContent>

        <TabsContent value="products">
          <OnlineProductsManager
            businessId={businessId}
            currency={initial.currency}
            categories={initial.categories}
            products={initial.products}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="info" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <Label>Shop link (slug)</Label>
              <Input value={slug} disabled={disabled} onChange={(event) => setSlug(event.target.value)} />
            </label>
            <label className="text-sm">
              <Label>Phone</Label>
              <Input value={phone} disabled={disabled} onChange={(event) => setPhone(event.target.value)} />
            </label>
            <label className="text-sm">
              <Label>WhatsApp</Label>
              <Input value={whatsapp} disabled={disabled} onChange={(event) => setWhatsapp(event.target.value)} />
            </label>
            <label className="text-sm">
              <Label>Support email</Label>
              <Input type="email" value={email} disabled={disabled} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="text-sm md:col-span-2">
              <Label>Address / service area</Label>
              <Input value={address} disabled={disabled} onChange={(event) => setAddress(event.target.value)} />
            </label>
            <label className="text-sm md:col-span-2">
              <Label>Opening hours note</Label>
              <Textarea value={hours} disabled={disabled} onChange={(event) => setHours(event.target.value)} />
            </label>
          </div>
          <fieldset className="grid gap-3 md:grid-cols-2">
            <legend className="px-1 text-sm font-medium">Social links</legend>
            {(
              [
                ["website", "Website"],
                ["instagram", "Instagram"],
                ["facebook", "Facebook"],
                ["tiktok", "TikTok"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm">
                <Label>{label}</Label>
                <Input
                  value={socials[key]}
                  disabled={disabled}
                  onChange={(event) => setSocials((current) => ({ ...current, [key]: event.target.value }))}
                />
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={disabled} checked={pickup} onChange={(e) => setPickup(e.target.checked)} />
              Collection / pickup
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={disabled}
                checked={delivery}
                onChange={(e) => setDelivery(e.target.checked)}
              />
              Local delivery
            </label>
            <label className="text-sm">
              <Label>Flat delivery fee</Label>
              <Input value={flatFee} disabled={disabled} onChange={(event) => setFlatFee(event.target.value)} />
            </label>
            <label className="text-sm">
              <Label>Delivery areas</Label>
              <Input value={areas} disabled={disabled} onChange={(event) => setAreas(event.target.value)} />
            </label>
            <label className="text-sm md:col-span-2">
              <Label>Delivery information (customer-facing)</Label>
              <Textarea
                maxLength={2000}
                disabled={disabled}
                value={content.deliveryPolicy}
                onChange={(event) =>
                  setContent((current) => ({ ...current, deliveryPolicy: event.target.value }))
                }
              />
            </label>
            <label className="text-sm md:col-span-2">
              <Label>Returns and refunds</Label>
              <Textarea
                maxLength={2000}
                disabled={disabled}
                value={content.returnsPolicy}
                onChange={(event) =>
                  setContent((current) => ({ ...current, returnsPolicy: event.target.value }))
                }
              />
            </label>
            <label className="text-sm md:col-span-2">
              <Label>Other policies</Label>
              <Textarea value={policies} disabled={disabled} onChange={(event) => setPolicies(event.target.value)} />
            </label>
          </div>
          <HoursEditor
            hours={hoursState}
            onHours={setHoursState}
            windows={windows}
            onWindows={setWindows}
            cutoffTime={cutoffTime}
            onCutoffTime={setCutoffTime}
          />
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <p className="font-medium">Payment instructions (seller-confirmed, not automatic)</p>
            <p className="text-muted-foreground">
              Customers pay you directly. Kwetuu does not verify EcoCash, bank, or cash payments.
            </p>
            {manualMethods.map((method, index) => (
              <div key={method.id} className="space-y-2 rounded-md border p-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={method.enabled}
                    onChange={(event) =>
                      setManualMethods((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, enabled: event.target.checked } : row,
                        ),
                      )
                    }
                  />
                  {MANUAL_PAYMENT_LABELS[method.kind]}
                </label>
                <Input
                  aria-label={`${MANUAL_PAYMENT_LABELS[method.kind]} account name`}
                  disabled={disabled}
                  value={method.accountName}
                  onChange={(event) =>
                    setManualMethods((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, accountName: event.target.value } : row,
                      ),
                    )
                  }
                />
                <Textarea
                  aria-label={`${MANUAL_PAYMENT_LABELS[method.kind]} instructions`}
                  disabled={disabled}
                  value={method.instructions}
                  onChange={(event) =>
                    setManualMethods((current) =>
                      current.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, instructions: event.target.value } : row,
                      ),
                    )
                  }
                />
              </div>
            ))}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled}
                checked={payPickup}
                onChange={(event) => setPayPickup(event.target.checked)}
              />
              Pay cash on collection
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled}
                checked={payDelivery}
                onChange={(event) => setPayDelivery(event.target.checked)}
              />
              Pay cash on delivery
            </label>
            {!store.payments.paynowAvailable ? (
              <p className="text-amber-700">Automated Paynow checkout is disabled on this platform.</p>
            ) : null}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={disabled || !store.payments.paynowAvailable}
                checked={acceptPaynow}
                onChange={(event) => setAcceptPaynow(event.target.checked)}
              />
              Offer this shop&apos;s Paynow at checkout (when enabled platform-wide)
            </label>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Live preview of <strong>{builderChoice.title}</strong> using published online products
              only. Draft shop — not visible to the public.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={previewViewport === "desktop" ? "default" : "outline"}
                onClick={() => setPreviewViewport("desktop")}
              >
                Desktop
              </Button>
              <Button
                type="button"
                size="sm"
                variant={previewViewport === "mobile" ? "default" : "outline"}
                onClick={() => setPreviewViewport("mobile")}
              >
                Mobile
              </Button>
            </div>
          </div>
          <LiveTemplatePreview
            template={template}
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
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t bg-background/95 py-3 backdrop-blur">
        <Button type="button" disabled={disabled || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save draft
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !isDirty}
          onClick={() => savedRef.current && applySnapshot(savedRef.current)}
        >
          Discard changes
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={
            disabled ||
            publishMutation.isPending ||
            (store.status !== "published" && eligibility.data?.state !== "eligible_to_publish")
          }
          title={
            store.status !== "published" && eligibility.data?.state !== "eligible_to_publish"
              ? "Complete launch requirements above before publishing"
              : undefined
          }
          onClick={() => publishMutation.mutate(store.status !== "published")}
        >
          {store.status === "published" ? "Unpublish" : "Publish store"}
        </Button>
        {listing.data?.hasStore ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={listingMutation.isPending}
              checked={listing.data.listed}
              onChange={(event) => listingMutation.mutate(event.target.checked)}
            />
            Marketplace listing
          </label>
        ) : null}
      </div>
    </section>
  );
}
