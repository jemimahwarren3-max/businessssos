import type { DeliveryZone } from "@/lib/storefront/delivery-zones";
import { deliveryPricingMethod, findDeliveryZone } from "@/lib/storefront/delivery-zones";

/** Mirrors storefront delivery pricing in the database. Checkout does not
 * trust this result — quote_store_cart / create_store_order recompute it. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function deliveryFee(input: {
  fulfilment: "pickup" | "delivery" | "quote";
  subtotal: number;
  flatFee: number;
  freeOver: number | null;
  pricingMethod?: string;
  quoteRequired?: boolean;
  zone?: DeliveryZone | null;
}): number {
  if (input.fulfilment !== "delivery") return 0;
  const method = deliveryPricingMethod({
    ...(input.quoteRequired !== undefined ? { quoteRequired: input.quoteRequired } : {}),
    ...(input.pricingMethod !== undefined ? { pricingMethod: input.pricingMethod } : {}),
  });
  if (method === "free") return 0;
  if (method === "zone" && input.zone) {
    if (input.subtotal < input.zone.minOrder) return roundMoney(Math.max(input.zone.fee, 0));
    const fee = Math.max(input.zone.fee, 0);
    if (input.zone.freeOver != null && input.subtotal >= input.zone.freeOver) return 0;
    return roundMoney(fee);
  }
  const fee = Math.max(input.flatFee, 0);
  if (input.freeOver != null && input.subtotal >= input.freeOver) return 0;
  return roundMoney(fee);
}

export function deliveryFeeForStore(input: {
  fulfilment: "pickup" | "delivery" | "quote";
  subtotal: number;
  delivery: {
    flatFee: number;
    freeOver: number | null;
    quoteRequired?: boolean;
    pricingMethod?: string;
    zones?: DeliveryZone[];
  };
  zoneId?: string | null;
}): number {
  const zone = findDeliveryZone(input.delivery.zones, input.zoneId);
  return deliveryFee({
    fulfilment: input.fulfilment,
    subtotal: input.subtotal,
    flatFee: input.delivery.flatFee,
    freeOver: input.delivery.freeOver,
    ...(input.delivery.quoteRequired !== undefined
      ? { quoteRequired: input.delivery.quoteRequired }
      : {}),
    ...(input.delivery.pricingMethod !== undefined
      ? { pricingMethod: input.delivery.pricingMethod }
      : {}),
    ...(zone ? { zone } : {}),
  });
}

export function orderTotal(input: { subtotal: number; tax: number; deliveryFee: number }): number {
  return roundMoney(input.subtotal + input.tax + input.deliveryFee);
}
