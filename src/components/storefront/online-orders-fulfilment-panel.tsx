import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrderReceipt } from "@/components/storefront/order-receipt";
import { formatMoney, friendlyDateTime, readableError } from "@/lib/format";
import { fulfilmentHowLabel, paymentHowLabel } from "@/lib/storefront/receipt";
import { ACTION_LABEL, fulfilmentActions } from "@/lib/storefront/transitions";
import type { AdminOrder, AdminStore } from "@/lib/storefront/contract";
import { getAdminOrderFn, transitionOrderFn } from "@/lib/storefront/storefront.functions";

type OrderSummary = AdminStore["orders"][number];

export function OnlineOrdersFulfilmentPanel({
  businessId,
  orders,
  storeName,
  queryKeys = ["storefront", businessId],
  showTitle = true,
}: {
  businessId: string;
  orders: OrderSummary[];
  storeName: string;
  queryKeys?: string[];
  showTitle?: boolean;
}) {
  const queryClient = useQueryClient();
  const loadOrder = useServerFn(getAdminOrderFn);
  const transition = useServerFn(transitionOrderFn);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [checkedAccount, setCheckedAccount] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");

  return (
    <section id="online-orders" className="scroll-mt-24 space-y-3">
      {showTitle ? <h2 className="text-base font-semibold">Online orders</h2> : null}
      <p className="text-sm text-muted-foreground">
        New and in-progress shop orders. Open an order to confirm payment, update fulfilment, and
        print the same receipt the customer sees. Unpaid orders stay out of sales reports until you
        record payment after checking your account.
      </p>
      <ul className="divide-y rounded-lg border">
        {orders.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">No online orders yet.</li>
        ) : null}
        {orders.map((order) => (
          <li
            key={order.id}
            className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
          >
            <button
              type="button"
              className="text-left"
              onClick={() =>
                void loadOrder({ data: { businessId, orderId: order.id } }).then((next) => {
                  setSelectedOrder(next);
                  setCheckedAccount(false);
                  setPaymentReference("");
                })
              }
            >
              <span className="font-medium">{order.reference}</span> · {order.customerName}
              <span className="mt-1 block text-muted-foreground">
                {friendlyDateTime(order.createdAt)} · {formatMoney(order.total, order.currency)}
              </span>
              <span className="mt-1 block text-muted-foreground">
                {order.itemSummary ?? `${order.itemCount} item(s)`} ·{" "}
                {fulfilmentHowLabel(order.fulfilmentMethod)} ·{" "}
                {paymentHowLabel(order.paymentMethod, order.paymentStatus === "paid")}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selectedOrder ? (
        <div className="rounded-lg border p-4 text-sm">
          <OrderReceipt
            audience="merchant"
            order={{
              ...selectedOrder,
              storeName,
              paid: selectedOrder.paymentStatus === "paid" || Boolean(selectedOrder.saleId),
            }}
          />
          {selectedOrder.terms?.paymentProof?.reference || selectedOrder.proofUrl ? (
            <div className="mt-3 rounded-md border p-3 text-sm">
              <p className="font-medium">Customer payment proof</p>
              <p>
                {formatMoney(selectedOrder.total, selectedOrder.currency)} ·{" "}
                {selectedOrder.paymentMethod}
              </p>
              {selectedOrder.proofUrl ? (
                selectedOrder.terms?.paymentProof?.storagePath?.endsWith(".pdf") ? (
                  <a className="mt-2 inline-block underline" href={selectedOrder.proofUrl}>
                    Open PDF
                  </a>
                ) : (
                  <img
                    alt="Customer payment screenshot"
                    className="mt-2 max-h-72 rounded border"
                    src={selectedOrder.proofUrl}
                  />
                )
              ) : null}
              {selectedOrder.terms?.paymentProof?.reference ? (
                <p className="mt-2">{selectedOrder.terms.paymentProof.reference}</p>
              ) : null}
              {selectedOrder.terms?.paymentProof?.note ? (
                <p className="mt-1">{selectedOrder.terms.paymentProof.note}</p>
              ) : null}
              <p className="mt-1 text-muted-foreground">
                Look at this file, then check the money in EcoCash, InnBucks, or the bank. The
                screenshot is not confirmation.
              </p>
              {selectedOrder.terms?.paymentProof?.rejectReason ? (
                <p className="mt-1">Rejection: {selectedOrder.terms.paymentProof.rejectReason}</p>
              ) : null}
            </div>
          ) : null}
          {selectedOrder.paymentStatus !== "paid" &&
          selectedOrder.paymentMethod !== "paynow" &&
          (selectedOrder.paymentMethod !== "quote" ||
            selectedOrder.fulfilmentStatus !== "awaiting_confirmation") ? (
            <div className="mt-3 space-y-2 rounded-md border p-3">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={checkedAccount}
                  onChange={(event) => setCheckedAccount(event.target.checked)}
                />
                <span>
                  I received {formatMoney(selectedOrder.total, selectedOrder.currency)} directly
                  and checked my own account or received the cash.
                </span>
              </label>
              {selectedOrder.paymentMethod === "manual" ||
              selectedOrder.paymentMethod === "quote" ? (
                <label className="block">
                  Payment reference (optional)
                  <Input
                    className="mt-1"
                    maxLength={80}
                    value={paymentReference}
                    onChange={(event) => setPaymentReference(event.target.value)}
                  />
                </label>
              ) : null}
            </div>
          ) : null}
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
                variant={action === "cancel" || action === "reject_proof" ? "outline" : "default"}
                disabled={action === "mark_paid" && !checkedAccount}
                onClick={() =>
                  void transition({
                    data: {
                      businessId,
                      orderId: selectedOrder.id,
                      action,
                      paymentReference: action === "mark_paid" ? paymentReference.trim() : undefined,
                      reason:
                        action === "reject_proof"
                          ? "The shop could not confirm this payment. Send a new reference."
                          : undefined,
                    },
                  })
                    .then((next) => {
                      setSelectedOrder(next);
                      setCheckedAccount(false);
                      setPaymentReference("");
                      void queryClient.invalidateQueries({ queryKey: queryKeys });
                    })
                    .catch((error: Error) =>
                      toast.error(readableError(error, "Could not update the order")),
                    )
                }
              >
                {action === "mark_paid" &&
                (selectedOrder.paymentMethod === "manual" ||
                  selectedOrder.paymentMethod === "pay_on_pickup" ||
                  selectedOrder.paymentMethod === "pay_on_delivery")
                  ? "Record payment after checking your account"
                  : ACTION_LABEL[action]}
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
  );
}
