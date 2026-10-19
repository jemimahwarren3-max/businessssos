import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { orderTokenKey, readCart, writeCart, type CartLine } from "@/lib/storefront/cart";
import { placeOrderFn, quoteCartFn } from "@/lib/storefront/storefront.functions";
import type { CartQuote } from "@/lib/storefront/contract";
import { formatMoney, readableError } from "@/lib/format";
import { Route as StoreRoute } from "./store.$slug";

export const Route = createFileRoute("/store/$slug/checkout")({
  head: () => ({ meta: [{ title: "Checkout" }, { name: "robots", content: "noindex" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { store, preview } = StoreRoute.useLoaderData();
  const quote = useServerFn(quoteCartFn);
  const place = useServerFn(placeOrderFn);
  const navigate = useNavigate();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [priced, setPriced] = useState<CartQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery" | "quote">(
    store.delivery.pickupEnabled ? "pickup" : store.delivery.deliveryEnabled ? "delivery" : "quote",
  );
  const [paymentMethod, setPaymentMethod] = useState<"pay_on_pickup" | "pay_on_delivery" | "quote">(
    store.payments.payOnPickup
      ? "pay_on_pickup"
      : store.payments.payOnDelivery
        ? "pay_on_delivery"
        : "quote",
  );

  useEffect(() => {
    setLines(readCart(store.slug));
  }, [store.slug]);

  useEffect(() => {
    if (lines.length === 0) return;
    let cancelled = false;
    void quote({ data: { slug: store.slug, fulfilment, items: lines } })
      .then((result) => {
        if (!cancelled) setPriced(result);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(readableError(reason, "Checkout could not price this cart."));
      });
    return () => {
      cancelled = true;
    };
  }, [lines, fulfilment, quote, store.slug]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (preview || pending) return;
    setPending(true);
    setError(null);
    const keyName = `bos-checkout:${store.slug}`;
    let idempotencyKey = sessionStorage.getItem(keyName);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      sessionStorage.setItem(keyName, idempotencyKey);
    }
    try {
      const result = await place({
        data: {
          slug: store.slug,
          idempotencyKey,
          fulfilment,
          paymentMethod,
          customer: { name, phone, email, address, notes },
          items: lines,
        },
      });
      if (result.accessToken) {
        sessionStorage.setItem(orderTokenKey(store.slug, result.reference), result.accessToken);
      }
      if (!result.replayed) {
        writeCart(store.slug, []);
        sessionStorage.removeItem(keyName);
      }
      await navigate({
        to: "/store/$slug/order/$reference",
        params: { slug: store.slug, reference: result.reference },
      });
    } catch (reason) {
      setError(readableError(reason as Error, "The order was not placed. You can try again."));
      setPending(false);
    }
  }

  if (preview) {
    return <p className="px-4 py-10">Publish the shop before customers can check out.</p>;
  }

  return (
    <form
      className="mx-auto grid max-w-4xl gap-8 px-4 py-8 md:grid-cols-2"
      onSubmit={(event) => void submit(event)}
    >
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Checkout</h1>
        <p className="text-sm text-neutral-500">
          You do not need an account. Submitting an order is not the same as a completed payment.
        </p>
        <label className="block text-sm">
          Name
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          Phone
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          Email (optional)
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium">How to receive it</legend>
          {store.delivery.pickupEnabled ? (
            <label className="block">
              <input
                type="radio"
                name="fulfilment"
                checked={fulfilment === "pickup"}
                onChange={() => {
                  setFulfilment("pickup");
                  setPaymentMethod("pay_on_pickup");
                }}
              />{" "}
              Pickup
            </label>
          ) : null}
          {store.delivery.deliveryEnabled ? (
            <label className="block">
              <input
                type="radio"
                name="fulfilment"
                checked={fulfilment === "delivery"}
                onChange={() => {
                  setFulfilment("delivery");
                  setPaymentMethod("pay_on_delivery");
                }}
              />{" "}
              Delivery
            </label>
          ) : null}
          {store.payments.quotes ? (
            <label className="block">
              <input
                type="radio"
                name="fulfilment"
                checked={fulfilment === "quote"}
                onChange={() => {
                  setFulfilment("quote");
                  setPaymentMethod("quote");
                }}
              />{" "}
              Request a quote
            </label>
          ) : null}
        </fieldset>
        {fulfilment === "delivery" ? (
          <label className="block text-sm">
            Delivery address
            <textarea
              className="mt-1 w-full rounded border px-3 py-2"
              required
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>
        ) : null}
        {store.delivery.areas ? (
          <p className="text-sm text-neutral-500">Delivery areas: {store.delivery.areas}</p>
        ) : null}
        {store.delivery.estimate ? (
          <p className="text-sm text-neutral-500">Estimate: {store.delivery.estimate}</p>
        ) : null}
        <label className="block text-sm">
          Notes
          <textarea
            className="mt-1 w-full rounded border px-3 py-2"
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <p className="text-sm text-neutral-600">
          Payment:{" "}
          {paymentMethod === "quote"
            ? "Quote request. This does not reserve stock and is not a payment."
            : paymentMethod === "pay_on_delivery"
              ? "Pay on delivery. The shop records payment only when they receive it."
              : "Pay on pickup. The shop records payment only when they receive it."}{" "}
          Card and EcoCash checkout through Paynow is not connected for this shop yet.
        </p>
      </div>
      <aside className="rounded-lg border p-4">
        <h2 className="font-semibold">{store.storeName}</h2>
        {priced ? (
          <p className="mt-3 text-lg font-semibold">{formatMoney(priced.total, priced.currency)}</p>
        ) : (
          <p className="mt-3 text-sm">Calculating the server total…</p>
        )}
        <ul className="mt-3 space-y-1 text-sm text-neutral-600">
          {(priced?.lines ?? []).map((line) => (
            <li key={line.productId}>
              {line.quantity} × {line.name}
            </li>
          ))}
        </ul>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        <button
          className="mt-4 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={pending || lines.length === 0 || !priced}
          type="submit"
        >
          {pending ? "Placing order…" : paymentMethod === "quote" ? "Request quote" : "Place order"}
        </button>
      </aside>
    </form>
  );
}
