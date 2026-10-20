import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
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
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import { getAuditLogsFn } from "@/lib/business.functions";
import { friendlyDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings/audit-log")({
  head: () => ({
    meta: [{ title: "Audit log | BusinessOS AI" }],
  }),
  component: AuditLog,
});

const PAGE_SIZE = 50;

function actionLabel(action: string): string {
  return action.replace(/[._]/g, " ");
}

function AuditLog() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const canView = hasPermission(workspace.data, "audit.view");
  const [pages, setPages] = useState(1);

  const fetchLogs = useServerFn(getAuditLogsFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const logs = useQuery({
    queryKey: ["audit-logs", businessId, pages],
    enabled: Boolean(businessId) && canView,
    queryFn: async () => {
      const results = await Promise.all(
        Array.from({ length: pages }, (_, i) =>
          fetchLogs({ data: { businessId: businessId!, offset: i * PAGE_SIZE } }),
        ),
      );
      return {
        entries: results.flatMap((r) => r.entries),
        hasMore: results[results.length - 1]!.hasMore,
      };
    },
  });

  if (workspace.isLoading || !workspace.data) {
    return (
      <AppShell businessName="" role="" plan="" title="Audit log" subtitle="Recent activity.">
        <Skeleton className="h-64" />
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
      title="Audit log"
      subtitle="Who changed what, and when."
    >
      {!canView ? (
        <p className="text-sm text-muted-foreground">
          Only an owner or admin can view the audit log.
        </p>
      ) : logs.isLoading ? (
        <Skeleton className="h-96" />
      ) : !logs.data || logs.data.entries.length === 0 ? (
        <div className="surface px-6 py-16 text-center">
          <History className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold">Nothing recorded yet</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            Sensitive changes, team roles, permissions, deletions, and more, will show up here as
            they happen.
          </p>
        </div>
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.data.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {friendlyDate(entry.created_at)}
                    </TableCell>
                    <TableCell className="font-medium">{entry.actor_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {actionLabel(entry.action)}
                      </Badge>
                      {entry.result !== "success" ? (
                        <Badge variant="destructive" className="ml-1.5 font-normal">
                          {entry.result}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{entry.summary ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {logs.data.hasMore ? (
            <div className="border-t border-border p-3 text-center">
              <Button
                variant="outline"
                size="sm"
                disabled={logs.isFetching}
                onClick={() => setPages((p) => p + 1)}
              >
                {logs.isFetching ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
