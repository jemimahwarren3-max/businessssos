/** Client-side helpers for delivery zones and collection points (server recomputes fees). */

export type DeliveryZone = {
  id: string;
  name: string;
  enabled: boolean;
  fee: number;
  freeOver: number | null;
  minOrder: number;
  estimate: string;
};

export type CollectionPoint = {
  id: string;
  name: string;
  address: string;
  phone: string;
  instructions: string;
  enabled: boolean;
};

export type DeliveryPricingMethod = "flat" | "zone" | "free" | "quote";

export function deliveryPricingMethod(delivery: {
  quoteRequired?: boolean;
  pricingMethod?: string;
}): DeliveryPricingMethod {
  if (delivery.quoteRequired) return "quote";
  const method = delivery.pricingMethod;
  if (method === "zone" || method === "free" || method === "flat") return method;
  return "flat";
}

export function enabledDeliveryZones(zones: DeliveryZone[] | undefined): DeliveryZone[] {
  return (zones ?? []).filter((zone) => zone.enabled && zone.name.trim().length > 0);
}

export function enabledCollectionPoints(points: CollectionPoint[] | undefined): CollectionPoint[] {
  return (points ?? []).filter((point) => point.enabled && point.name.trim().length > 0);
}

export function findDeliveryZone(
  zones: DeliveryZone[] | undefined,
  zoneId: string | null | undefined,
): DeliveryZone | null {
  if (!zoneId) return null;
  return enabledDeliveryZones(zones).find((zone) => zone.id === zoneId) ?? null;
}

export function findCollectionPoint(
  points: CollectionPoint[] | undefined,
  pointId: string | null | undefined,
): CollectionPoint | null {
  if (!pointId) return null;
  return enabledCollectionPoints(points).find((point) => point.id === pointId) ?? null;
}
