import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup", "reset"]).default("signin").catch("signin"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — BusinessOS AI" },
      {
        name: "description",
        content:
          "Sign in or create your BusinessOS AI account to manage inventory, sales and invoices.",
      },
      { property: "og:title", content: "Sign in — BusinessOS AI" },
      { property: "og:description", content: "Access your BusinessOS AI workspace." },
    ],
  }),
  component: AuthPage,
});

function friendlyAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "That email and password don't match an account.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "An account with that email already exists. Try signing in instead.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email first — check your inbox for the link.";
  if (m.includes("password")) return "Your password must be at least 8 characters.";
  return "We couldn't complete that. Please try again.";
}

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState<null | "email" | "google">(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/dashboard", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleGoogle() {
    setBusy("google");
    // Redirects the whole page to Google, then back to redirectTo — the
    // onAuthStateChange listener above takes it from there.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) {
      setBusy(null);
      toast.error("Google sign-in didn't work. Please try again or use your email.");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy("email");
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSentTo(email.trim());
        toast.success("Password reset link sent.");
        return;
      }
      if (mode === "signup") {
        if (password.length < 8) {
          toast.error("Please use a password with at least 8 characters.");
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim() },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setSentTo(email.trim());
          return;
        }
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (error) {
      toast.error(friendlyAuthError((error as Error).message ?? ""));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-5 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <Logo to="/" />
          {sentTo ? (
            <div className="surface mt-8 p-6 text-center">
              <Mail className="mx-auto size-6 text-primary" aria-hidden="true" />
              <h1 className="mt-3 text-xl font-bold tracking-tight">Check your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a link to <span className="font-medium text-foreground">{sentTo}</span>.
                Open it to continue — you're not signed in until you do.
              </p>
              <Button variant="outline" className="mt-5 w-full" onClick={() => setSentTo(null)}>
                Back
              </Button>
            </div>
          ) : (
            <>
              <h1 className="mt-8 text-2xl font-bold tracking-tight">
                {mode === "signup"
                  ? "Create your account"
                  : mode === "reset"
                    ? "Reset your password"
                    : "Welcome back"}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {mode === "signup"
                  ? "Set up your business in a few minutes."
                  : mode === "reset"
                    ? "We'll email you a link to set a new password."
                    : "Sign in to your business workspace."}
              </p>

              {mode !== "reset" ? (
                <Tabs value={mode} className="mt-6">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="signin" asChild>
                      <Link to="/auth" search={{ mode: "signin" }}>
                        Sign in
                      </Link>
                    </TabsTrigger>
                    <TabsTrigger value="signup" asChild>
                      <Link to="/auth" search={{ mode: "signup" }}>
                        Create account
                      </Link>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              ) : null}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {mode === "signup" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">Your name</Label>
                    <Input
                      id="fullName"
                      autoComplete="name"
                      required
                      maxLength={120}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Sarah Moyo"
                    />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={200}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@yourbusiness.com"
                  />
                </div>
                {mode !== "reset" ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {mode === "signin" ? (
                        <Link
                          to="/auth"
                          search={{ mode: "reset" }}
                          className="text-[13px] text-primary hover:underline"
                        >
                          Forgot password?
                        </Link>
                      ) : null}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                    />
                  </div>
                ) : null}
                <Button type="submit" className="w-full" disabled={busy !== null}>
                  {busy === "email" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {mode === "signup"
                    ? "Create account"
                    : mode === "reset"
                      ? "Send reset link"
                      : "Sign in"}
                </Button>
              </form>

              {mode !== "reset" ? (
                <>
                  <div className="my-5 flex items-center gap-3 text-[13px] text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    or
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={handleGoogle}
                    disabled={busy !== null}
                  >
                    {busy === "google" ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                        <path
                          fill="currentColor"
                          d="M21.35 11.1h-9.17v2.98h5.26c-.23 1.4-1.66 4.1-5.26 4.1-3.17 0-5.76-2.62-5.76-5.86s2.59-5.86 5.76-5.86c1.8 0 3.01.77 3.7 1.43l2.52-2.43C16.75 3.9 14.7 3 12.18 3 7.03 3 2.86 7.14 2.86 12.32s4.17 9.32 9.32 9.32c5.38 0 8.94-3.78 8.94-9.1 0-.61-.07-1.08-.17-1.44Z"
                        />
                      </svg>
                    )}
                    Continue with Google
                  </Button>
                </>
              ) : (
                <Button asChild variant="ghost" className="mt-4 w-full">
                  <Link to="/auth" search={{ mode: "signin" }}>
                    Back to sign in
                  </Link>
                </Button>
              )}

              <p className="mt-6 text-[12px] leading-relaxed text-muted-foreground">
                By continuing you agree that your business data is stored securely and is only
                accessible to members of your business.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="hidden flex-col justify-between bg-primary-dark p-10 lg:flex">
        <p className="text-sm font-medium text-primary-foreground/70">BusinessOS AI</p>
        <div>
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-primary-foreground">
            Don't just see your business data. Understand what it means.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-primary-foreground/75">
            Sales, stock, invoices and expenses in one place — with a health score that tells you
            what needs attention today.
          </p>
        </div>
        <ul className="space-y-2 text-sm text-primary-foreground/80">
          <li>· Inventory that updates itself when you sell</li>
          <li>· Invoices and quotes without retyping</li>
          <li>· Roles for your team, enforced on the server</li>
        </ul>
      </div>
    </div>
  );
}
