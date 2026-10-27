import { z } from "zod";

export const launchEligibilityStates = [
  "setup_incomplete",
  "ready_for_review",
  "launch_fee_unpaid",
  "payment_pending_verification",
  "payment_verification_failed",
  "subscription_inactive",
  "eligible_to_publish",
  "published",
  "suspended",
  "blocked",
] as const;

export type LaunchEligibilityState = (typeof launchEligibilityStates)[number];

const latestLaunchPaymentSchema = z
  .object({
    reference: z.string(),
    status: z.string(),
    amount: z.coerce.number(),
    currency: z.string(),
    createdAt: z.string(),
  })
  .nullable()
  .optional();

export const storeLaunchEligibilitySchema = z.object({
  state: z.enum(launchEligibilityStates),
  storeStatus: z.string(),
  suspended: z.boolean(),
  suspendReason: z.string(),
  setupComplete: z.boolean(),
  checklist: z.record(z.string(), z.boolean()),
  billingEnforced: z.boolean(),
  launchFeeRequired: z.boolean(),
  launchFeeUsd: z.coerce.number(),
  launchFeeSatisfied: z.boolean(),
  launchFeeWaived: z.boolean(),
  subscriptionActive: z.boolean(),
  onlineShopEnabled: z.boolean(),
  latestLaunchPayment: latestLaunchPaymentSchema,
});

export type StoreLaunchEligibility = z.infer<typeof storeLaunchEligibilitySchema>;

export function launchEligibilityHeadline(state: LaunchEligibilityState): string {
  switch (state) {
    case "published":
      return "Your shop is live on the public internet.";
    case "suspended":
      return "This shop is suspended. Contact Kwetuu support.";
    case "blocked":
      return "Online shop access is disabled for this business.";
    case "launch_fee_unpaid":
      return "Setup is complete — pay the Kwetuu store launch fee to publish.";
    case "payment_pending_verification":
      return "Launch fee payment is pending verification with Paynow.";
    case "payment_verification_failed":
      return "The last launch fee payment did not verify. Try again or contact support.";
    case "subscription_inactive":
      return "An active Kwetuu subscription is required before you can publish.";
    case "eligible_to_publish":
      return "All requirements are met. You can publish when ready.";
    case "ready_for_review":
      return "Finish the launch checklist, then review your store.";
    default:
      return "Complete store setup before launching.";
  }
}
