import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
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
import { navigateAfterAuth } from "@/lib/auth/post-auth-navigate";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // Session is checked client-side only. A server beforeLoad here caused
  // ERR_TOO_MANY_REDIRECTS after OAuth: the callback sets the httpOnly cookie
  // in the browser, but the next navigation still hit this guard without the
  // cookie on the server, bounced to /auth, which saw the cookie and sent the
  // user back to /onboarding — repeat.
  component: AuthenticatedGate,
});

/** Applies to every authenticated route, not just /admin — a business
 * owner or staff member who turned MFA on in Settings > Account must clear
 * an aal2 challenge once per session before anything under here renders,
 * same enforcement shape as the (mandatory) admin gate in routes/admin.tsx. */
function AuthenticatedGate() {
  const fetchUser = useServerFn(getCurrentUser);
  const sessionQuery = useQuery({
    queryKey: ["authenticated-user"],
    queryFn: () => fetchUser(),
    retry: false,
  });

  useEffect(() => {
    registerAuthenticatedPwa();
  }, []);

  useEffect(() => {
    if (sessionQuery.isLoading || sessionQuery.isFetching) return;
    if (!sessionQuery.data) {
      navigateAfterAuth("/auth?mode=signin");
    }
  }, [sessionQuery.isLoading, sessionQuery.isFetching, sessionQuery.data]);

  if (sessionQuery.isLoading || !sessionQuery.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <img
          src="/kwetuu-logo.png"
          alt="Kwetuu"
          className="h-12 w-auto opacity-90"
          width={192}
          height={96}
        />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
        <Skeleton className="h-2 w-48 max-w-full rounded-full" />
      </div>
    );
  }

  return <AuthenticatedMfaGate />;
}

function AuthenticatedMfaGate() {
  const fetchStatus = useServerFn(getMfaStatusFn);
  const challengeFn = useServerFn(challengeMfaFn);
  const verifyChallengeFn = useServerFn(verifyMfaChallengeFn);
  const status = useQuery({
    queryKey: ["mfa-status"],
    queryFn: () => fetchStatus(),
    retry: 1,
  });

  if (status.isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Your session could not be verified. Sign in again to continue.
        </p>
        <Link
          to="/auth"
          search={{ mode: "signin" }}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (status.isLoading || !status.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <img
          src="/kwetuu-logo.png"
          alt="Kwetuu"
          className="h-12 w-auto opacity-90"
          width={192}
          height={96}
        />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
        <Skeleton className="h-2 w-48 max-w-full rounded-full" />
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
