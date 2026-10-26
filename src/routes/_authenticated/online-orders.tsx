import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";

/** Dedicated nav entry — scrolls to order management on the storefront editor. */
export const Route = createFileRoute("/_authenticated/online-orders")({
  head: () => ({
    meta: [{ title: "Online orders | Kwetuu" }, { name: "robots", content: "noindex" }],
  }),
  component: OnlineOrdersRedirect,
});

function OnlineOrdersRedirect() {
  const navigate = useNavigate();
  const workspace = useWorkspace();

  useEffect(() => {
    if (workspace.data) {
      navigate({ to: "/storefront", hash: "online-orders", replace: true });
    }
  }, [navigate, workspace.data]);

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
      title="Online orders"
      subtitle="Opening order management…"
    >
      <Skeleton className="h-32" />
    </AppShell>
  );
}
