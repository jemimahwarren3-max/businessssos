import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminAuditFn } from "@/lib/admin/admin.functions";
import { friendlyDateTime } from "@/lib/format";
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

export const Route = createFileRoute("/admin/audit")({
  component: AdminAuditPage,
});

function AdminAuditPage() {
  const fetch = useServerFn(getAdminAuditFn);
  const list = useQuery({
    queryKey: ["admin-audit"],
    queryFn: () => fetch(),
  });

  return (
    <AdminShell title="Audit log">
      <p className="text-sm text-muted-foreground">
        Platform operator actions and subscription overrides. Records are append-only.
      </p>
      {list.isLoading ? <Skeleton className="h-64" /> : null}
      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(list.data ?? []).map((row) => (
              <TableRow key={`${row.source}-${row.id}`}>
                <TableCell className="whitespace-nowrap text-xs">
                  {friendlyDateTime(row.created_at)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{row.source}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{row.action}</TableCell>
                <TableCell className="max-w-md text-sm">{row.reason}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}
