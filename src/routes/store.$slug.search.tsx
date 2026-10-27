import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Catalog } from "@/components/storefront/store-experience";
import { getPublicStoreFn } from "@/lib/storefront/storefront.functions";
import { Route as StoreRoute } from "./store.$slug";

const searchSchema = z.object({
  q: z.string().max(80).optional().catch(""),
  preview: z
    .union([z.literal("1"), z.literal(1)])
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/store/$slug/search")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ q: search.q ?? "" }),
  loader: async ({ params, deps }) => {
    const store = await getPublicStoreFn({
      data: { slug: params.slug, query: deps.q, sort: "name" },
    });
    return { results: store };
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: SearchPage,
});

function SearchPage() {
  const parent = StoreRoute.useLoaderData();
  const { results } = Route.useLoaderData();
  const { q } = Route.useSearch();
  const [value, setValue] = useState(q ?? "");
  const navigate = Route.useNavigate();
  const store = results ?? parent.store;
  return (
    <div>
      <form
        className="mx-auto flex max-w-6xl gap-2 px-4 pt-6"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate({ search: (prev) => ({ ...prev, q: value }) });
        }}
      >
        <label className="sr-only" htmlFor="store-search">
          Search products
        </label>
        <input
          id="store-search"
          className="w-full rounded-md border px-3 py-2"
          style={{
            backgroundColor: store.theme.surface,
            color: store.theme.text,
            borderColor: store.theme.accent + "70",
          }}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search products"
        />
        <button
          className="rounded-md px-4 py-2 text-sm"
          style={{ backgroundColor: store.theme.button, color: store.theme.buttonText }}
          type="submit"
        >
          Search
        </button>
      </form>
      <Catalog store={{ ...store, heroTitle: "Search", heroSubtitle: "" }} query={q ?? ""} />
    </div>
  );
}
