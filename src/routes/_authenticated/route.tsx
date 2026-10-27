import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { registerAuthenticatedPwa } from "@/lib/pwa-register";
import { MfaChallenge } from "@/components/mfa";
import { Skeleton } from "@/components/ui/skeleton";
import {
  challengeMfaFn,
  getCurrentUser,
  getMfaStatusFn,
  verifyMfaChallengeFn,
} from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (!user) throw redirect({ to: "/staff-login" });
    return { user };
  },
  component: AuthenticatedGate,
});

/** Applies to every authenticated route, not just /admin — a business
 * owner or staff member who turned MFA on in Settings > Account must clear
 * an aal2 challenge once per session before anything under here renders,
 * same enforcement shape as the (mandatory) admin gate in routes/admin.tsx. */
function AuthenticatedGate() {
  useEffect(() => {
    registerAuthenticatedPwa();
  }, []);
  const fetchStatus = useServerFn(getMfaStatusFn);
  const challengeFn = useServerFn(challengeMfaFn);
  const verifyChallengeFn = useServerFn(verifyMfaChallengeFn);
  const status = useQuery({
    queryKey: ["mfa-status"],
    queryFn: () => fetchStatus(),
  });

  if (status.isLoading || !status.data) {
    return (
      <div className="mx-auto max-w-md p-6 pt-24">
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (status.data.enrolled && status.data.currentLevel !== "aal2") {
    return (
      <div className="mx-auto max-w-sm p-6 pt-24">
        <div className="surface p-6">
          <MfaChallenge
            factorId={status.data.factorId!}
            onDone={() => status.refetch()}
            challengeFn={challengeFn}
            verifyFn={verifyChallengeFn}
          />
        </div>
      </div>
    );
  }

  return <Outlet />;
}
