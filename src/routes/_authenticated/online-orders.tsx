import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { OnlineOrdersFulfilmentPanel } from "@/components/storefront/online-orders-fulfilment-panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import { readableError } from "@/lib/format";
import { getStorefrontAdminFn } from "@/lib/storefront/storefront.functions";

export const Route = createFileRoute("/_authenticated/online-orders")({
  head: () => ({
    meta: [{ title: "Online orders | Kwetuu" }, { name: "robots", content: "noindex" }],
  }),
  component: OnlineOrdersPage,
});

function OnlineOrdersPage() {
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const load = useServerFn(getStorefrontAdminFn);
  const admin = useQuery({
    queryKey: ["storefront", businessId],
    enabled: Boolean(businessId),
    queryFn: () => load({ data: { businessId: businessId! } }),
  });

  if (!workspace.data) {
    return (
      <AppShell businessName="" role="" plan="" title="Online orders">
        <Skeleton className="h-32" />
      </AppShell>
    );
  }

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Orders & fulfilment"
      subtitle="Online shop orders — confirm payment, prepare, dispatch, or mark collected."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/storefront">My Online Store</Link>
        </Button>
      }
    >
      {admin.isLoading ? <Skeleton className="h-48" /> : null}
      {admin.isError ? (
        <p className="text-sm text-destructive">
          {readableError(admin.error as Error, "Orders could not be loaded.")}
        </p>
      ) : null}
      {admin.data && businessId ? (
        <OnlineOrdersFulfilmentPanel
          businessId={businessId}
          orders={admin.data.orders}
          storeName={admin.data.store?.storeName ?? workspace.data.business.name}
          showTitle={false}
        />
      ) : null}
    </AppShell>
  );
}
