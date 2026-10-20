import { createFileRoute } from "@tanstack/react-router";
import { Catalog } from "@/components/storefront/store-experience";
import { Route as StoreRoute } from "./store.$slug";

export const Route = createFileRoute("/store/$slug/")({
  component: StoreHome,
});

function StoreHome() {
  const { store } = StoreRoute.useLoaderData();
  return <Catalog store={store} />;
}
