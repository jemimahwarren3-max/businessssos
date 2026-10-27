import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import { getLocations } from "@/lib/business.functions";
import { readableError } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/branches")({
  head: () => ({
    meta: [{ title: "Branches & locations | Kwetuu" }, { name: "robots", content: "noindex" }],
  }),
  component: BranchesPage,
});

function BranchesPage() {
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const fetchLocations = useServerFn(getLocations);
  const locations = useQuery({
    queryKey: ["locations", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchLocations({ data: { businessId: businessId! } }),
  });

  if (!workspace.data) {
    return (
      <AppShell businessName="" role="" plan="" title="Branches">
        <Skeleton className="h-32" />
      </AppShell>
    );
  }

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      title="Branches & locations"
      subtitle="Stock and POS use a default location today. Additional branches share reporting at business level."
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Each location can hold its own stock count. POS sales and adjustments use your default
        branch. Online checkout collection points follow the shop fulfilment settings in{" "}
        <Link to="/storefront" className="font-medium text-primary underline">
          My Online Store
        </Link>
        . Adding or editing branches in the app is coming next — contact support if you need a
        second branch configured on staging.
      </p>
      {locations.isLoading ? <Skeleton className="h-24" /> : null}
      {locations.isError ? (
        <p className="text-sm text-destructive">
          {readableError(locations.error as Error, "Locations could not be loaded.")}
        </p>
      ) : null}
      <ul className="divide-y rounded-lg border">
        {(locations.data ?? []).length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">No locations yet.</li>
        ) : null}
        {(locations.data ?? []).map((loc) => (
          <li key={loc.id} className="space-y-1 p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {loc.name}
              {loc.is_default ? <Badge variant="secondary">Default (POS)</Badge> : null}
              {!loc.is_active ? <Badge variant="outline">Inactive</Badge> : null}
            </p>
            {loc.address ? <p className="text-muted-foreground">{loc.address}</p> : null}
            {loc.phone ? <p className="text-muted-foreground">{loc.phone}</p> : null}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
