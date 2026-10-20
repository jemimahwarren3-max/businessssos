import type { z } from "zod";
import type { saveStoreSchema } from "@/lib/storefront/contract";
import type { TemplateId } from "@/lib/storefront/templates";

export type SaveStoreInput = z.input<typeof saveStoreSchema>;

export function defaultShopPatch(input: {
  businessId: string;
  storeName: string;
  templateId: TemplateId;
  phone?: string | undefined;
  address?: string | undefined;
  pickupEnabled?: boolean;
  deliveryEnabled?: boolean;
  payOnPickup?: boolean;
  payOnDelivery?: boolean;
  policies?: string;
}): SaveStoreInput {
  return {
    businessId: input.businessId,
    storeName: input.storeName,
    templateId: input.templateId,
    phone: input.phone ?? "",
    address: input.address ?? "",
    policies: input.policies ?? "",
    delivery: {
      pickupEnabled: input.pickupEnabled ?? true,
      deliveryEnabled: input.deliveryEnabled ?? false,
      flatFee: 0,
      freeOver: null,
      minimumOrder: 0,
      areas: "",
      estimate: "",
      quoteRequired: false,
      autoAccept: false,
      prepMinutes: 0,
      cutoff: "",
      cutoffTime: null,
      collectionWindows: "",
      timezone: "Africa/Harare",
      weeklyHours: [],
      windows: [],
    },
    payments: {
      payOnPickup: input.payOnPickup ?? true,
      payOnDelivery: input.payOnDelivery ?? false,
      quotes: false,
      acceptPaynow: false,
      cashCurrencies: "",
      exactCash: false,
      changeProvided: true,
    },
  };
}
