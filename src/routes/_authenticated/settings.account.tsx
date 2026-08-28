import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MfaChallenge, MfaEnroll } from "@/components/mfa";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  challengeMfaFn,
  deleteAccountFn,
  enrollMfaFn,
  getMfaStatusFn,
  signOutFn,
  unenrollMfaFn,
  verifyMfaChallengeFn,
  verifyMfaEnrollmentFn,
} from "@/lib/auth/auth.functions";
import { readableError } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings/account")({
  head: () => ({
    meta: [{ title: "Account — BusinessOS AI" }],
  }),
  component: AccountSettings,
});

const CONFIRM_TEXT = "DELETE";

/** Same TOTP flow as the (mandatory) admin panel — see src/components/mfa.tsx
 * — offered here as optional. Once enabled it's enforced app-wide by
 * _authenticated/route.tsx, not just gating this page, so by the time a
 * user reaches this section already enrolled they're already past that
 * gate this session — no re-challenge needed just to see the toggle. */
function SecuritySection() {
  const queryClient = useQueryClient();
  const enrollFn = useServerFn(enrollMfaFn);
  const verifyEnrollFn = useServerFn(verifyMfaEnrollmentFn);
  const challengeFn = useServerFn(challengeMfaFn);
  const verifyChallengeFn = useServerFn(verifyMfaChallengeFn);
  const unenrollFn = useServerFn(unenrollMfaFn);
  const fetchStatus = useServerFn(getMfaStatusFn);
  const [enrolling, setEnrolling] = useState(false);

  const status = useQuery({
    queryKey: ["mfa-status"],
    queryFn: () => fetchStatus(),
  });

  const unenrollMutation = useMutation({
    mutationFn: () => unenrollFn({ data: { factorId: status.data!.factorId! } }),
    onSuccess: async () => {
      toast.success("Two-factor authentication turned off.");
      await queryClient.invalidateQueries({ queryKey: ["mfa-status"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't turn off MFA.")),
  });

  if (status.isLoading || !status.data) {
    return (
      <div className="surface max-w-xl p-5">
        <Skeleton className="h-16" />
      </div>
    );
  }

  return (
    <div className="surface max-w-xl space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Require a 6-digit code from an authenticator app, in addition to your password, every time
          you sign in.
        </p>
      </div>

      {status.data.enrolled && status.data.currentLevel === "aal2" ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4.5 text-success" aria-hidden="true" />
            <span className="font-medium">Enabled</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={unenrollMutation.isPending}
            onClick={() => unenrollMutation.mutate()}
          >
            {unenrollMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ShieldOff className="size-4" aria-hidden="true" />
            )}
            Turn off
          </Button>
        </div>
      ) : status.data.enrolled ? (
        // Reached this page already enrolled but below aal2 this session —
        // shouldn't normally happen (the app-wide gate in
        // _authenticated/route.tsx catches this first), but handle it
        // directly rather than leaving the toggle in a confusing state.
        <MfaChallenge
          factorId={status.data.factorId!}
          onDone={() => queryClient.invalidateQueries({ queryKey: ["mfa-status"] })}
          challengeFn={challengeFn}
          verifyFn={verifyChallengeFn}
        />
      ) : enrolling ? (
        <MfaEnroll
          onDone={async () => {
            setEnrolling(false);
            await queryClient.invalidateQueries({ queryKey: ["mfa-status"] });
          }}
          enrollFn={enrollFn}
          verifyFn={verifyEnrollFn}
        />
      ) : (
        <Button className="gap-1.5" onClick={() => setEnrolling(true)}>
          <ShieldCheck className="size-4" aria-hidden="true" />
          Turn on
        </Button>
      )}
    </div>
  );
}

function AccountSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useWorkspace();
  const role = workspace.data?.role ?? "";
  const isOwner = role === "owner";
  const [confirmText, setConfirmText] = useState("");

  const deleteAccount = useServerFn(deleteAccountFn);
  const signOutServerFn = useServerFn(signOutFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const deleteMutation = useMutation({
    mutationFn: () => deleteAccount(),
    onSuccess: async () => {
      // deleteAccountFn already clears the server session, but signOutFn
      // also tears down the client-side Supabase auth state cleanly.
      await signOutServerFn().catch(() => undefined);
      await queryClient.cancelQueries();
      queryClient.clear();
      toast.success("Your account and business data have been deleted.");
      navigate({ to: "/auth", replace: true, search: { mode: "signin" } });
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't delete your account.")),
  });

  if (workspace.isLoading || !workspace.data) {
    return (
      <AppShell businessName="" role="" plan="" title="Account" subtitle="Manage your account.">
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
      title="Account"
      subtitle="Manage your BusinessOS AI account."
    >
      <div className="mb-4">
        <SecuritySection />
      </div>

      <div className="surface max-w-xl space-y-4 border-destructive/30 p-5">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-semibold text-destructive">
            <AlertTriangle className="size-4.5" aria-hidden="true" />
            Delete account
          </h2>
          {isOwner ? (
            <p className="mt-1 text-sm text-muted-foreground">
              This permanently deletes <strong>{workspace.data.business.name}</strong> — every
              product, sale, invoice, quote, customer, and expense — along with your login. This
              cannot be undone. If you want to keep a copy first, use{" "}
              <span className="font-medium text-foreground">Export data</span> before continuing.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              This permanently deletes your login. Since you're not the owner of{" "}
              {workspace.data.business.name}, its data stays intact for the rest of the team.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-delete">
            Type <span className="font-mono font-semibold">{CONFIRM_TEXT}</span> to confirm
          </Label>
          <Input
            id="confirm-delete"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_TEXT}
            autoComplete="off"
          />
        </div>

        <Button
          variant="destructive"
          className="gap-1.5"
          disabled={confirmText !== CONFIRM_TEXT || deleteMutation.isPending}
          onClick={() => deleteMutation.mutate()}
        >
          {deleteMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          Permanently delete my account
        </Button>
      </div>
    </AppShell>
  );
}
