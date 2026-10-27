import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminStorefrontsFn } from "@/lib/admin/admin.functions";
import { friendlyDate } from "@/lib/format";
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
import { storePublicUrl } from "@/lib/storefront/host";

export const Route = createFileRoute("/admin/stores")({
  component: AdminStoresPage,
});

function AdminStoresPage() {
  const fetch = useServerFn(getAdminStorefrontsFn);
  const list = useQuery({
    queryKey: ["admin-storefronts"],
    queryFn: () => fetch(),
  });

  return (
    <AdminShell title="Storefronts">
      <p className="text-sm text-muted-foreground">
        Every shop configured on Kwetuu — draft or live. Open the public URL only when status is
        published.
      </p>
      {list.isLoading ? <Skeleton className="h-64" /> : null}
      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shop</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Listings</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Published</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(list.data ?? []).map((row) => (
              <TableRow key={row.business_id}>
                <TableCell>
                  <p className="font-medium">{row.store_name}</p>
                  {row.status === "published" ? (
                    <a
                      className="text-xs text-primary underline"
                      href={storePublicUrl(row.slug)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.slug}
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">{row.slug}</span>
                  )}
                </TableCell>
                <TableCell>{row.business_name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{row.status}</Badge>
                </TableCell>
                <TableCell className="text-xs">{row.template_id}</TableCell>
                <TableCell>{row.listing_count}</TableCell>
                <TableCell>{row.order_count}</TableCell>
                <TableCell>
                  {row.published_at ? friendlyDate(row.published_at) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}
