import { BRAND } from "@/lib/brand";
import { UNPUBLISHED_SHOP } from "@/lib/storefront/store-page";

export function ShopNotLive() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-foreground">{UNPUBLISHED_SHOP.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{UNPUBLISHED_SHOP.body}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <a
            href="/onboarding"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {UNPUBLISHED_SHOP.setupLabel}
          </a>
          <a
            href={BRAND.appUrl}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {UNPUBLISHED_SHOP.homeLabel}
          </a>
        </div>
      </div>
    </div>
  );
}
