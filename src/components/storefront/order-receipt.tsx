import { paymentHowLabel, fulfilmentHowLabel } from "@/lib/storefront/receipt";
import { snapshotPolicyLines } from "@/lib/storefront/order-rules";
import type { CustomerOrder } from "@/lib/storefront/contract";
import { formatMoney, friendlyDateTime } from "@/lib/format";

type ReceiptOrder = Pick<
  CustomerOrder,
  | "reference"
  | "storeName"
  | "fulfilmentStatus"
  | "paymentStatus"
  | "paymentMethod"
  | "fulfilmentMethod"
  | "customerName"
  | "customerPhone"
  | "customerEmail"
  | "customerAddress"
  | "subtotal"
  | "tax"
  | "deliveryFee"
  | "total"
  | "currency"
  | "createdAt"
  | "collectAt"
  | "paid"
  | "terms"
  | "items"
>;

export function OrderReceipt({
  order,
  audience,
}: {
  order: ReceiptOrder;
  audience: "customer" | "merchant";
}) {
  return (
    <article className="receipt-print space-y-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{order.storeName}</p>
          <p className="text-neutral-600">Receipt {order.reference}</p>
        </div>
        <button
          className="rounded-md border px-3 py-1 text-sm print:hidden"
          type="button"
          onClick={() => window.print()}
        >
          Print receipt
        </button>
      </div>
      <p className="text-neutral-600">
        {audience === "merchant"
          ? "This is the same receipt the customer sees."
          : "Keep this receipt. It is your record of what was ordered, when, and how you chose to pay."}
      </p>
      <dl className="grid gap-1">
        <div className="flex justify-between gap-4">
          <dt>When</dt>
          <dd>{friendlyDateTime(order.createdAt)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>How you get it</dt>
          <dd>{fulfilmentHowLabel(order.fulfilmentMethod)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>How you pay</dt>
          <dd>{paymentHowLabel(order.paymentMethod, order.paid)}</dd>
        </div>
        {order.collectAt ? (
          <div className="flex justify-between gap-4">
            <dt>Collection</dt>
            <dd>{friendlyDateTime(order.collectAt)}</dd>
          </div>
        ) : null}
      </dl>
      <p>
        {order.customerName}
        {order.customerPhone ? ` · ${order.customerPhone}` : ""}
        {order.customerEmail ? ` · ${order.customerEmail}` : ""}
      </p>
      {order.customerAddress ? <p>Address: {order.customerAddress}</p> : null}
      <ul className="divide-y border-y">
        {order.items.map((item) => (
          <li
            key={`${item.productId ?? item.name}-${item.name}`}
            className="flex justify-between gap-3 py-2"
          >
            <span>
              {item.quantity} × {item.name}
            </span>
            <span>{formatMoney(item.lineTotal, order.currency)}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1">
        <div className="flex justify-between">
          <dt>Items</dt>
          <dd>{formatMoney(order.subtotal, order.currency)}</dd>
        </div>
        {order.deliveryFee > 0 ? (
          <div className="flex justify-between">
            <dt>Delivery</dt>
            <dd>{formatMoney(order.deliveryFee, order.currency)}</dd>
          </div>
        ) : null}
        {order.tax > 0 ? (
          <div className="flex justify-between">
            <dt>Tax</dt>
            <dd>{formatMoney(order.tax, order.currency)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between text-base font-semibold">
          <dt>Total</dt>
          <dd>{formatMoney(order.total, order.currency)}</dd>
        </div>
      </dl>
      {snapshotPolicyLines(order).map((line) => (
        <p key={line} className="text-neutral-600">
          {line}
        </p>
      ))}
    </article>
  );
}
