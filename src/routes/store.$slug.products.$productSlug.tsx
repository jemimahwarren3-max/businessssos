import { createFileRoute, notFound } from "@tanstack/react-router";
import { ProductView } from "@/components/storefront/store-experience";
import { getPublicStoreFn } from "@/lib/storefront/storefront.functions";
import { Route as StoreRoute } from "./store.$slug";

export const Route = createFileRoute("/store/$slug/products/$productSlug")({
  loader: async ({ params }) => {
    const parent = await getPublicStoreFn({ data: { slug: params.slug } });
    const focused = await getPublicStoreFn({
      data: { slug: params.slug, category: `slug:${params.productSlug}` },
    });
    const product =
      parent?.products.find((item) => item.slug === params.productSlug) ??
      focused?.products.find((item) => item.slug === params.productSlug);
    if (!parent || !product) throw notFound();
    return { product };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: "Product" }] };
    const product = loaderData.product;
    const description = (product.description || product.name).slice(0, 180);
    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description,
      ...(product.imageUrl ? { image: product.imageUrl } : {}),
      offers: {
        "@type": "Offer",
        priceCurrency: product.currency,
        price: product.price,
        availability: product.available
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      },
    }).replace(/</g, "\\u003c");
    return {
      meta: [
        { title: product.name },
        { name: "description", content: description },
        { property: "og:title", content: product.name },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        ...(product.imageUrl ? [{ property: "og:image", content: product.imageUrl }] : []),
      ],
      scripts: [{ type: "application/ld+json", children: jsonLd }],
      links: [{ rel: "canonical", href: `/store/${params.slug}/products/${params.productSlug}` }],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const { store } = StoreRoute.useLoaderData();
  const { product } = Route.useLoaderData();
  return (
    <ProductView
      store={{
        ...store,
        products: store.products.some((item) => item.id === product.id)
          ? store.products
          : [product, ...store.products],
      }}
      product={product}
    />
  );
}
