import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { orderTokenKey } from "@/lib/storefront/cart";
import { getCustomerOrderFn } from "@/lib/storefront/storefront.functions";
import type { CustomerOrder } from "@/lib/storefront/contract";
import { StoreComplaintForm } from "@/components/storefront/complaint-form";
import { StoreReviewForm } from "@/components/storefront/review-form";
import { snapshotPolicyLines } from "@/lib/storefront/order-rules";
import { formatMoney, friendlyDate, friendlyDateTime, readableError } from "@/lib/format";
import { Route as StoreRoute } from "./store.$slug";

export const Route = createFileRoute("/store/$slug/order/$reference")({
  head: () => ({
    meta: [
      { title: "Order" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: OrderPage,
});

const STATUS_COPY: Record<string, string> = {
  awaiting_confirmation: "Waiting for the shop to confirm.",
  confirmed: "Confirmed by the shop.",
  preparing: "Being prepared.",
  ready: "Ready for pickup.",
  out_for_delivery: "Out for delivery.",
  completed: "Marked completed by the shop.",
  cancelled: "Cancelled.",
  unpaid: "Payment has not been recorded.",
  paid: "Payment recorded by the shop.",
};

function OrderPage() {
  const { store } = StoreRoute.useLoaderData();
  const { reference } = Route.useParams();
  const load = useServerFn(getCustomerOrderFn);
  const [token, setToken] = useState("");
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(orderTokenKey(store.slug, reference)) ?? "";
    if (saved) setToken(saved);
    void load({ data: { slug: store.slug, reference, token: saved } })
      .then((result) => {
        setOrder(result);
        setError(null);
      })
      .catch(() => {
        /* Unsigned guests still use the access-code form. */
      });
    // load is a stable server-fn wrapper; listing it retriggers this lookup.
  }, [store.slug, reference]);

  async function lookup(event?: React.FormEvent) {
    event?.preventDefault();
    setError(null);
    try {
      const result = await load({ data: { slug: store.slug, reference, token } });
      if (token) sessionStorage.setItem(orderTokenKey(store.slug, reference), token);
      setOrder(result);
    } catch (reason) {
      setOrder(null);
      setError(readableError(reason as Error, "That order could not be found."));
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Order {reference}</h1>
      <p className="mt-2 text-sm text-neutral-500">
        The access code was shown once after checkout. The order number alone does not open this
        page. Signed-in shoppers can open orders saved to their account without the code.
      </p>
      {order?.mine ? null : (
        <form className="mt-4 space-y-3" onSubmit={(event) => void lookup(event)}>
          <label className="block text-sm">
            Access code
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white" type="submit">
            View order
          </button>
        </form>
      )}
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {order ? (
        <div className="mt-6 space-y-3 text-sm">
          <p className="font-medium">{order.storeName}</p>
          <p>{STATUS_COPY[order.fulfilmentStatus] ?? order.fulfilmentStatus}</p>
          <p>
            {order.paid
              ? "Payment recorded."
              : "Not paid yet. A pending order is not a completed sale."}
          </p>
          <p>
            {order.paymentMethod === "quote"
              ? "This is a quote request."
              : order.paymentMethod === "pay_on_delivery"
                ? "Pay on delivery."
                : "Pay on pickup."}
          </p>
          <p>Placed {friendlyDate(order.createdAt)}</p>
          {order.collectAt ? <p>Collect at {friendlyDateTime(order.collectAt)}</p> : null}
          <ul className="divide-y border-y">
            {order.items.map((item) => (
              <li key={`${item.productId ?? item.name}-${item.name}`} className="space-y-2 py-2">
                <div className="flex justify-between">
                  <span>
                    {item.quantity} × {item.name}
                  </span>
                  <span>{formatMoney(item.lineTotal, order.currency)}</span>
                </div>
                {item.reviewed ? (
                  <p className="text-neutral-500">You already left a verified purchase review.</p>
                ) : null}
                {item.canReview && item.productId ? (
                  <StoreReviewForm
                    slug={store.slug}
                    reference={order.reference}
                    token={token}
                    productId={item.productId}
                    productName={item.name}
                    onSaved={() => void lookup()}
                  />
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-base font-semibold">
            Total {formatMoney(order.total, order.currency)}
          </p>
          {snapshotPolicyLines(order).map((line) => (
            <p key={line} className="text-neutral-600">
              {line}
            </p>
          ))}
          {order.customerAddress ? <p>Address: {order.customerAddress}</p> : null}
          {order.items.every((item) => !item.canReview) &&
          order.items.every((item) => !item.reviewed) &&
          order.paymentMethod !== "quote" &&
          order.fulfilmentStatus !== "cancelled" ? (
            <p className="text-neutral-500">
              Reviews open after the shop marks this order ready, out for delivery, or completed.
            </p>
          ) : null}
          <p className="text-neutral-500">
            Contact the shop if you need to change this order. Keep the access code private.
          </p>
          <StoreComplaintForm
            slug={store.slug}
            reference={order.reference}
            token={token}
            defaultName={order.customerName}
            defaultPhone={order.customerPhone}
            defaultEmail={order.customerEmail ?? ""}
          />
        </div>
      ) : null}
    </div>
  );
}
