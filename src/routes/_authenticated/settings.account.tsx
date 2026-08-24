import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import { deleteAccountFn, signOutFn } from "@/lib/auth/auth.functions";
import { readableError } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings/account")({
  head: () => ({
    meta: [{ title: "Account — BusinessOS AI" }],
  }),
  component: AccountSettings,
});

const CONFIRM_TEXT = "DELETE";

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
