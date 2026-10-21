import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/stores")({
  beforeLoad: () => {
    throw redirect({ to: "/market", search: { q: "", category: "" } });
  },
  component: () => null,
});
