import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { z } from "zod";
import { StoreChrome, StorePreviewProvider } from "@/components/storefront/store-experience";
import { getPublicStoreFn, getStorePreviewFn } from "@/lib/storefront/storefront.functions";
import { getTemplate } from "@/lib/storefront/templates";

const searchSchema = z.object({
  preview: z
    .union([z.literal("1"), z.literal(1)])
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/store/$slug")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ preview: search.preview }),
  loader: async ({ params, deps }) => {
    try {
      const store = deps.preview
        ? await getStorePreviewFn({ data: { slug: params.slug } })
        : await getPublicStoreFn({ data: { slug: params.slug } });
      if (!store) throw notFound();
      return { store, preview: Boolean(deps.preview) };
    } catch (error) {
      if (deps.preview) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Shop" }] };
    const { store, preview } = loaderData;
    const description = store.tagline || store.about || `Shop ${store.storeName}`;
    const template = getTemplate(store.templateId);
    return {
      meta: [
        { title: `${store.storeName}` },
        { name: "description", content: description.slice(0, 180) },
        { property: "og:title", content: store.storeName },
        { property: "og:description", content: description.slice(0, 180) },
        { property: "og:type", content: "website" },
        ...(store.theme.coverUrl || store.logoUrl
          ? [{ property: "og:image", content: store.theme.coverUrl || store.logoUrl || "" }]
          : []),
        ...(preview ? [{ name: "robots", content: "noindex, nofollow" }] : []),
      ],
      links: [{ rel: "stylesheet", href: template.fontHref }],
    };
  },
  component: StoreLayout,
});

function StoreLayout() {
  const { store, preview } = Route.useLoaderData();
  return (
    <StorePreviewProvider preview={preview}>
      <StoreChrome store={store} preview={preview}>
        <Outlet />
      </StoreChrome>
    </StorePreviewProvider>
  );
}
