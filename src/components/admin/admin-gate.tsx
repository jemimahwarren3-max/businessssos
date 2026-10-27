import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MfaChallenge, MfaEnroll } from "@/components/mfa";
import { Skeleton } from "@/components/ui/skeleton";
import {
  challengeAdminMfaFn,
  checkPlatformAdmin,
  enrollAdminMfaFn,
  verifyAdminMfaChallengeFn,
  verifyAdminMfaEnrollmentFn,
} from "@/lib/admin/admin.functions";

export function AdminGate({ children }: { children: ReactNode }) {
  const checkStatus = useServerFn(checkPlatformAdmin);
  const enrollFn = useServerFn(enrollAdminMfaFn);
  const verifyEnrollFn = useServerFn(verifyAdminMfaEnrollmentFn);
  const challengeFn = useServerFn(challengeAdminMfaFn);
  const verifyChallengeFn = useServerFn(verifyAdminMfaChallengeFn);
  const status = useQuery({
    queryKey: ["admin-mfa-status"],
    queryFn: () => checkStatus(),
  });

  if (status.isLoading || !status.data || !status.data.isAdmin) {
    return (
      <div className="mx-auto max-w-md p-6 pt-24">
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!status.data.enrolled) {
    return (
      <div className="mx-auto max-w-sm p-6 pt-24">
        <div className="surface p-6">
          <MfaEnroll
            onDone={() => status.refetch()}
            enrollFn={enrollFn}
            verifyFn={verifyEnrollFn}
            title="Set up admin authentication"
            description="This account requires an authenticator app before you can continue."
          />
        </div>
      </div>
    );
  }

  if (status.data.currentLevel !== "aal2") {
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

  return children;
}
