import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminShopOrdersFn } from "@/lib/admin/admin.functions";
import { formatMoney, friendlyDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/orders")({
  component: AdminOrdersPage,
});

function AdminOrdersPage() {
  const fetch = useServerFn(getAdminShopOrdersFn);
  const list = useQuery({
    queryKey: ["admin-shop-orders"],
    queryFn: () => fetch(),
  });

  return (
    <AdminShell title="Shop orders">
      <p className="text-sm text-muted-foreground">
        Recent customer checkout orders across all merchants. Payment and fulfilment status only —
        open the merchant&apos;s Online orders desk for actions.
      </p>
      {list.isLoading ? <Skeleton className="h-64" /> : null}
      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Fulfilment</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(list.data ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                <TableCell>{row.business_name}</TableCell>
                <TableCell>{row.customer_name}</TableCell>
                <TableCell className="tabular-nums">
                  {formatMoney(Number(row.total), row.currency)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{row.payment_status}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{row.fulfilment_status}</Badge>
                </TableCell>
                <TableCell>{friendlyDateTime(row.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}
