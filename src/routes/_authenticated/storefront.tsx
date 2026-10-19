import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { readableError } from "@/lib/format";
import { storePublicUrl } from "@/lib/storefront/host";
import {
  getAdminOrderFn,
  getMarketplaceListingFn,
  getStorefrontAdminFn,
  publishStorefrontFn,
  setMarketplaceVisibleFn,
  saveListingFn,
  saveStorefrontFn,
  transitionOrderFn,
} from "@/lib/storefront/storefront.functions";
import { STORE_TEMPLATES, getTemplate } from "@/lib/storefront/templates";
import { ACTION_LABEL, fulfilmentActions } from "@/lib/storefront/transitions";
import type { AdminOrder, AdminStore } from "@/lib/storefront/contract";

export const Route = createFileRoute("/_authenticated/storefront")({
  head: () => ({
    meta: [{ title: "Storefront | BusinessOS AI" }, { name: "robots", content: "noindex" }],
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
      subtitle="Publish products you already sell. Online orders stay unpaid until you record the payment."
    >
      {admin.isLoading ? <Skeleton className="h-64" /> : null}
      {admin.isError ? (
        <p className="text-sm text-destructive">
          {readableError(admin.error as Error, "The storefront could not be loaded.")}
        </p>
      ) : null}
      {admin.data && businessId ? (
        <StorefrontEditor businessId={businessId} initial={admin.data} />
      ) : null}
    </AppShell>
  );
}

function StorefrontEditor({ businessId, initial }: { businessId: string; initial: AdminStore }) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveStorefrontFn);
  const publish = useServerFn(publishStorefrontFn);
  const loadListing = useServerFn(getMarketplaceListingFn);
  const setListed = useServerFn(setMarketplaceVisibleFn);
  const saveListing = useServerFn(saveListingFn);
  const loadOrder = useServerFn(getAdminOrderFn);
  const transition = useServerFn(transitionOrderFn);
  const store = initial.store;
  const [storeName, setStoreName] = useState(store?.storeName ?? "");
  const [phone, setPhone] = useState(store?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(store?.whatsapp ?? "");
  const [tagline, setTagline] = useState(store?.tagline ?? "");
  const [about, setAbout] = useState(store?.about ?? "");
  const [policies, setPolicies] = useState(store?.policies ?? "");
  const [hours, setHours] = useState(store?.hours ?? "");
  const [address, setAddress] = useState(store?.address ?? "");
  const [heroTitle, setHeroTitle] = useState(store?.heroTitle ?? "");
  const [heroSubtitle, setHeroSubtitle] = useState(store?.heroSubtitle ?? "");
  const [accent, setAccent] = useState(store?.accentColor ?? "");
  const [templateId, setTemplateId] = useState(store?.templateId ?? "modern-minimal");
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
  const [payPickup, setPayPickup] = useState(store?.payments.payOnPickup ?? true);
  const [payDelivery, setPayDelivery] = useState(store?.payments.payOnDelivery ?? false);
  const [quotes, setQuotes] = useState(store?.payments.quotes ?? false);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);

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
          whatsapp,
          phone,
          address,
          accentColor: accent || undefined,
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
          },
          payments: { payOnPickup: payPickup, payOnDelivery: payDelivery, quotes },
        },
      }),
    onSuccess: () => {
      toast.success("Shop draft saved");
      void queryClient.invalidateQueries({ queryKey: ["storefront", businessId] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not save the shop")),
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
          Paynow, EcoCash, and InnBucks are not connected for customer checkout. Use pay on pickup,
          pay on delivery, or quote requests. Recording payment creates a normal sale and is what
          counts as revenue.
        </p>
        {publicUrl ? (
          <p className="text-sm">
            Link: <a href={publicUrl}>{publicUrl}</a>
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

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Design</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {STORE_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => {
                setTemplateId(template.id);
                if (!accent) setAccent("");
              }}
              className="rounded-lg border p-3 text-left"
              style={{
                outline: templateId === template.id ? "2px solid var(--primary)" : undefined,
              }}
            >
              <div className="mb-3 grid grid-cols-[2fr_1fr] gap-2">
                <div className="h-16 rounded" style={{ background: template.defaultAccent }} />
                <div className="h-16 rounded bg-muted" />
              </div>
              <p className="text-xs text-muted-foreground">{template.sampleLabel}</p>
              <p className="font-medium">{template.name}</p>
              <p className="text-sm text-muted-foreground">{template.description}</p>
              <p className="mt-1 text-xs">Best for {template.bestFor}</p>
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Switching design keeps your products, orders, and settings. The sample blocks above are
          not your catalogue.
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
        <label className="text-sm">
          <Label>Accent hex</Label>
          <Input
            value={accent}
            placeholder={getTemplate(templateId).defaultAccent}
            onChange={(event) => setAccent(event.target.value)}
          />
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
          <Label>Hours</Label>
          <Textarea value={hours} onChange={(event) => setHours(event.target.value)} />
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={payPickup}
            onChange={(event) => setPayPickup(event.target.checked)}
          />{" "}
          Pay on pickup
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={payDelivery}
            onChange={(event) => setPayDelivery(event.target.checked)}
          />{" "}
          Pay on delivery
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={quotes}
            onChange={(event) => setQuotes(event.target.checked)}
          />{" "}
          Quote requests
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
              setAccent("");
              setHeroTitle("");
              setHeroSubtitle("");
            }}
          >
            Reset hero and colour
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Product</th>
                <th>Stock</th>
                <th>Online</th>
              </tr>
            </thead>
            <tbody>
              {initial.products.map((product) => (
                <tr key={product.id} className="border-b">
                  <td className="py-2">
                    {product.name}
                    <span className="block text-xs text-muted-foreground">
                      {product.categoryName}
                    </span>
                  </td>
                  <td>{product.stock}</td>
                  <td>
                    <Button
                      size="sm"
                      variant={product.published ? "secondary" : "outline"}
                      onClick={() =>
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
                          .then(() =>
                            queryClient.invalidateQueries({ queryKey: ["storefront", businessId] }),
                          )
                          .catch((error: Error) =>
                            toast.error(readableError(error, "Could not update the product")),
                          )
                      }
                    >
                      {product.published ? "Unpublish" : "Publish"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Online orders</h2>
        <p className="text-sm text-muted-foreground">
          Unpaid orders are not in sales reports. Record payment only when you have actually
          received it. After that, refunds go through Sales history.
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
                  void loadOrder({ data: { businessId, orderId: order.id } }).then(setSelectedOrder)
                }
              >
                <span className="font-medium">{order.reference}</span> · {order.customerName} ·{" "}
                {order.paymentStatus} · {order.fulfilmentStatus}
              </button>
            </li>
          ))}
        </ul>
        {selectedOrder ? (
          <div className="rounded-lg border p-4 text-sm">
            <p className="font-medium">{selectedOrder.reference}</p>
            <p>
              {selectedOrder.customerName} · {selectedOrder.customerPhone}
            </p>
            {selectedOrder.customerAddress ? <p>{selectedOrder.customerAddress}</p> : null}
            <ul className="mt-2">
              {selectedOrder.items.map((item) => (
                <li key={item.name}>
                  {item.quantity} × {item.name}
                </li>
              ))}
            </ul>
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
                  variant={action === "cancel" ? "outline" : "default"}
                  onClick={() =>
                    void transition({ data: { businessId, orderId: selectedOrder.id, action } })
                      .then((next) => {
                        setSelectedOrder(next);
                        void queryClient.invalidateQueries({
                          queryKey: ["storefront", businessId],
                        });
                      })
                      .catch((error: Error) =>
                        toast.error(readableError(error, "Could not update the order")),
                      )
                  }
                >
                  {ACTION_LABEL[action]}
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
    </div>
  );
}
