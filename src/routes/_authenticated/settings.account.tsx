import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, LogOut, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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
  signOutOtherDevicesFn,
  unenrollMfaFn,
  verifyMfaChallengeFn,
  verifyMfaEnrollmentFn,
} from "@/lib/auth/auth.functions";
import { getNotifyEmailFn, setNotifyEmailFn } from "@/lib/business.functions";
import { readableError } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings/account")({
  head: () => ({
    meta: [{ title: "Account | Kwetuu" }],
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
  const [confirmingUnenroll, setConfirmingUnenroll] = useState(false);
  const [unenrollPassword, setUnenrollPassword] = useState("");

  const status = useQuery({
    queryKey: ["mfa-status"],
    queryFn: () => fetchStatus(),
  });

  const unenrollMutation = useMutation({
    mutationFn: () =>
      unenrollFn({
        data: { factorId: status.data!.factorId!, currentPassword: unenrollPassword },
      }),
    onSuccess: async () => {
      toast.success("Two-factor authentication turned off.");
      setConfirmingUnenroll(false);
      setUnenrollPassword("");
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
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4.5 text-success" aria-hidden="true" />
              <span className="font-medium">Enabled</span>
            </div>
            {!confirmingUnenroll ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setConfirmingUnenroll(true)}
              >
                <ShieldOff className="size-4" aria-hidden="true" />
                Turn off
              </Button>
            ) : null}
          </div>
          {confirmingUnenroll ? (
            <div className="space-y-2 border-t border-border pt-3">
              <Label htmlFor="unenroll-password">
                Enter your password to confirm turning off two-factor authentication
              </Label>
              <Input
                id="unenroll-password"
                type="password"
                autoComplete="current-password"
                value={unenrollPassword}
                onChange={(e) => setUnenrollPassword(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  disabled={unenrollMutation.isPending || !unenrollPassword}
                  onClick={() => unenrollMutation.mutate()}
                >
                  {unenrollMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Confirm turn off
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={unenrollMutation.isPending}
                  onClick={() => {
                    setConfirmingUnenroll(false);
                    setUnenrollPassword("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
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

/** Signs out every session but this one — the current browser's own
 * refresh token is deliberately untouched (Supabase's signOut({scope:
 * "others"}), confirmed live), so this can't accidentally lock the person
 * out of the device they're using to click it. */
function DevicesSection() {
  const signOutOthersFn = useServerFn(signOutOtherDevicesFn);

  const signOutOthersMutation = useMutation({
    mutationFn: () => signOutOthersFn(),
    onSuccess: () => toast.success("Signed out of every other device."),
    onError: (error: Error) =>
      toast.error(readableError(error, "Couldn't sign out other devices.")),
  });

  return (
    <div className="surface max-w-xl space-y-3 p-5">
      <div>
        <h2 className="text-lg font-semibold">Sign out other devices</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          If you think someone else has access to your account, sign out every other browser and
          device at once. This one stays signed in.
        </p>
      </div>
      <Button
        variant="outline"
        className="gap-1.5"
        disabled={signOutOthersMutation.isPending}
        onClick={() => signOutOthersMutation.mutate()}
      >
        {signOutOthersMutation.isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <LogOut className="size-4" aria-hidden="true" />
        )}
        Sign out all other devices
      </Button>
    </div>
  );
}

function ShopAlertsSection({ businessId }: { businessId: string }) {
  const queryClient = useQueryClient();
  const load = useServerFn(getNotifyEmailFn);
  const save = useServerFn(setNotifyEmailFn);
  const preference = useQuery({
    queryKey: ["notify-email", businessId],
    queryFn: () => load({ data: { businessId } }),
  });
  const mutation = useMutation({
    mutationFn: (enabled: boolean) => save({ data: { businessId, enabled } }),
    onSuccess: (enabled) => {
      queryClient.setQueryData(["notify-email", businessId], enabled);
      toast.success(
        enabled
          ? "Shop alerts will be emailed when email is configured."
          : "Shop alert emails are off for you.",
      );
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "Could not save that email preference.")),
  });

  return (
    <div className="surface max-w-xl space-y-3 p-5">
      <h2 className="text-lg font-semibold">Shop alerts</h2>
      <p className="text-sm text-muted-foreground">
        In-app alerts always appear in the bell. Email copies, when the operator has configured
        Resend, go to owners, admins, and managers who leave this on. WhatsApp is a chat link, not
        an alert channel.
      </p>
      {preference.isError ? (
        <p className="text-sm text-muted-foreground">
          {readableError(
            preference.error as Error,
            "This preference needs the latest database update.",
          )}
        </p>
      ) : (
        <label className="flex items-center justify-between gap-3 text-sm">
          Email me shop alerts
          <Switch
            checked={preference.data ?? true}
            disabled={preference.isLoading || mutation.isPending}
            onCheckedChange={(checked) => mutation.mutate(checked)}
          />
        </label>
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
  const [deletePassword, setDeletePassword] = useState("");

  const deleteAccount = useServerFn(deleteAccountFn);
  const signOutServerFn = useServerFn(signOutFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const deleteMutation = useMutation({
    mutationFn: () => deleteAccount({ data: { currentPassword: deletePassword } }),
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
      subtitle="Manage your Kwetuu account."
    >
      <div className="mb-4">
        <SecuritySection />
      </div>

      <div className="mb-4">
        <DevicesSection />
      </div>

      <div className="mb-4">
        <ShopAlertsSection businessId={workspace.data.business.id} />
      </div>

      <div className="surface max-w-xl space-y-4 border-destructive/30 p-5">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-semibold text-destructive">
            <AlertTriangle className="size-4.5" aria-hidden="true" />
            Delete account
          </h2>
          {isOwner ? (
            <p className="mt-1 text-sm text-muted-foreground">
              This permanently deletes <strong>{workspace.data.business.name}</strong>, every
              product, sale, invoice, quote, customer, and expense, along with your login. This
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

        <div className="space-y-1.5">
          <Label htmlFor="delete-password">Enter your password to confirm</Label>
          <Input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
          />
        </div>

        <Button
          variant="destructive"
          className="gap-1.5"
          disabled={confirmText !== CONFIRM_TEXT || !deletePassword || deleteMutation.isPending}
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
