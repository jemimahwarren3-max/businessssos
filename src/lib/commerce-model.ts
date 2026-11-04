import { z } from "zod";

export const COMMERCE_MODELS = [
  {
    value: "products",
    label: "Product-based",
    description: "Physical goods, stock, and retail.",
  },
  {
    value: "services",
    label: "Service-based",
    description: "Skills, appointments, labour, or bookings.",
  },
  {
    value: "hybrid",
    label: "Hybrid",
    description: "Both products and services in one business.",
  },
] as const;

export type CommerceModel = (typeof COMMERCE_MODELS)[number]["value"];
export const commerceModelSchema = z.enum(["products", "services", "hybrid"]);

export function isCommerceModel(value: string | null | undefined): value is CommerceModel {
  return value === "products" || value === "services" || value === "hybrid";
}

export function deriveCommerceModel(sellsProducts: boolean, sellsServices: boolean): CommerceModel {
  if (sellsProducts && sellsServices) return "hybrid";
  if (sellsServices) return "services";
  return "products";
}

export function commerceModelSellsProducts(model: CommerceModel): boolean {
  return model === "products" || model === "hybrid";
}

export function commerceModelSellsServices(model: CommerceModel): boolean {
  return model === "services" || model === "hybrid";
}

/** Nav emphasis only. Pages stay reachable so a shop can add the other offering later. */
export function navShowsServicesFirst(model: CommerceModel): boolean {
  return model !== "products";
}

export function navShowsInventoryFirst(model: CommerceModel): boolean {
  return model !== "services";
}
