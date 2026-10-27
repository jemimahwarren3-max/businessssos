import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  getNotificationsFn,
  markAllNotificationsReadFn,
  markNotificationReadFn,
} from "@/lib/business.functions";
import { friendlyDate, readableError } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [{ title: "Notifications | BusinessOS AI" }],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const fetchNotifications = useServerFn(getNotificationsFn);
  const markReadFn = useServerFn(markNotificationReadFn);
  const markAllReadFn = useServerFn(markAllNotificationsReadFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const notifications = useQuery({
    queryKey: ["notifications", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchNotifications({ data: { businessId: businessId! } }),
    refetchInterval: 20_000,
  });

  const markRead = useMutation({
    mutationFn: (notificationId: string) => markReadFn({ data: { notificationId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", businessId] }),
  });

  const markAll = useMutation({
    mutationFn: () => markAllReadFn({ data: { businessId: businessId! } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", businessId] }),
  });

  if (workspace.isLoading || !workspace.data) {
    return (
      <AppShell businessName="" role="" plan="" title="Notifications">
        <Skeleton className="h-64" />
      </AppShell>
    );
  }

  const entries = notifications.data?.entries ?? [];
  const unreadCount = notifications.data?.unreadCount ?? 0;
  const emailConfigured = notifications.data?.emailConfigured ?? false;

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Notifications"
      subtitle="Shop orders, reports, reviews, and low-stock alerts for this business."
      actions={
        unreadCount > 0 ? (
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()}>
            Mark all read
          </Button>
        ) : null
      }
    >
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        {emailConfigured
          ? "Email copies go to owners, admins, and managers who left shop alerts on. WhatsApp is not used to send these alerts."
          : "In-app alerts are on. Email copies are off until the operator sets RESEND_API_KEY and NOTIFY_FROM_EMAIL. WhatsApp is not used to send these alerts."}
      </p>
      {notifications.isError ? (
        <p className="text-sm text-destructive">
          {readableError(notifications.error as Error, "Notifications could not be loaded.")}
        </p>
      ) : null}
      {notifications.isLoading ? <Skeleton className="h-40" /> : null}
      {!notifications.isLoading && entries.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Nothing yet. New online orders, customer reports, verified reviews, listing reports, and
          low-stock crossings show up here.
        </p>
      ) : null}
      <ul className="divide-y rounded-lg border">
        {entries.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="flex w-full flex-col items-start gap-1 px-4 py-3 text-left"
              onClick={() => {
                if (!item.is_read) markRead.mutate(item.id);
                if (item.link) navigate({ to: item.link });
              }}
            >
              <p className={cn("text-sm", item.is_read ? "text-muted-foreground" : "font-medium")}>
                {item.title}
              </p>
              {item.message ? (
                <p className="text-xs text-muted-foreground">{item.message}</p>
              ) : null}
              <p className="text-[11px] text-muted-foreground">{friendlyDate(item.created_at)}</p>
            </button>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
