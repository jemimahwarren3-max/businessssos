import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Copy, Eye, Link2, ShoppingCart, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import {
  generateMarketingDraftFn,
  getDailyBusinessBriefingFn,
  getMarketingCampaignsFn,
  getMarketingProductsFn,
  getStoreGrowthMetricsFn,
  saveMarketingCampaignFn,
} from "@/lib/growth.functions";
import type { MarketingChannel, MarketingDraft } from "@/lib/growth.contract";
import { formatMoney, formatNumber, readableError } from "@/lib/format";
import { getStorefrontAdminFn } from "@/lib/storefront/storefront.functions";
import { storePublicUrl } from "@/lib/storefront/host";

export const Route = createFileRoute("/_authenticated/growth")({
  head: () => ({
    meta: [
      { title: "Grow | BusinessOS AI" },
      {
        name: "description",
        content: "Understand store visits, measure campaigns, and plan your next business action.",
      },
      { property: "og:title", content: "Grow | BusinessOS AI" },
      {
        property: "og:description",
        content: "Store analytics and an AI-assisted marketing studio, grounded in your records.",
      },
    ],
  }),
  component: Growth,
});

const CHANNELS: { value: MarketingChannel; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "google", label: "Google" },
  { value: "email", label: "Email" },
  { value: "other", label: "Other" },
];

function makeCampaignUrl(slug: string, campaignId: string, channel: string) {
  const url = new URL(storePublicUrl(slug));
  url.searchParams.set("utm_source", channel);
  url.searchParams.set("utm_campaign", campaignId);
  return url.toString();
}

async function copyCampaignLink(link: string) {
  try {
    if (!navigator.clipboard) throw new Error("Clipboard access is unavailable.");
    await navigator.clipboard.writeText(link);
    toast.success("Trackable link copied.");
  } catch (error) {
    console.error("[growth] could not copy campaign link", error);
    toast.error("The link could not be copied. Select and copy it instead.");
  }
}

function Growth() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const canReadAnalytics = hasPermission(workspace.data, "reports.financial");
  const canManageMarketing = hasPermission(workspace.data, "business.settings");
  const canUseAI = hasPermission(workspace.data, "ai.use");
  const [days, setDays] = useState(30);
  const [channel, setChannel] = useState<MarketingChannel>("whatsapp");
  const [objective, setObjective] = useState("");
  const [productId, setProductId] = useState("");
  const [draft, setDraft] = useState<MarketingDraft | null>(null);

  const fetchMetrics = useServerFn(getStoreGrowthMetricsFn);
  const fetchCampaigns = useServerFn(getMarketingCampaignsFn);
  const fetchProducts = useServerFn(getMarketingProductsFn);
  const fetchStorefront = useServerFn(getStorefrontAdminFn);
  const generateDraft = useServerFn(generateMarketingDraftFn);
  const saveCampaign = useServerFn(saveMarketingCampaignFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const metrics = useQuery({
    queryKey: ["growth-metrics", businessId, days],
    enabled: Boolean(businessId) && canReadAnalytics,
    queryFn: () => fetchMetrics({ data: { businessId: businessId!, days } }),
  });
  const campaigns = useQuery({
    queryKey: ["marketing-campaigns", businessId],
    enabled: Boolean(businessId) && canManageMarketing,
    queryFn: () => fetchCampaigns({ data: { businessId: businessId! } }),
  });
  const products = useQuery({
    queryKey: ["marketing-products", businessId],
    enabled: Boolean(businessId) && canManageMarketing,
    queryFn: () => fetchProducts({ data: { businessId: businessId! } }),
  });
  const storefront = useQuery({
    queryKey: ["storefront", businessId],
    enabled: Boolean(businessId) && canManageMarketing,
    queryFn: () => fetchStorefront({ data: { businessId: businessId! } }),
  });

  const generate = useMutation({
    mutationFn: () =>
      generateDraft({
        data: {
          businessId: businessId!,
          channel,
          objective,
          productId: productId || null,
        },
      }),
    onSuccess: (result) => {
      setDraft(result);
      toast.success("Campaign draft ready. Review and edit it before saving.");
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "A campaign draft could not be generated.")),
  });

  const save = useMutation({
    mutationFn: () =>
      saveCampaign({
        data: {
          businessId: businessId!,
          channel,
          objective,
          productId: productId || null,
          ...draft!,
        },
      }),
    onSuccess: async () => {
      setDraft(null);
      setObjective("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["marketing-campaigns", businessId] }),
        queryClient.invalidateQueries({ queryKey: ["growth-metrics", businessId] }),
      ]);
      toast.success("Campaign saved. Copy its trackable link from your campaign list.");
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "The campaign could not be saved.")),
  });

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Grow your business"
      subtitle="See what customers do, understand what is working, and plan your next action."
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="size-5 text-primary" aria-hidden="true" />
            Store performance
          </h2>
          <p className="text-sm text-muted-foreground">
            Analytics include only visitors who opt in. Repeat visits are deduplicated by an
            anonymous first-party ID.
          </p>
        </div>
        <label className="text-sm">
          <span className="sr-only">Analytics period</span>
          <select
            className="h-10 rounded-md border border-border bg-background px-3"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </div>

      {!canReadAnalytics ? (
        <section className="surface p-5 text-sm text-muted-foreground">
          Your role does not have permission to view financial reports and storefront analytics.
        </section>
      ) : metrics.isError ? (
        <section className="surface p-5 text-sm text-destructive">
          {readableError(metrics.error, "Store analytics could not be loaded.")}
        </section>
      ) : metrics.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-28" />
          ))}
        </div>
      ) : metrics.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Unique visitors"
              value={formatNumber(metrics.data.uniqueVisitors)}
              hint="Opted-in visitors during this period"
              icon={Eye}
            />
            <MetricCard
              label="Product views"
              value={formatNumber(metrics.data.productViews)}
              hint="Recorded product detail views"
              icon={Eye}
            />
            <MetricCard
              label="Visitors who started checkout"
              value={formatNumber(metrics.data.checkoutVisitors)}
              hint={`${formatNumber(metrics.data.addToCartVisitors)} added an item to cart`}
              icon={ShoppingCart}
            />
            <MetricCard
              label="Paid-order conversion"
              value={`${metrics.data.conversionRate.toFixed(1)}%`}
              hint={`${metrics.data.trackedPaidVisitors} opted-in visitors placed paid orders; ${metrics.data.paidOrders} paid orders overall`}
              icon={BarChart3}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="surface p-5">
              <h3 className="font-semibold">Sales recorded from your shop</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {metrics.data.orders} orders placed, {metrics.data.paidOrders} confirmed paid.
                Unpaid and pending orders are not revenue.
              </p>
              <div className="mt-4 space-y-1 text-2xl font-semibold">
                {metrics.data.paidRevenueByCurrency.length ? (
                  metrics.data.paidRevenueByCurrency.map((revenue) => (
                    <p key={revenue.currency}>{formatMoney(revenue.amount, revenue.currency)}</p>
                  ))
                ) : (
                  <p>No confirmed paid orders</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Confirmed paid orders only</p>
            </section>
            <section className="surface p-5">
              <h3 className="font-semibold">Where opted-in visitors came from</h3>
              {metrics.data.sources.length ? (
                <ul className="mt-3 space-y-2">
                  {metrics.data.sources.map((source) => (
                    <li
                      key={source.source}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="capitalize">{source.source}</span>
                      <span className="font-medium">{formatNumber(source.visitors)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  No opted-in visits were recorded in this period.
                </p>
              )}
            </section>
          </div>

          <section className="surface mt-4 p-5">
            <h3 className="font-semibold">Products attracting attention</h3>
            {metrics.data.products.length ? (
              <ul className="mt-3 divide-y divide-border">
                {metrics.data.products.map((product) => (
                  <li key={product.productId} className="flex justify-between gap-4 py-2 text-sm">
                    <span className="truncate">{product.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatNumber(product.views)} views
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Product views will appear after visitors opt in to anonymous analytics.
              </p>
            )}
          </section>
        </>
      ) : null}

      <section className="surface mt-5 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-4.5 text-primary" aria-hidden="true" />
          Marketing Studio
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a channel-specific draft from your business and catalogue. AI will not publish or
          send it for you.
        </p>
        {!canManageMarketing ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Your role does not have permission to manage marketing campaigns.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium">Channel</span>
                <select
                  className="h-10 w-full rounded-md border border-border bg-background px-3"
                  value={channel}
                  onChange={(event) => setChannel(event.target.value as MarketingChannel)}
                >
                  {CHANNELS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block font-medium">
                  What do you want this campaign to do?
                </span>
                <input
                  className="h-10 w-full rounded-md border border-border bg-background px-3"
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                  maxLength={240}
                  placeholder="For example: introduce our new handmade soap range"
                />
              </label>
              <label className="text-sm md:col-span-3">
                <span className="mb-1 block font-medium">Use a product (optional)</span>
                <select
                  className="h-10 w-full rounded-md border border-border bg-background px-3"
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                >
                  <option value="">No specific product</option>
                  {(products.data ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {!draft ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDraft({ name: "", headline: "", copy: "", callToAction: "" })}
                >
                  Start a manual draft
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={
                  !canUseAI || objective.trim().length < 5 || generate.isPending || !businessId
                }
                onClick={() => generate.mutate()}
                className="gap-2"
              >
                <Sparkles className="size-4" aria-hidden="true" />
                {generate.isPending ? "Creating draft..." : "Create AI draft"}
              </Button>
              {!canUseAI ? (
                <span className="self-center text-xs text-muted-foreground">
                  Your role does not have AI access. You can still edit and save a manual draft.
                </span>
              ) : null}
            </div>

            {draft ? (
              <div className="mt-5 space-y-3 border-t border-border pt-4">
                <h3 className="font-semibold">Review and edit before saving</h3>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Campaign name</span>
                  <input
                    className="h-10 w-full rounded-md border border-border bg-background px-3"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    maxLength={100}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Headline</span>
                  <input
                    className="h-10 w-full rounded-md border border-border bg-background px-3"
                    value={draft.headline}
                    onChange={(event) => setDraft({ ...draft, headline: event.target.value })}
                    maxLength={160}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Post copy</span>
                  <Textarea
                    value={draft.copy}
                    onChange={(event) => setDraft({ ...draft, copy: event.target.value })}
                    maxLength={1200}
                    rows={5}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Call to action</span>
                  <input
                    className="h-10 w-full rounded-md border border-border bg-background px-3"
                    value={draft.callToAction}
                    onChange={(event) => setDraft({ ...draft, callToAction: event.target.value })}
                    maxLength={120}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={
                      !draft.name.trim() ||
                      !draft.headline.trim() ||
                      !draft.copy.trim() ||
                      !draft.callToAction.trim() ||
                      save.isPending
                    }
                    onClick={() => save.mutate()}
                  >
                    {save.isPending ? "Saving..." : "Save campaign"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                    Discard draft
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="mt-6 border-t border-border pt-4">
              <h3 className="font-semibold">Your campaigns</h3>
              {!storefront.data?.store?.slug ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Create or publish a storefront to make trackable campaign links.
                </p>
              ) : !storefront.data.checklist.published ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Publish your storefront before sharing campaign links with customers.
                </p>
              ) : null}
              {campaigns.isLoading ? (
                <Skeleton className="mt-3 h-16" />
              ) : campaigns.isError ? (
                <p className="mt-2 text-sm text-destructive">
                  {readableError(campaigns.error, "Campaigns could not be loaded.")}
                </p>
              ) : campaigns.data?.length ? (
                <ul className="mt-3 divide-y divide-border">
                  {campaigns.data.map((campaign) => {
                    const slug = storefront.data?.store?.slug;
                    const link =
                      slug && storefront.data?.checklist.published
                        ? makeCampaignUrl(slug, campaign.id, campaign.channel)
                        : null;
                    const result = metrics.data?.campaigns.find((item) => item.id === campaign.id);
                    return (
                      <li key={campaign.id} className="py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{campaign.name}</p>
                            <p className="mt-1 text-xs capitalize text-muted-foreground">
                              {campaign.channel} · {campaign.objective}
                            </p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            {result ? (
                              <>
                                <p>
                                  {result.visitors} opted-in visitors · {result.orders} orders
                                </p>
                                <p>{result.paidOrders} confirmed paid</p>
                                {result.paidRevenueByCurrency.map((revenue) => (
                                  <p key={revenue.currency}>
                                    {formatMoney(revenue.amount, revenue.currency)} confirmed
                                  </p>
                                ))}
                              </>
                            ) : (
                              <p>Activity appears after visitors opt in.</p>
                            )}
                          </div>
                        </div>
                        {link ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs">
                              {link}
                            </code>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => void copyCampaignLink(link)}
                            >
                              <Copy className="size-3.5" aria-hidden="true" />
                              Copy link
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Saved campaigns and measured results will appear here.
                </p>
              )}
            </div>
          </>
        )}
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" className="gap-2">
          <Link to="/insights">
            <ShoppingCart className="size-4" aria-hidden="true" />
            View business insights
          </Link>
        </Button>
        <Button asChild variant="ghost" className="gap-2">
          <Link to="/storefront">
            <Link2 className="size-4" aria-hidden="true" />
            Storefront settings
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Eye;
}) {
  return (
    <section className="surface p-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </section>
  );
}
