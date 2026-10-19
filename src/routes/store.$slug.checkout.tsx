import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { orderTokenKey, readCart, writeCart, type CartLine } from "@/lib/storefront/cart";
import { placeOrderFn, quoteCartFn } from "@/lib/storefront/storefront.functions";
import type { CartQuote } from "@/lib/storefront/contract";
import {
  allowedFulfilments,
  allowedPayments,
  cashPolicyLines,
  orderDecisionCopy,
  type FulfilmentMethod,
  type PaymentMethod,
} from "@/lib/storefront/order-rules";
import { StoreComplaintForm } from "@/components/storefront/complaint-form";
import { configuredPlatformOrigin } from "@/lib/storefront/host";
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
  const fulfilments = useMemo(() => allowedFulfilments(store), [store]);
  const [fulfilment, setFulfilment] = useState<FulfilmentMethod>(fulfilments[0] ?? "quote");
  const payments = useMemo(() => allowedPayments(store, fulfilment), [store, fulfilment]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(payments[0] ?? "quote");

  useEffect(() => {
    setLines(readCart(store.slug));
  }, [store.slug]);

  useEffect(() => {
    if (payments[0] && !payments.includes(paymentMethod)) {
      setPaymentMethod(payments[0]);
    }
  }, [payments, paymentMethod]);

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

  if (fulfilments.length === 0) {
    return (
      <p className="px-4 py-10">
        This shop has not enabled a collection, delivery, or quote option.
      </p>
    );
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-8 px-4 py-8 md:grid-cols-2">
      <form className="contents" onSubmit={(event) => void submit(event)}>
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Checkout</h1>
          <p className="text-sm text-neutral-500">
            You do not need an account. Submitting an order is not the same as a completed payment.
          </p>
          <p className="text-sm text-neutral-600">{orderDecisionCopy(store)}</p>
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
            {fulfilments.includes("pickup") ? (
              <label className="block">
                <input
                  type="radio"
                  name="fulfilment"
                  checked={fulfilment === "pickup"}
                  onChange={() => setFulfilment("pickup")}
                />{" "}
                Collect in store
                {store.delivery.prepMinutes > 0
                  ? ` (about ${store.delivery.prepMinutes} minutes to prepare)`
                  : ""}
              </label>
            ) : null}
            {fulfilments.includes("delivery") ? (
              <label className="block">
                <input
                  type="radio"
                  name="fulfilment"
                  checked={fulfilment === "delivery"}
                  onChange={() => setFulfilment("delivery")}
                />{" "}
                Local delivery
              </label>
            ) : null}
            {fulfilments.includes("quote") ? (
              <label className="block">
                <input
                  type="radio"
                  name="fulfilment"
                  checked={fulfilment === "quote"}
                  onChange={() => setFulfilment("quote")}
                />{" "}
                Request a quote. The price is not final until the shop confirms it.
              </label>
            ) : null}
          </fieldset>
          {fulfilment === "delivery" || fulfilment === "quote" ? (
            <label className="block text-sm">
              Delivery address
              <textarea
                className="mt-1 w-full rounded border px-3 py-2"
                required={fulfilment === "delivery"}
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
          {store.delivery.cutoff ? (
            <p className="text-sm text-neutral-500">Order cut-off: {store.delivery.cutoff}</p>
          ) : null}
          {store.delivery.collectionWindows ? (
            <p className="text-sm text-neutral-500">
              Collection windows: {store.delivery.collectionWindows}
            </p>
          ) : null}
          <fieldset className="space-y-2 text-sm">
            <legend className="font-medium">How to pay</legend>
            {payments.includes("pay_on_pickup") ? (
              <label className="block">
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === "pay_on_pickup"}
                  onChange={() => setPaymentMethod("pay_on_pickup")}
                />{" "}
                Pay cash on collection
              </label>
            ) : null}
            {payments.includes("pay_on_delivery") ? (
              <label className="block">
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === "pay_on_delivery"}
                  onChange={() => setPaymentMethod("pay_on_delivery")}
                />{" "}
                Pay cash on delivery. This is not paid when the order is dispatched.
              </label>
            ) : null}
            {payments.includes("quote") ? (
              <label className="block">
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === "quote"}
                  onChange={() => setPaymentMethod("quote")}
                />{" "}
                Ask the shop to quote first
              </label>
            ) : null}
          </fieldset>
          {cashPolicyLines(store).map((line) => (
            <p key={line} className="text-sm text-neutral-600">
              {line}
            </p>
          ))}
          <p className="text-sm text-neutral-600">
            Card and EcoCash checkout through Paynow is not connected for this shop yet.
          </p>
          <label className="block text-sm">
            Notes
            <textarea
              className="mt-1 w-full rounded border px-3 py-2"
              maxLength={500}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>
        <aside className="rounded-lg border p-4">
          <h2 className="font-semibold">{store.storeName}</h2>
          {priced ? (
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt>Items</dt>
                <dd>{formatMoney(priced.subtotal, priced.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Tax</dt>
                <dd>{formatMoney(priced.tax, priced.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd>
                  {fulfilment === "quote"
                    ? "Quote pending. Not a final fee."
                    : formatMoney(priced.deliveryFee, priced.currency)}
                </dd>
              </div>
              <div className="flex justify-between text-lg font-semibold">
                <dt>Total due</dt>
                <dd>{formatMoney(priced.total, priced.currency)}</dd>
              </div>
            </dl>
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
          {store.policies ? (
            <div className="mt-4 text-sm text-neutral-600">
              <p className="font-medium">This shop's collection, delivery and refund notes</p>
              <p className="mt-1 whitespace-pre-wrap">{store.policies}</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-neutral-600">
              This shop has not published a written refund or collection policy yet. Ask before you
              pay if that matters to you.
            </p>
          )}
          <p className="mt-3 text-xs text-neutral-500">
            Placing an order is an agreement with this shop, not a purchase from BusinessOS.
            Platform{" "}
            <a className="underline" href={`${configuredPlatformOrigin() ?? ""}/terms`}>
              terms
            </a>
            ,{" "}
            <a className="underline" href={`${configuredPlatformOrigin() ?? ""}/privacy`}>
              privacy
            </a>
            , and{" "}
            <a className="underline" href={`${configuredPlatformOrigin() ?? ""}/legal/refunds`}>
              BusinessOS subscription refunds
            </a>
            .
          </p>
          <button
            className="mt-4 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={pending || lines.length === 0 || !priced || payments.length === 0}
            type="submit"
          >
            {pending
              ? "Placing order…"
              : paymentMethod === "quote"
                ? "Request quote"
                : "Place order"}
          </button>
        </aside>
      </form>
      <div className="md:col-span-2">
        <StoreComplaintForm
          slug={store.slug}
          defaultName={name}
          defaultPhone={phone}
          defaultEmail={email}
        />
      </div>
    </div>
  );
}
