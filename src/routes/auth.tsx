import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { getCurrentUser, requestPasswordReset, signIn, signUp } from "@/lib/auth/auth.functions";
import { readableError } from "@/lib/format";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup", "reset"]).default("signin").catch("signin"),
  // Only ever used to bounce back to an invite link after auth — deliberately
  // narrow (not a general-purpose redirect target) to rule out open-redirect
  // abuse via a crafted /auth?redirect= link.
  redirect: z
    .string()
    .regex(/^\/invite\/[a-zA-Z0-9]+$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in | BusinessOS AI" },
      {
        name: "description",
        content:
          "Sign in or create your BusinessOS AI account to manage inventory, sales and invoices.",
      },
      { property: "og:title", content: "Sign in | BusinessOS AI" },
      { property: "og:description", content: "Access your BusinessOS AI workspace." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode, redirect } = Route.useSearch();
  const destination = redirect ?? "/dashboard";
  const navigate = useNavigate();
  const fetchCurrentUser = useServerFn(getCurrentUser);
  const signInFn = useServerFn(signIn);
  const signUpFn = useServerFn(signUp);
  const requestResetFn = useServerFn(requestPasswordReset);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState<null | "email">(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const needsAcceptance = mode === "signup" && !acceptedTerms;

  useEffect(() => {
    fetchCurrentUser().then((user) => {
      if (user) navigate({ to: destination, replace: true });
    });
  }, [navigate, fetchCurrentUser, destination]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy("email");
    try {
      if (mode === "reset") {
        await requestResetFn({ data: { email: email.trim() } });
        setSentTo(email.trim());
        toast.success("Password reset link sent.");
        return;
      }
      if (mode === "signup") {
        if (password.length < 8) {
          toast.error("Please use a password with at least 8 characters.");
          return;
        }
        if (!acceptedTerms) {
          toast.error("Please accept the Terms of Service and Privacy Policy first.");
          return;
        }
        const result = await signUpFn({
          data: { email: email.trim(), password, fullName: fullName.trim(), acceptedTerms },
        });
        if (result.needsEmailConfirmation) {
          setSentTo(email.trim());
          return;
        }
        navigate({ to: destination, replace: true });
        return;
      }
      await signInFn({ data: { email: email.trim(), password } });
      navigate({ to: destination, replace: true });
    } catch (error) {
      toast.error(readableError(error as Error, "We couldn't complete that. Please try again."));
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
                Open it to continue, you're not signed in until you do.
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
                      <Link to="/auth" search={{ mode: "signin", redirect }}>
                        Sign in
                      </Link>
                    </TabsTrigger>
                    <TabsTrigger value="signup" asChild>
                      <Link to="/auth" search={{ mode: "signup", redirect }}>
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
                          search={{ mode: "reset", redirect }}
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
                {mode === "signup" ? (
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="acceptedTerms"
                      checked={acceptedTerms}
                      onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor="acceptedTerms"
                      className="text-[13px] font-normal leading-relaxed text-muted-foreground"
                    >
                      I agree to the{" "}
                      <a
                        href="/legal/terms"
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-primary hover:underline"
                      >
                        Terms of Service
                      </a>{" "}
                      and{" "}
                      <a
                        href="/legal/privacy"
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-primary hover:underline"
                      >
                        Privacy Policy
                      </a>
                      .
                    </Label>
                  </div>
                ) : null}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy !== null || needsAcceptance}
                >
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

              {mode === "reset" ? (
                <Button asChild variant="ghost" className="mt-4 w-full">
                  <Link to="/auth" search={{ mode: "signin", redirect }}>
                    Back to sign in
                  </Link>
                </Button>
              ) : null}

              {mode !== "reset" ? (
                <p className="mt-4 text-center text-[13px] text-muted-foreground">
                  Signing in with your business name instead?{" "}
                  <Link to="/staff-login" className="text-primary hover:underline">
                    Go there
                  </Link>
                </p>
              ) : null}

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
            Sales, stock, invoices and expenses in one place, with a health score that tells you
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
