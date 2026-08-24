import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkspace } from "@/lib/business.functions";

export function useWorkspace() {
  const fetchWorkspace = useServerFn(getWorkspace);
  return useQuery({
    queryKey: ["workspace"],
    queryFn: () => fetchWorkspace(),
    staleTime: 60_000,
  });
}

/** Checks the caller's effective permission set for their current business
 * (already fetched once via useWorkspace, see loadWorkspace/get_my_permissions
 * server-side) — this is UI gating only, mirroring but never replacing the
 * real server-side assertPermission enforcement for the same action. */
export function hasPermission(
  workspace: { permissions: string[] } | null | undefined,
  permission: string,
): boolean {
  return workspace?.permissions.includes(permission) ?? false;
}
