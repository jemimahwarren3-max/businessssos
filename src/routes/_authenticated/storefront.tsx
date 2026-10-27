import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { formatMoney, friendlyDateTime, readableError } from "@/lib/format";
import { shopHostsEnabled, storePublicUrl } from "@/lib/storefront/host";
import {
  generateShopDraftFn,
  getStorefrontAdminFn,
  hideReviewFn,
  listComplaintsFn,
  listListingReportsFn,
  listReviewsAdminFn,
  respondReviewFn,
  respondComplaintFn,
  respondListingReportFn,
  saveStorefrontFn,
} from "@/lib/storefront/storefront.functions";
import { getTemplate } from "@/lib/storefront/templates";
import { themeFromPalette } from "@/lib/storefront/theme";
import { StoreBuilder } from "@/components/storefront/store-builder";
import { StoreLaunchReadiness } from "@/components/storefront/store-launch-readiness";
import { BRAND } from "@/lib/brand";
import { OnlineOrdersFulfilmentPanel } from "@/components/storefront/online-orders-fulfilment-panel";
import type {
  AdminReviewItem,
  AdminStore,
  ComplaintItem,
  ListingReportItem,
} from "@/lib/storefront/contract";
import type { ShopDraft } from "@/lib/storefront/shop-draft";
import { StoreLaunchCentre } from "@/components/storefront/store-launch-centre";
import {
  StorefrontLoadError,
  StorefrontOverview,
  StorefrontOverviewSkeleton,
} from "@/components/storefront/storefront-overview";
import { getNotifyEmailFn } from "@/lib/business.functions";
import { defaultShopPatch } from "@/lib/storefront/onboarding-defaults";

export const Route = createFileRoute("/_authenticated/storefront")({
  head: () => ({
    meta: [{ title: `Storefront | ${BRAND.name}` }, { name: "robots", content: "noindex" }],
  }),
  component: StorefrontPage,
});

function StorefrontPage() {
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const load = useServerFn(getStorefrontAdminFn);
  const saveStore = useServerFn(saveStorefrontFn);
  const queryClient = useQueryClient();
  const admin = useQuery({
    queryKey: ["storefront", businessId],
    enabled: Boolean(businessId),
    queryFn: () => load({ data: { businessId: businessId! } }),
  });
  const fetchNotifyEmail = useServerFn(getNotifyEmailFn);
  const notifyEmail = useQuery({
    queryKey: ["notify-email", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchNotifyEmail({ data: { businessId: businessId! } }),
    staleTime: 60_000,
  });

  const createStoreMutation = useMutation({
    mutationFn: async () => {
      if (!businessId || !workspace.data) throw new Error("No business");
      const name = workspace.data.business.name.trim() || "My shop";
      return saveStore({
        data: defaultShopPatch({
          businessId,
          storeName: name,
          templateId: "modern-minimal",
        }),
      });
    },
    onSuccess: () => {
      toast.success("Store created — continue setup below");
      void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not create your store.")),
  });

  const workspaceData = workspace.data;
  if (!workspaceData) {
    return (
      <AppShell businessName="" role="" plan="" title="Storefront">
        <StorefrontOverviewSkeleton />
      </AppShell>
    );
  }

  const canManageSettings = workspaceData.permissions.includes("business.settings");
  const publicUrl =
    admin.data?.store?.slug != null && admin.data.store.slug !== ""
      ? storePublicUrl(admin.data.store.slug)
      : "";
  const showEditor = Boolean(admin.data && businessId);
  const showEmptyPayload =
    Boolean(businessId) && admin.isFetched && !admin.isLoading && !admin.isError && !admin.data;

  return (
    <AppShell
      businessName={workspaceData.business.name}
      role={workspaceData.role}
      plan={workspaceData.plan}
      isReadOnly={workspaceData.isReadOnly}
      billingEnabled={workspaceData.billingEnabled}
      title="My Online Store"
      subtitle="Launch centre, design, payments, and online orders — separate from invoices and POS."
    >
      {!businessId ? (
        <p className="text-sm text-muted-foreground">
          Finish business onboarding first, then return here to set up your shop.
        </p>
      ) : null}

      {businessId && admin.isLoading ? <StorefrontOverviewSkeleton /> : null}

      {businessId && admin.isError ? (
        <StorefrontLoadError
          message={readableError(admin.error as Error, "The storefront could not be loaded.")}
          retrying={admin.isFetching}
          onRetry={() => void admin.refetch()}
        />
      ) : null}

      {showEmptyPayload ? (
        <StorefrontLoadError
          message="Store data came back empty."
          retrying={admin.isFetching}
          onRetry={() => void admin.refetch()}
        />
      ) : null}

      {admin.data && businessId ? (
        <>
          <StorefrontOverview
            admin={admin.data}
            businessName={workspaceData.business.name}
            publicUrl={publicUrl}
            billingEnabled={workspaceData.billingEnabled}
            isOperateLocked={workspaceData.isOperateLocked}
            isReadOnly={workspaceData.isReadOnly}
            canManageSettings={canManageSettings}
            creatingStore={createStoreMutation.isPending}
            onCreateStore={() => createStoreMutation.mutate()}
            onScrollToSetup={() =>
              document.getElementById("store-builder")?.scrollIntoView({ behavior: "smooth" })
            }
          />
          {showEditor ? (
            <StorefrontEditor
              businessId={businessId}
              initial={admin.data}
              permissions={workspaceData.permissions}
              billingEnabled={workspaceData.billingEnabled}
              isOperateLocked={workspaceData.isOperateLocked}
              notificationsConfigured={notifyEmail.data === true}
            />
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}

function StorefrontEditor({
  businessId,
  initial,
  permissions,
  billingEnabled,
  isOperateLocked,
  notificationsConfigured,
}: {
  businessId: string;
  initial: AdminStore;
  permissions: string[];
  billingEnabled: boolean;
  isOperateLocked: boolean;
  notificationsConfigured: boolean;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveStorefrontFn);
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
  const [shopBrief, setShopBrief] = useState("");
  const [shopDraft, setShopDraft] = useState<ShopDraft | null>(null);
  const generateShopDraft = useServerFn(generateShopDraftFn);

  const applyAiDraftMutation = useMutation({
    mutationFn: async (draft: ShopDraft) => {
      if (!store) throw new Error("No store");
      const theme = themeFromPalette(draft.paletteId, getTemplate(draft.templateId).defaultAccent);
      return save({
        data: {
          businessId,
          storeName: draft.storeName,
          templateId: draft.templateId,
          tagline: draft.tagline,
          about: draft.about,
          heroTitle: draft.heroTitle,
          heroSubtitle: draft.heroSubtitle,
          accentColor: theme.accent,
          theme,
          content: {
            ...(store.content ?? {}),
            seoTitle: draft.seoTitle,
            seoDescription: draft.seoDescription,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("AI ideas saved to your store draft. Open the Store builder to review.");
      void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not apply AI ideas.")),
  });

  const shopDraftMutation = useMutation({
    mutationFn: () => generateShopDraft({ data: { businessId, brief: shopBrief } }),
    onSuccess: setShopDraft,
    onError: (error: Error) =>
      toast.error(readableError(error, "Could not generate a shop draft.")),
  });

  const publicUrl = store ? storePublicUrl(store.slug) : "";

  useEffect(() => {
    const id = window.location.hash.replace(/^#/, "");
    if (!id) return;
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-10">
      <StoreLaunchCentre
        admin={initial}
        billingEnabled={billingEnabled}
        isOperateLocked={isOperateLocked}
        notificationsConfigured={notificationsConfigured}
        {...(publicUrl ? { publicUrl } : {})}
      />

      <StoreLaunchReadiness
        businessId={businessId}
        {...(store?.slug ? { storeSlug: store.slug } : {})}
        canManage={permissions.includes("business.settings")}
      />

      {publicUrl ? (
        <p className="text-sm text-muted-foreground">
          Public link:{" "}
          <a className="font-medium text-foreground underline" href={publicUrl}>
            {publicUrl}
          </a>
          {shopHostsEnabled() ? (
            <span className="mt-1 block">
              Shoppers use *.{BRAND.domain} — your dashboard stays on {BRAND.domain}.
            </span>
          ) : null}
          {" · "}
          <Link to="/store/$slug" params={{ slug: store!.slug }} search={{ preview: "1" }}>
            Customer preview
          </Link>
        </p>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Open orders: {initial.metrics.openOrders} · Unpaid: {initial.metrics.unpaidOrders} ·
        Published out of stock: {initial.metrics.outOfStockPublished}
      </p>

      {permissions.includes("business.settings") && permissions.includes("ai.use") ? (
        <section className="surface space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-base font-semibold">Build a shop draft with AI</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Describe your products, customers, and the look you want. AI suggests shop copy, a
            design, SEO text, and a colour palette. Your brief and active product names/descriptions
            are sent to your configured AI provider. Review everything before applying; it will not
            save or publish your shop.
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
                <p className="mt-1 text-sm">
                  Search title: {shopDraft.seoTitle || shopDraft.storeName}
                </p>
                <p className="text-sm text-muted-foreground">
                  Search description: {shopDraft.seoDescription}
                </p>
              </div>
              <p className="text-sm">
                <span className="font-medium">{shopDraft.heroTitle}</span>
                {shopDraft.heroSubtitle ? `: ${shopDraft.heroSubtitle}` : ""}
              </p>
              <Button
                type="button"
                disabled={applyAiDraftMutation.isPending}
                onClick={() => applyAiDraftMutation.mutate(shopDraft)}
              >
                Apply ideas to store draft
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <StoreBuilder
        key={`${businessId}-${initial.store?.slug ?? "new"}-${initial.products.length}`}
        businessId={businessId}
        initial={initial}
        canManage={permissions.includes("business.settings")}
      />

      <OnlineOrdersFulfilmentPanel
        businessId={businessId}
        orders={initial.orders}
        storeName={store?.storeName ?? "Shop"}
      />

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
