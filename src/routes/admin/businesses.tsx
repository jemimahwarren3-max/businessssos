import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/admin-shell";
import { exportAdminTenantsCsvFn, getAdminBusinessesFn } from "@/lib/admin/admin.functions";
import { friendlyDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/businesses")({
  component: AdminBusinessesPage,
});

function AdminBusinessesPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const fetch = useServerFn(getAdminBusinessesFn);
  const exportCsv = useServerFn(exportAdminTenantsCsvFn);
  const [exporting, setExporting] = useState(false);
  const list = useQuery({
    queryKey: ["admin-businesses", query],
    queryFn: () => fetch({ data: { search: query || undefined, limit: 200 } }),
  });

  return (
    <AdminShell title="Businesses">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
        }}
      >
        <Input
          className="max-w-sm"
          placeholder="Search name or shop slug…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="submit">Search</Button>
        <Button
          type="button"
          variant="outline"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              const csv = await exportCsv();
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `kwetuu-tenants-${new Date().toISOString().slice(0, 10)}.csv`;
              anchor.click();
              URL.revokeObjectURL(url);
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? "Exporting…" : "Download CSV"}
        </Button>
      </form>
      {list.isLoading ? <Skeleton className="h-64" /> : null}
      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(list.data ?? []).map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  <Link
                    to="/admin/businesses/$businessId"
                    params={{ businessId: row.id }}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell className="capitalize">{row.plan ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{row.subscription_status ?? "—"}</Badge>
                </TableCell>
                <TableCell>
                  {row.storefront_slug ? (
                    <span className="text-sm">
                      {row.storefront_status} · {row.storefront_slug}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{row.member_count}</TableCell>
                <TableCell>{friendlyDate(row.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}
