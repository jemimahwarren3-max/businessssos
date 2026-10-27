import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminBusinessDetailFn } from "@/lib/admin/admin.functions";
import { formatMoney, friendlyDate, friendlyDateTime, readableError } from "@/lib/format";
import { storePublicUrl } from "@/lib/storefront/host";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/businesses/$businessId")({
  component: AdminBusinessDetailPage,
});

function AdminBusinessDetailPage() {
  const { businessId } = Route.useParams();
  const fetch = useServerFn(getAdminBusinessDetailFn);
  const detail = useQuery({
    queryKey: ["admin-business", businessId],
    queryFn: () => fetch({ data: { businessId } }),
  });

  if (detail.isLoading) {
    return (
      <AdminShell title="Business">
        <Skeleton className="h-64" />
      </AdminShell>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <AdminShell title="Business">
        <p className="text-sm text-destructive">
          {detail.isError
            ? readableError(detail.error as Error, "Could not load this business.")
            : "Business not found."}
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/admin/businesses">Back to list</Link>
        </Button>
      </AdminShell>
    );
  }

  const data = detail.data;
  const sf = data.storefront;

  return (
    <AdminShell title={data.business.name}>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/businesses">All businesses</Link>
        </Button>
        {sf?.status === "published" ? (
          <Button asChild size="sm" variant="outline">
            <a href={storePublicUrl(sf.slug)} target="_blank" rel="noreferrer">
              Open live shop
            </a>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Products", data.counts.products],
          ["Store orders", data.counts.store_orders],
          ["Sales rows", data.counts.sales],
          ["Team", data.counts.members],
        ].map(([label, value]) => (
          <div key={String(label)} className="surface p-3">
            <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Subscription</h2>
          {data.subscription ? (
            <>
              <p>
                Plan: <Badge variant="outline">{data.subscription.plan}</Badge> ·{" "}
                {data.subscription.status}
              </p>
              <p className="text-muted-foreground">
                Trial ends:{" "}
                {data.subscription.trial_ends_at
                  ? friendlyDate(data.subscription.trial_ends_at)
                  : "—"}
              </p>
              <p className="text-muted-foreground">
                Period ends:{" "}
                {data.subscription.current_period_end
                  ? friendlyDate(data.subscription.current_period_end)
                  : "—"}
              </p>
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link to="/admin/billing">Override in billing</Link>
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">No subscription row.</p>
          )}
        </section>
        <section className="surface space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Storefront</h2>
          {sf ? (
            <>
              <p>{sf.store_name}</p>
              <p>
                <Badge variant="outline">{sf.status}</Badge> · {sf.template_id}
              </p>
              <p className="font-mono text-xs">{sf.slug}</p>
            </>
          ) : (
            <p className="text-muted-foreground">No storefront configured.</p>
          )}
        </section>
      </div>

      <section className="surface overflow-x-auto p-4">
        <h2 className="mb-2 text-sm font-semibold">Team</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Shop alert email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.members.map((m) => (
              <TableRow key={m.user_id}>
                <TableCell>{m.email ?? m.user_id}</TableCell>
                <TableCell className="capitalize">{m.role}</TableCell>
                <TableCell>{m.notify_email ? "On" : "Off"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="surface overflow-x-auto p-4">
        <h2 className="mb-2 text-sm font-semibold">Recent store orders</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Fulfilment</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.recent_orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No orders yet.
                </TableCell>
              </TableRow>
            ) : null}
            {data.recent_orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.reference}</TableCell>
                <TableCell>{o.customer_name}</TableCell>
                <TableCell>{formatMoney(Number(o.total), o.currency)}</TableCell>
                <TableCell>{o.payment_status}</TableCell>
                <TableCell>{o.fulfilment_status}</TableCell>
                <TableCell>{friendlyDateTime(o.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <p className="text-xs text-muted-foreground">
        Created {friendlyDate(data.business.created_at)} · {data.business.currency} ·{" "}
        {data.business.business_type}
      </p>
    </AdminShell>
  );
}
