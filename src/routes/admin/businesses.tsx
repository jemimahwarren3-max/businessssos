import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminBusinessesFn } from "@/lib/admin/admin.functions";
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
                <TableCell className="font-medium">{row.name}</TableCell>
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
