import type { Json } from "@/integrations/supabase/types";
import { configuredPlatformOrigin } from "@/lib/storefront/host";
import { BRAND } from "@/lib/brand";
import {
  renderOrderEmail,
  type OrderEmailContext,
  type OrderEmailItem,
  type OrderEmailTemplateKey,
} from "./order-email-templates";

type RpcClient = { rpc: (...args: never[]) => unknown };

async function untypedRpc(
  client: RpcClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: Json | null; error: { message?: string } | null }> {
  return (await (
    client.rpc as (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ data: Json | null; error: { message?: string } | null }>
  )(fn, args)) as { data: Json | null; error: { message?: string } | null };
}

export async function renderOutboxOrderEmail(
  client: RpcClient,
  input: {
    template: string;
    orderId: string;
    metadata: Record<string, unknown>;
    fallbackSubject: string;
    fallbackBody: string;
  },
): Promise<{ subject: string; text: string; html: string }> {
  const template = input.template as OrderEmailTemplateKey;
  if (
    ![
      "customer.order.placed",
      "customer.order.status",
      "customer.payment.updated",
      "merchant.order.event",
    ].includes(template)
  ) {
    return {
      subject: input.fallbackSubject,
      text: input.fallbackBody,
      html: `<pre>${input.fallbackBody.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] ?? c)}</pre>`,
    };
  }

  const result = await untypedRpc(client, "get_order_notification_context", {
    _order_id: input.orderId,
  });
  if (result.error || !result.data || typeof result.data !== "object") {
    return {
      subject: input.fallbackSubject,
      text: input.fallbackBody,
      html: `<p>${input.fallbackBody}</p>`,
    };
  }
  const row = result.data as Record<string, unknown>;
  const origin = configuredPlatformOrigin() ?? BRAND.appUrl;
  const slug = String(row["storeSlug"] ?? "");
  const reference = String(row["orderReference"] ?? "");
  const orderUrl = slug && reference ? `${origin}/store/${slug}/order/${reference}` : undefined;

  const eventMessage =
    typeof input.metadata["eventMessage"] === "string" ? input.metadata["eventMessage"] : undefined;
  const eventType =
    typeof input.metadata["eventType"] === "string" ? input.metadata["eventType"] : undefined;
  const accessToken =
    template === "customer.order.placed" && typeof input.metadata["accessToken"] === "string"
      ? input.metadata["accessToken"]
      : undefined;

  const ctx: OrderEmailContext = {
    storeName: String(row["storeName"] ?? "Shop"),
    storeSlug: slug,
    orderReference: reference,
    customerName: String(row["customerName"] ?? "Customer"),
    currency: String(row["currency"] ?? "USD"),
    subtotal: Number(row["subtotal"] ?? 0),
    deliveryFee: Number(row["deliveryFee"] ?? 0),
    tax: Number(row["tax"] ?? 0),
    total: Number(row["total"] ?? 0),
    fulfilmentMethod: String(row["fulfilmentMethod"] ?? ""),
    fulfilmentStatus: String(row["fulfilmentStatus"] ?? ""),
    paymentMethod: String(row["paymentMethod"] ?? ""),
    paymentStatus: String(row["paymentStatus"] ?? ""),
    platformName: BRAND.name,
    ...(eventMessage ? { eventMessage } : {}),
    ...(eventType ? { eventType } : {}),
    ...(accessToken ? { accessToken } : {}),
    ...(orderUrl ? { orderUrl } : {}),
  };

  const itemsRaw = Array.isArray(row["items"]) ? row["items"] : [];
  const items: OrderEmailItem[] = itemsRaw.map((item) => {
    const line = item as Record<string, unknown>;
    return {
      name: String(line["name"] ?? "Item"),
      quantity: Number(line["quantity"] ?? 0),
      lineTotal: Number(line["lineTotal"] ?? 0),
    };
  });

  const audience = template.startsWith("merchant.") ? "merchant" : "customer";
  return renderOrderEmail({ template, audience, ctx, items });
}
