import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readCart, writeCart, type CartLine } from "@/lib/storefront/cart";
import { quoteCartFn } from "@/lib/storefront/storefront.functions";
import type { CartQuote } from "@/lib/storefront/contract";
import { allowedFulfilments } from "@/lib/storefront/order-rules";
import { formatMoney, readableError } from "@/lib/format";
import { Route as StoreRoute } from "./store.$slug";

export const Route = createFileRoute("/store/$slug/cart")({
  validateSearch: z.object({
    preview: z
      .union([z.literal("1"), z.literal(1)])
      .optional()
      .catch(undefined),
  }),
  head: () => ({ meta: [{ title: "Cart" }, { name: "robots", content: "noindex" }] }),
  component: CartPage,
});

function CartPage() {
  const { store, preview } = StoreRoute.useLoaderData();
  const quote = useServerFn(quoteCartFn);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [priced, setPriced] = useState<CartQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fulfilment = allowedFulfilments(store)[0] ?? "quote";

  useEffect(() => {
    setLines(readCart(store.slug));
  }, [store.slug]);

  useEffect(() => {
    if (lines.length === 0) {
      setPriced(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void quote({ data: { slug: store.slug, fulfilment, items: lines } })
      .then((result) => {
        if (!cancelled) setPriced(result);
      })
      .catch((reason: Error) => {
        if (!cancelled) {
          setPriced(null);
          setError(
            readableError(reason, "The cart could not be priced. Nothing has been ordered."),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lines, fulfilment, quote, store.slug]);

  function update(next: CartLine[]) {
    setLines(next);
    writeCart(store.slug, next);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Cart</h1>
      <p className="mt-2 text-sm text-neutral-500">
        Prices are checked with the shop when this page loads. A cart is not an order.
      </p>
      {preview ? (
        <p className="mt-3 text-sm text-amber-800">Checkout is turned off in draft preview.</p>
      ) : null}
      {lines.length === 0 ? (
        <p className="mt-8 text-neutral-500">Your cart is empty.</p>
      ) : (
        <ul className="mt-6 divide-y">
          {lines.map((line) => {
            const product = store.products.find((item) => item.id === line.productId);
            const pricedLine = priced?.lines.find((item) => item.productId === line.productId);
            return (
              <li key={line.productId} className="flex items-start justify-between gap-3 py-4">
                <div>
                  <p className="font-medium">{pricedLine?.name ?? product?.name ?? "Product"}</p>
                  <p className="text-sm text-neutral-500">
                    {pricedLine
                      ? formatMoney(pricedLine.unitPrice, priced?.currency ?? store.currency)
                      : "Price confirmed at checkout"}
                  </p>
                  <label className="mt-2 block text-sm">
                    Quantity
                    <input
                      className="ml-2 w-20 rounded border px-2 py-1"
                      style={{
                        backgroundColor: store.theme.surface,
                        color: store.theme.text,
                        borderColor: store.theme.accent + "70",
                      }}
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(event) =>
                        update(
                          lines.map((item) =>
                            item.productId === line.productId
                              ? { ...item, quantity: Number(event.target.value) }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <button
                  className="text-sm underline"
                  style={{ color: store.theme.link }}
                  type="button"
                  onClick={() => update(lines.filter((item) => item.productId !== line.productId))}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {loading ? <p className="mt-4 text-sm">Checking prices and stock…</p> : null}
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
      {priced ? (
        <dl className="mt-6 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt>Items</dt>
            <dd>{formatMoney(priced.subtotal, priced.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Tax</dt>
            <dd>{formatMoney(priced.tax, priced.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Delivery ({fulfilment})</dt>
            <dd>{formatMoney(priced.deliveryFee, priced.currency)}</dd>
          </div>
          <div className="flex justify-between text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatMoney(priced.total, priced.currency)}</dd>
          </div>
        </dl>
      ) : null}
      {lines.length > 0 && !preview ? (
        <Link
          to="/store/$slug/checkout"
          params={{ slug: store.slug }}
          className="mt-6 inline-flex rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
          style={{ backgroundColor: store.theme.button, color: store.theme.buttonText }}
        >
          Checkout
        </Link>
      ) : null}
    </div>
  );
}
