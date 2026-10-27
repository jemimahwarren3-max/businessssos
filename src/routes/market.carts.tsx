import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CustomerShoppingShell } from "@/components/storefront/customer-shopping-shell";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { listSavedCarts, type SavedCartSummary } from "@/lib/storefront/cart-registry";
import { storePublicUrl } from "@/lib/storefront/host";

export const Route = createFileRoute("/market/carts")({
  head: () => ({
    meta: [{ title: `Your carts | ${BRAND.name}` }, { name: "robots", content: "noindex" }],
  }),
  component: MarketCartsPage,
});

function MarketCartsPage() {
  const [carts, setCarts] = useState<SavedCartSummary[]>([]);

  useEffect(() => {
    setCarts(listSavedCarts());
  }, []);

  return (
    <CustomerShoppingShell>
      <p className="text-sm text-muted-foreground">Shopping</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your carts</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Kwetuu keeps a separate cart for each shop. Checkout always completes with the seller who
        listed the products — you cannot mix two shops in one order.
      </p>

      {carts.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No saved carts yet.</p>
          <Button asChild className="mt-4">
            <Link to="/market" search={{ q: "", category: "" }}>
              Browse products
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-8 divide-y rounded-lg border">
          {carts.map((cart) => (
            <li
              key={cart.slug}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{cart.slug}</p>
                <p className="text-sm text-muted-foreground">
                  {cart.lineCount} line{cart.lineCount === 1 ? "" : "s"} · {cart.totalQuantity} item
                  {cart.totalQuantity === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={storePublicUrl(cart.slug, "/cart")}>View cart</a>
                </Button>
                <Button asChild size="sm">
                  <a href={storePublicUrl(cart.slug, "/checkout")}>Checkout</a>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CustomerShoppingShell>
  );
}
