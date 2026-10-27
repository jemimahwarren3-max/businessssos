import type { ManualPaymentMethod } from "./manual-payments";
import type { StorefrontContent } from "./contract";
import type { StorefrontTheme } from "./theme";
import type { CollectionWindow } from "./clocks";
import type { HoursState } from "@/components/storefront/hours-editor";
import type { CollectionPoint, DeliveryZone } from "./delivery-zones";

export type StoreBuilderSnapshot = {
  storeName: string;
  slug: string;
  phone: string;
  whatsapp: string;
  tagline: string;
  about: string;
  email: string;
  socials: { instagram: string; facebook: string; website: string; tiktok: string };
  content: StorefrontContent;
  policies: string;
  hours: string;
  address: string;
  heroTitle: string;
  heroSubtitle: string;
  logoUrl: string;
  templateId: string;
  theme: StorefrontTheme;
  pickup: boolean;
  delivery: boolean;
  flatFee: string;
  freeOver: string;
  minimum: string;
  areas: string;
  estimate: string;
  quoteRequired: boolean;
  pricingMethod: string;
  deliveryInstructions: string;
  collectionInstructions: string;
  zones: DeliveryZone[];
  collectionPoints: CollectionPoint[];
  autoAccept: boolean;
  prepMinutes: string;
  cutoffTime: string;
  hoursState: HoursState;
  windows: CollectionWindow[];
  payPickup: boolean;
  payDelivery: boolean;
  quotes: boolean;
  cashCurrencies: string;
  exactCash: boolean;
  changeProvided: boolean;
  acceptPaynow: boolean;
  manualMethods: ManualPaymentMethod[];
};

export function snapshotsEqual(a: StoreBuilderSnapshot, b: StoreBuilderSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
