import { createFileRoute } from "@tanstack/react-router";

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { listPublicPaths } = await import("@/lib/storefront/storefront.server");
        const { getAppUrl } = await import("@/lib/app-url.server");
        let origin = "";
        try {
          origin = getAppUrl();
        } catch {
          origin = "";
        }
        const stores = origin ? await listPublicPaths() : [];
        const urls = [
          ...(origin ? [`${origin}/market`] : []),
          ...stores.flatMap((store) => [
            `${origin}/store/${store.slug}`,
            ...store.products.map((product) => `${origin}/store/${store.slug}/products/${product}`),
          ]),
        ];
        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${xmlEscape(url)}</loc></url>`).join("\n")}
</urlset>`;
        return new Response(body, {
          headers: { "content-type": "application/xml; charset=utf-8" },
        });
      },
    },
  },
});
