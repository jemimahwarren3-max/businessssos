import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getCurrentUser, updatePassword } from "@/lib/auth/auth.functions";
import { readableError } from "@/lib/format";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Choose a new password | Kwetuu" },
      { name: "description", content: "Set a new password for your Kwetuu account." },
      { property: "og:title", content: "Choose a new password | Kwetuu" },
      { property: "og:description", content: "Secure your Kwetuu account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const fetchCurrentUser = useServerFn(getCurrentUser);
  const updatePasswordFn = useServerFn(updatePassword);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // By the time this page loads, /auth/callback has already exchanged the
    // recovery link's code and established the session server-side — this
    // just confirms it actually happened before letting the form submit.
    fetchCurrentUser().then((user) => setReady(Boolean(user)));
  }, [fetchCurrentUser]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Both passwords must match.");
      return;
    }
    setSaving(true);
    try {
      await updatePasswordFn({ data: { password } });
      toast.success("Password updated.");
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(readableError(error as Error, "Couldn't update your password."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border px-4 py-4">
        <Logo to="/" />
      </header>
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-14">
        <div className="surface p-6">
          <h1 className="text-xl font-bold tracking-tight">Choose a new password</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {ready
              ? "Enter a new password for your account."
              : "Open this page from the reset link in your email."}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full gap-1.5" disabled={saving || !ready}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Update password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
