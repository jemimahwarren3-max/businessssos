import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { orderTokenKey } from "@/lib/storefront/cart";
import {
  getCustomerOrderFn,
  submitOrderPaymentNoteFn,
} from "@/lib/storefront/storefront.functions";
import type { CustomerOrder } from "@/lib/storefront/contract";
import { StoreComplaintForm } from "@/components/storefront/complaint-form";
import { OrderReceipt } from "@/components/storefront/order-receipt";
import { StoreReviewForm } from "@/components/storefront/review-form";
import { startCustomerPaynowFn } from "@/lib/storefront/storefront.functions";
import { readableError } from "@/lib/format";
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
  pending: "Payment note sent. The shop still has to confirm they received the money.",
  paid: "Payment recorded by the shop.",
  failed: "The shop could not confirm that payment. You can send a new reference.",
  refunded: "Refunded.",
};

function OrderPage() {
  const { store } = StoreRoute.useLoaderData();
  const { reference } = Route.useParams();
  const load = useServerFn(getCustomerOrderFn);
  const startPaynow = useServerFn(startCustomerPaynowFn);
  const sendProof = useServerFn(submitOrderPaymentNoteFn);
  const [paying, setPaying] = useState(false);
  const [paynowChannel, setPaynowChannel] = useState<"web" | "ecocash">("web");
  const [paynowHint, setPaynowHint] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proofReference, setProofReference] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPending, setProofPending] = useState(false);

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
          <p>{STATUS_COPY[order.fulfilmentStatus] ?? order.fulfilmentStatus}</p>
          <p>{STATUS_COPY[order.paymentStatus] ?? order.paymentStatus}</p>
          <OrderReceipt order={order} audience="customer" />
          {order.events && order.events.length > 0 ? (
            <ul className="space-y-1 rounded-md border p-3 text-muted-foreground">
              {order.events.map((event) => (
                <li key={event.createdAt + event.eventType}>{event.message}</li>
              ))}
            </ul>
          ) : null}
          {order.paymentMethod === "manual" &&
          !order.paid &&
          order.paymentStatus !== "cancelled" ? (
            <form
              className="space-y-2 rounded-lg border p-3"
              onSubmit={(event) => {
                event.preventDefault();
                setProofPending(true);
                setError(null);
                const send = (proofBase64?: string) =>
                  sendProof({
                    data: {
                      slug: store.slug,
                      reference: order.reference,
                      token,
                      proofReference: proofReference || undefined,
                      proofNote: proofNote || undefined,
                      proofBase64,
                    },
                  });
                const work = proofFile
                  ? proofFile.arrayBuffer().then((buffer) => {
                      const bytes = new Uint8Array(buffer);
                      let binary = "";
                      for (let i = 0; i < bytes.length; i += 1)
                        binary += String.fromCharCode(bytes[i]!);
                      return send(btoa(binary));
                    })
                  : send();
                void work
                  .then((next) => {
                    setOrder(next);
                    setProofReference("");
                    setProofNote("");
                    setProofFile(null);
                  })
                  .catch((reason: Error) =>
                    setError(readableError(reason, "The payment note was not saved.")),
                  )
                  .finally(() => setProofPending(false));
              }}
            >
              <p className="font-medium">Send payment proof</p>
              <p className="text-neutral-600">
                Attach a screenshot or paste the EcoCash, InnBucks, or bank confirmation number.
                This does not mark the order paid. The shop must check their own account.
              </p>
              {order.terms?.manualPayment ? (
                <p className="whitespace-pre-wrap text-neutral-600">
                  {[
                    order.terms.manualPayment.accountName,
                    order.terms.manualPayment.accountDetail,
                    order.terms.manualPayment.instructions,
                  ]
                    .filter(Boolean)
                    .join("\n")}
                </p>
              ) : null}
              {order.proofUrl ? (
                order.proofUrl.includes(".pdf") ||
                order.terms?.paymentProof?.storagePath?.endsWith(".pdf") ? (
                  <a className="underline" href={order.proofUrl} rel="noreferrer" target="_blank">
                    View the file you sent
                  </a>
                ) : (
                  <img
                    alt="Payment screenshot you sent"
                    className="max-h-64 rounded border"
                    src={order.proofUrl}
                  />
                )
              ) : null}
              {order.terms?.paymentProof?.reference ? (
                <p>
                  Last note sent: {order.terms.paymentProof.reference}
                  {order.terms.paymentProof.rejectReason
                    ? ` — ${order.terms.paymentProof.rejectReason}`
                    : ""}
                </p>
              ) : null}
              <label className="block">
                Screenshot (JPEG, PNG, WebP, or PDF, 5 MB)
                <input
                  className="mt-1 w-full text-sm"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <label className="block">
                Payment reference
                <input
                  className="mt-1 w-full rounded border px-3 py-2"
                  minLength={proofFile ? 0 : 3}
                  value={proofReference}
                  onChange={(event) => setProofReference(event.target.value)}
                />
              </label>
              <label className="block">
                Optional note
                <textarea
                  className="mt-1 w-full rounded border px-3 py-2"
                  maxLength={400}
                  value={proofNote}
                  onChange={(event) => setProofNote(event.target.value)}
                />
              </label>
              <button
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                disabled={proofPending || (!token && !order.mine)}
                type="submit"
              >
                {proofPending ? "Sending…" : "Send proof"}
              </button>
              {!token && !order.mine ? (
                <p className="text-neutral-500">
                  Enter the access code above before sending a note.
                </p>
              ) : null}
            </form>
          ) : null}
          {order.paymentMethod === "paynow" && !order.paid ? (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="font-medium">Finish paying this shop with Paynow</p>
              <label className="block">
                <input
                  type="radio"
                  name="paynow-retry"
                  checked={paynowChannel === "web"}
                  onChange={() => setPaynowChannel("web")}
                />{" "}
                Card / Paynow web
              </label>
              <label className="block">
                <input
                  type="radio"
                  name="paynow-retry"
                  checked={paynowChannel === "ecocash"}
                  onChange={() => setPaynowChannel("ecocash")}
                />{" "}
                EcoCash ({order.customerPhone})
              </label>
              {paynowHint ? <p className="text-neutral-600">{paynowHint}</p> : null}
              <button
                className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                type="button"
                disabled={paying}
                onClick={() => {
                  setPaying(true);
                  setPaynowHint(null);
                  void startPaynow({
                    data: {
                      slug: store.slug,
                      reference: order.reference,
                      token,
                      channel: paynowChannel,
                      phone: order.customerPhone,
                    },
                  })
                    .then((paynow) => {
                      if (paynow.redirectUrl) window.location.assign(paynow.redirectUrl);
                      else
                        setPaynowHint(
                          paynow.instructions ?? "Open the EcoCash prompt on your phone.",
                        );
                    })
                    .catch((reason: Error) =>
                      setError(readableError(reason, "Paynow could not be started.")),
                    )
                    .finally(() => setPaying(false));
                }}
              >
                {paying ? "Opening Paynow…" : "Pay now"}
              </button>
            </div>
          ) : null}
          {order.items.map((item) =>
            item.canReview && item.productId ? (
              <StoreReviewForm
                key={item.productId}
                slug={store.slug}
                reference={order.reference}
                token={token}
                productId={item.productId}
                productName={item.name}
                onSaved={() => void lookup()}
              />
            ) : item.reviewed ? (
              <p key={`${item.productId}-reviewed`} className="text-neutral-500">
                You already left a verified purchase review for {item.name}.
              </p>
            ) : null,
          )}
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
