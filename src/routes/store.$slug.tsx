import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { StoreChrome, StorePreviewProvider } from "@/components/storefront/store-experience";
import { StoreAnalyticsProvider } from "@/components/storefront/store-analytics";
import { ShopNotLive } from "@/components/storefront/shop-not-live";
import { parseStorePreviewSearch } from "@/lib/storefront/preview-search";
import { decideStorePage } from "@/lib/storefront/store-page";
import { getPublicStoreFn, getStorePreviewFn } from "@/lib/storefront/storefront.functions";
import { getTemplate } from "@/lib/storefront/templates";
import { storePublicUrl } from "@/lib/storefront/host";

export const Route = createFileRoute("/store/$slug")({
  validateSearch: parseStorePreviewSearch,
  loaderDeps: ({ search }) => ({ preview: search.preview === 1 }),
  loader: async ({ params, deps }) => {
    let store = null;
    let previewFailed = false;
    if (deps.preview) {
      try {
        store = await getStorePreviewFn({ data: { slug: params.slug } });
      } catch (error) {
        console.error("[businessos] draft shop preview", error);
        previewFailed = true;
      }
    } else {
      store = await getPublicStoreFn({ data: { slug: params.slug } });
    }
    const page = decideStorePage({
      preview: deps.preview,
      storeFound: Boolean(store),
      previewFailed,
    });
    if (page.kind === "setup") throw redirect({ to: "/onboarding", replace: true });
    if (page.kind === "unpublished" || !store) throw notFound();
    return { store, preview: page.preview };
  },
  notFoundComponent: ShopNotLive,
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Shop" }] };
    const { store, preview } = loaderData;
    const description =
      store.content.seoDescription || store.tagline || store.about || `Shop ${store.storeName}`;
    const template = getTemplate(store.templateId);
    const url = storePublicUrl(store.slug);
    const storeJsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Store",
      name: store.storeName,
      description: description.slice(0, 180),
      url,
      ...(store.logoUrl ? { logo: store.logoUrl } : {}),
      ...(store.theme.coverUrl ? { image: store.theme.coverUrl } : {}),
    }).replace(/</g, "\\u003c");
    return {
      meta: [
        { title: store.content.seoTitle || store.storeName },
        { name: "description", content: description.slice(0, 180) },
        { property: "og:title", content: store.storeName },
        { property: "og:description", content: description.slice(0, 180) },
        { property: "og:type", content: "website" },
        ...(store.theme.coverUrl || store.logoUrl
          ? [{ property: "og:image", content: store.theme.coverUrl || store.logoUrl || "" }]
          : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: store.storeName },
        { name: "twitter:description", content: description.slice(0, 180) },
        ...(preview ? [{ name: "robots", content: "noindex, nofollow" }] : []),
      ],
      scripts: preview ? [] : [{ type: "application/ld+json", children: storeJsonLd }],
      links: [
        { rel: "stylesheet", href: template.fontHref },
        ...(preview ? [] : [{ rel: "canonical", href: url }]),
      ],
    };
  },
  component: StoreLayout,
});

function StoreLayout() {
  const { store, preview } = Route.useLoaderData();
  return (
    <StoreAnalyticsProvider slug={store.slug} preview={preview}>
      <StorePreviewProvider preview={preview}>
        <StoreChrome store={store} preview={preview}>
          <Outlet />
        </StoreChrome>
      </StorePreviewProvider>
    </StoreAnalyticsProvider>
  );
}
