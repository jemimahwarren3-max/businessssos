import { createFileRoute } from "@tanstack/react-router";
import { authorizeMailFlush } from "@/lib/notifications.mail";
import { flushNotificationOutboxAdmin } from "@/lib/notifications.mail.server";
import { flushWhatsAppOutboxAdmin } from "@/lib/notifications.whatsapp.server";

export const Route = createFileRoute("/api/internal/flush-mail")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["MAIL_FLUSH_SECRET"];
        if (!authorizeMailFlush(request.headers.get("authorization"), secret)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const email = await flushNotificationOutboxAdmin();
        const whatsapp = await flushWhatsAppOutboxAdmin();
        return Response.json({ email, whatsapp });
      },
    },
  },
});
