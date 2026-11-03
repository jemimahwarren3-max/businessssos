import type { AdminStore } from "@/lib/storefront/contract";

export type StoreLaunchPhase =
  "not_set_up" | "draft" | "payment_required" | "ready_to_launch" | "live";

export type StoreLaunchDisplay = {
  phase: StoreLaunchPhase;
  /** Short label for badges */
  badge: string;
  /** One line for nav / dashboard */
  headline: string;
};

const PUBLISH_KEYS = [
  "name",
  "template",
  "products",
  "payments",
  "fulfilment",
  "policies",
  "previewed",
] as const;

function publishReady(checklist: AdminStore["checklist"]): boolean {
  return PUBLISH_KEYS.every((key) => checklist[key]);
}

export function deriveStoreLaunchDisplay(input: {
  checklist: AdminStore["checklist"];
  storeStatus: string | null | undefined;
  billingEnabled: boolean;
  isOperateLocked: boolean;
}): StoreLaunchDisplay {
  const { checklist, storeStatus, billingEnabled, isOperateLocked } = input;

  if (storeStatus === "published") {
    return {
      phase: "live",
      badge: "Live",
      headline: "Your shop is published — share the link and manage online orders.",
    };
  }

  if (!checklist.name) {
    return {
      phase: "not_set_up",
      badge: "Not set up",
      headline: "Add a shop name and basics to start your online store.",
    };
  }

  if (billingEnabled && isOperateLocked && publishReady(checklist)) {
    return {
      phase: "payment_required",
      badge: "Payment required",
      headline: "Setup is complete — pay for Pro to publish and take online orders.",
    };
  }

  if (publishReady(checklist)) {
    return {
      phase: "ready_to_launch",
      badge: "Ready to launch",
      headline: "Every checklist item is done. Review, then publish when you are ready.",
    };
  }

  return {
    phase: "draft",
    badge: "Draft",
    headline: "Your shop is in draft — finish the steps below before going live.",
  };
}

export type LaunchStep = {
  id: string;
  step: number;
  title: string;
  description: string;
  done: boolean;
  to: "/storefront" | "/notifications";
  hash?: string;
};

/** Maps storefront URL hashes to Store builder tabs so the target is mounted. */
export const STORE_BUILDER_TAB_BY_HASH: Record<string, string> = {
  "store-builder": "branding",
  "launch-design": "design",
  "launch-products": "products",
  "launch-payments": "info",
  "launch-fulfilment": "info",
};

/** Scroll target on `/storefront` for the review-and-publish step (not a builder tab). */
export const LAUNCH_PUBLISH_HASH = "launch-publish";

export function storeBuilderTabFromHash(hash: string | undefined | null): string | null {
  const id = (hash ?? "").replace(/^#/, "");
  return STORE_BUILDER_TAB_BY_HASH[id] ?? null;
}

/** True when a dashboard launch-card hash has a real target on `/storefront`. */
export function launchHashHasPageTarget(hash: string | undefined | null): boolean {
  const id = (hash ?? "").replace(/^#/, "");
  if (!id) return false;
  return id === LAUNCH_PUBLISH_HASH || storeBuilderTabFromHash(id) != null;
}

export function buildLaunchSteps(
  checklist: AdminStore["checklist"],
  options: { notificationsConfigured?: boolean },
): LaunchStep[] {
  const notificationsConfigured = options.notificationsConfigured ?? false;

  return [
    {
      id: "setup",
      step: 1,
      title: "Set up your store",
      description: "Name, contact details, and where customers find you.",
      done: checklist.name,
      to: "/storefront",
      hash: "store-builder",
    },
    {
      id: "design",
      step: 2,
      title: "Choose your design",
      description: "Pick a template, colours, and preview the customer view.",
      done: checklist.template && checklist.previewed,
      to: "/storefront",
      hash: "launch-design",
    },
    {
      id: "products",
      step: 3,
      title: "Add products",
      description: "Choose which catalogue items appear on the public shop.",
      done: checklist.products,
      to: "/storefront",
      hash: "launch-products",
    },
    {
      id: "payments",
      step: 4,
      title: "Set up payments",
      description: "Turn on cash, manual pay-in, or seller Paynow when approved.",
      done: checklist.payments,
      to: "/storefront",
      hash: "launch-payments",
    },
    {
      id: "fulfilment",
      step: 5,
      title: "Delivery or collection",
      description: "Pickup, delivery zones, fees, and opening hours for checkout.",
      done: checklist.fulfilment,
      to: "/storefront",
      hash: "launch-fulfilment",
    },
    {
      id: "notifications",
      step: 6,
      title: "Order alerts",
      description: "In-app alerts and email — configure who gets notified.",
      done: notificationsConfigured,
      to: "/notifications",
    },
    {
      id: "launch",
      step: 7,
      title: "Review and launch",
      description: "Save your draft, check the checklist, then publish the shop link.",
      done: checklist.published,
      to: "/storefront",
      hash: "launch-publish",
    },
  ];
}
