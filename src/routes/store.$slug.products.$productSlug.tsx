import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { ProductView } from "@/components/storefront/store-experience";
import { emptyProductReviews } from "@/lib/storefront/contract";
import { getProductReviewsFn, getPublicStoreFn } from "@/lib/storefront/storefront.functions";
import { storePublicUrl } from "@/lib/storefront/host";
import { Route as StoreRoute } from "./store.$slug";

export const Route = createFileRoute("/store/$slug/products/$productSlug")({
  validateSearch: z.object({
    preview: z
      .union([z.literal("1"), z.literal(1)])
      .optional()
      .catch(undefined),
  }),
  loader: async ({ params }) => {
    // Parent /store/$slug already loaded the catalogue. One focused RPC is enough
    // to resolve this slug; do not call get_public_store twice per product view.
    const focused = await getPublicStoreFn({
      data: { slug: params.slug, category: `slug:${params.productSlug}` },
    });
    const product = focused?.products.find((item) => item.slug === params.productSlug);
    if (!focused || !product) throw notFound();
    let reviews = emptyProductReviews;
    try {
      reviews = await getProductReviewsFn({
        data: { slug: params.slug, productId: product.id },
      });
    } catch {
      reviews = emptyProductReviews;
    }
    return { product, reviews };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: "Product" }] };
    const product = loaderData.product;
    const reviews = loaderData.reviews;
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
      ...(reviews.count > 0 && reviews.average != null
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: reviews.average,
              reviewCount: reviews.count,
            },
          }
        : {}),
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
      links: [
        {
          rel: "canonical",
          href: storePublicUrl(params.slug, `/products/${params.productSlug}`),
        },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const { store } = StoreRoute.useLoaderData();
  const { product, reviews } = Route.useLoaderData();
  return (
    <ProductView
      store={{
        ...store,
        products: store.products.some((item) => item.id === product.id)
          ? store.products
          : [product, ...store.products],
      }}
      product={product}
      reviews={reviews}
    />
  );
}
