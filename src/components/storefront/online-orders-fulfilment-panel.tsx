import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OrderEmailDeliveries } from "@/components/storefront/order-email-deliveries";
import { OrderReceipt } from "@/components/storefront/order-receipt";
import { formatMoney, friendlyDateTime, readableError } from "@/lib/format";
import {
  ORDER_DESK_FILTER_LABEL,
  filterOrderDeskRows,
  fulfilmentStatusLabel,
  paymentStatusLabel,
  sortOrderDeskRows,
  type OrderDeskFilter,
} from "@/lib/storefront/order-desk";
import { fulfilmentHowLabel, paymentHowLabel } from "@/lib/storefront/receipt";
import { ACTION_LABEL, fulfilmentActions, type OrderAction } from "@/lib/storefront/transitions";
import type { AdminOrder, AdminStore } from "@/lib/storefront/contract";
import {
  getAdminOrderFn,
  saveOrderCourierFn,
  saveSellerOrderNoteFn,
  transitionOrderFn,
} from "@/lib/storefront/storefront.functions";

type OrderSummary = AdminStore["orders"][number];

const FILTERS: OrderDeskFilter[] = [
  "all",
  "new",
  "unpaid",
  "confirmed",
  "preparing",
  "ready",
  "delivery",
  "completed",
  "cancelled",
];

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
  const saveNote = useServerFn(saveSellerOrderNoteFn);
  const saveCourier = useServerFn(saveOrderCourierFn);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [checkedAccount, setCheckedAccount] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<OrderDeskFilter>("all");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [internalNote, setInternalNote] = useState("");
  const [notePending, setNotePending] = useState(false);
  const [courierName, setCourierName] = useState("");
  const [courierReference, setCourierReference] = useState("");
  const [courierContact, setCourierContact] = useState("");
  const [courierTrackingUrl, setCourierTrackingUrl] = useState("");
  const [courierPending, setCourierPending] = useState(false);

  const visibleOrders = useMemo(
    () => sortOrderDeskRows(filterOrderDeskRows(orders, { query, filter })),
    [orders, query, filter],
  );

  function openOrder(orderId: string) {
    void loadOrder({ data: { businessId, orderId } }).then((next) => {
      setSelectedOrder(next);
      setCheckedAccount(false);
      setPaymentReference("");
      setCancelReason("");
      setShowCancelForm(false);
      setInternalNote(next.sellerInternalNote ?? "");
      setCourierName(next.courierName ?? "");
      setCourierReference(next.courierReference ?? "");
      setCourierContact(next.courierContact ?? "");
      setCourierTrackingUrl(next.courierTrackingUrl ?? "");
    });
  }

  async function runTransition(action: OrderAction) {
    if (!selectedOrder) return;
    if (action === "cancel" && !cancelReason.trim()) {
      setShowCancelForm(true);
      toast.error("Enter a cancellation reason before cancelling.");
      return;
    }
    try {
      const next = await transition({
        data: {
          businessId,
          orderId: selectedOrder.id,
          action,
          paymentReference: action === "mark_paid" ? paymentReference.trim() : undefined,
          reason:
            action === "cancel"
              ? cancelReason.trim()
              : action === "reject_proof"
                ? "The shop could not confirm this payment. Send a new reference."
                : undefined,
        },
      });
      setSelectedOrder(next);
      setCheckedAccount(false);
      setPaymentReference("");
      setCancelReason("");
      setShowCancelForm(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys });
    } catch (error) {
      toast.error(readableError(error as Error, "Could not update the order"));
    }
  }

  return (
    <section id="online-orders" className="scroll-mt-24 space-y-3">
      {showTitle ? <h2 className="text-base font-semibold">Online orders</h2> : null}
      <p className="text-sm text-muted-foreground">
        New and in-progress shop orders. Open an order to confirm payment, update fulfilment, and
        print the same receipt the customer sees. Unpaid orders stay out of sales reports until you
        record payment after checking your account.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="grid flex-1 gap-1 text-sm">
          Search
          <Input
            placeholder="Reference, customer, phone…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((key) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={filter === key ? "default" : "outline"}
            onClick={() => setFilter(key)}
          >
            {ORDER_DESK_FILTER_LABEL[key]}
          </Button>
        ))}
      </div>

      <ul className="divide-y rounded-lg border">
        {visibleOrders.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">
            {orders.length === 0
              ? "No online orders yet."
              : "No orders match this search or filter."}
          </li>
        ) : null}
        {visibleOrders.map((order) => (
          <li
            key={order.id}
            className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => openOrder(order.id)}
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
              <span className="mt-2 flex flex-wrap gap-1">
                <Badge variant="secondary">{fulfilmentStatusLabel(order.fulfilmentStatus)}</Badge>
                <Badge variant="outline">{paymentStatusLabel(order.paymentStatus)}</Badge>
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
          {selectedOrder.customerNotes ? (
            <p className="mt-3 rounded-md border bg-muted/40 p-3">
              <span className="font-medium">Customer note: </span>
              {selectedOrder.customerNotes}
            </p>
          ) : null}
          <div className="mt-3 space-y-1 rounded-md border p-3 text-sm">
            <p className="font-medium">Fulfilment</p>
            <p>
              {fulfilmentHowLabel(selectedOrder.fulfilmentMethod)} ·{" "}
              {fulfilmentStatusLabel(selectedOrder.fulfilmentStatus)}
            </p>
            {selectedOrder.deliveryZoneName ? (
              <p>Delivery area: {selectedOrder.deliveryZoneName}</p>
            ) : null}
            {selectedOrder.collectionPointName ? (
              <p>Collection at: {selectedOrder.collectionPointName}</p>
            ) : null}
            {selectedOrder.customerAddress ? (
              <p className="whitespace-pre-wrap">Address: {selectedOrder.customerAddress}</p>
            ) : null}
            <p>
              Delivery fee: {formatMoney(selectedOrder.deliveryFee, selectedOrder.currency)} ·
              Total: {formatMoney(selectedOrder.total, selectedOrder.currency)}
            </p>
            {selectedOrder.collectAt ? (
              <p>Collection slot: {friendlyDateTime(selectedOrder.collectAt)}</p>
            ) : null}
          </div>
          {selectedOrder.fulfilmentMethod === "delivery" ? (
            <div className="mt-3 space-y-2 rounded-md border p-3">
              <p className="font-medium">Courier (manual tracking)</p>
              <p className="text-xs text-muted-foreground">
                Save provider details when you dispatch. Customers are notified when tracking
                changes; this is not live GPS tracking.
              </p>
              <Input
                placeholder="Courier or driver name"
                value={courierName}
                onChange={(event) => setCourierName(event.target.value)}
              />
              <Input
                placeholder="Tracking or reference number"
                value={courierReference}
                onChange={(event) => setCourierReference(event.target.value)}
              />
              <Input
                placeholder="Contact phone"
                value={courierContact}
                onChange={(event) => setCourierContact(event.target.value)}
              />
              <Input
                placeholder="Tracking URL (https://…)"
                value={courierTrackingUrl}
                onChange={(event) => setCourierTrackingUrl(event.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={courierPending}
                onClick={() => {
                  setCourierPending(true);
                  void saveCourier({
                    data: {
                      businessId,
                      orderId: selectedOrder.id,
                      courierName,
                      courierReference,
                      courierContact,
                      courierTrackingUrl,
                    },
                  })
                    .then((next) => {
                      setSelectedOrder(next);
                      toast.success("Courier details saved");
                      void queryClient.invalidateQueries({ queryKey: queryKeys });
                    })
                    .catch((error: Error) =>
                      toast.error(readableError(error, "Could not save courier details.")),
                    )
                    .finally(() => setCourierPending(false));
                }}
              >
                Save courier details
              </Button>
            </div>
          ) : null}
          <div className="mt-3 space-y-2">
            <label className="grid gap-1 text-sm">
              Internal fulfilment note (staff only)
              <Textarea
                rows={3}
                maxLength={2000}
                value={internalNote}
                onChange={(event) => setInternalNote(event.target.value)}
                disabled={selectedOrder.fulfilmentStatus === "cancelled"}
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={notePending || selectedOrder.fulfilmentStatus === "cancelled"}
              onClick={() => {
                setNotePending(true);
                void saveNote({
                  data: {
                    businessId,
                    orderId: selectedOrder.id,
                    note: internalNote,
                  },
                })
                  .then((next) => {
                    setSelectedOrder(next);
                    toast.success("Internal note saved.");
                  })
                  .catch((error: Error) =>
                    toast.error(readableError(error, "Could not save the note.")),
                  )
                  .finally(() => setNotePending(false));
              }}
            >
              Save internal note
            </Button>
          </div>
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
                  I received {formatMoney(selectedOrder.total, selectedOrder.currency)} directly and
                  checked my own account or received the cash.
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
          {showCancelForm ? (
            <div className="mt-3 space-y-2 rounded-md border border-destructive/40 p-3">
              <label className="grid gap-1">
                Cancellation reason (required)
                <Textarea
                  rows={2}
                  maxLength={400}
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                />
              </label>
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
                onClick={() => {
                  if (action === "cancel") {
                    setShowCancelForm(true);
                    if (cancelReason.trim()) void runTransition(action);
                    return;
                  }
                  void runTransition(action);
                }}
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
              <li key={event.createdAt + event.eventType}>
                {friendlyDateTime(event.createdAt)} — {event.message}
              </li>
            ))}
          </ul>
          <OrderEmailDeliveries businessId={businessId} orderId={selectedOrder.id} />
        </div>
      ) : null}
    </section>
  );
}
