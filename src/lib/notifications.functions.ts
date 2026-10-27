import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Db } from "@/lib/business.server";
import { authedRateLimit } from "@/lib/rate-limit.server";
import { parseAndSanitize } from "@/lib/security";
import {
  listOrderEmailDeliveries,
  retryOrderEmailDelivery,
} from "@/lib/notifications.server";

const authed = [
  authedRateLimit({ keyPrefix: "order-notifications", maxRequests: 40, windowSeconds: 60 }),
] as const;

export const listOrderEmailDeliveriesFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({ businessId: z.string().uuid(), orderId: z.string().uuid() }),
      data,
    ),
  )
  .handler(async ({ data, context }) =>
    listOrderEmailDeliveries(context.supabase as Db, data.businessId, data.orderId),
  );

export const retryOrderEmailDeliveryFn = createServerFn({ method: "POST" })
  .middleware(authed)
  .inputValidator((data: unknown) =>
    parseAndSanitize(
      z.object({ businessId: z.string().uuid(), outboxId: z.string().uuid() }),
      data,
    ),
  )
  .handler(async ({ data, context }) => {
    const rows = await retryOrderEmailDelivery(
      context.supabase as Db,
      data.businessId,
      data.outboxId,
    );
    return rows;
  });
