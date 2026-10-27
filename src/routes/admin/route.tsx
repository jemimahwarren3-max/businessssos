import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { AdminGate } from "@/components/admin/admin-gate";
import { checkPlatformAdmin } from "@/lib/admin/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  beforeLoad: async () => {
    const status = await checkPlatformAdmin().catch(() => ({ isAdmin: false as const }));
    if (!status.isAdmin) throw notFound();
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AdminGate>
      <Outlet />
    </AdminGate>
  );
}
