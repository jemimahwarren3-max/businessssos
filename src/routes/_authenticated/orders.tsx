import { createFileRoute, Navigate } from "@tanstack/react-router";

/** Alias for discoverability — same desk as Online orders. */
export const Route = createFileRoute("/_authenticated/orders")({
  component: () => <Navigate to="/online-orders" replace />,
});
