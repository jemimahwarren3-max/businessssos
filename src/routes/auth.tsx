import { useEffect, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { CircleAlert, Loader2, Mail } from "lucide-react";
import {
  getCurrentUser,
  getPostAuthDestination,
  requestPasswordReset,
  resendSignupConfirmation,
  signIn,
  signUp,
} from "@/lib/auth/auth.functions";
import { EMAIL_PROVIDER_OFF_MESSAGE, fetchAuthProviderStatus } from "@/lib/auth/auth-providers";
import { googleOAuthRedirectTo } from "@/lib/auth/google-oauth";
import { readableError } from "@/lib/format";
import { BRAND } from "@/lib/brand";
import { navigateAfterAuth } from "@/lib/auth/post-auth-navigate";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup", "reset"]).default("signin").catch("signin"),
  reason: z.enum(["oauth"]).optional().catch(undefined),
  // Only ever used to bounce back to an invite link after auth — deliberately
  // narrow (not a general-purpose redirect target) to rule out open-redirect
  // abuse via a crafted /auth?redirect= link.
  redirect: z
    .string()
    .regex(/^\/invite\/[a-zA-Z0-9]+$/)
    .optional()
    .catch(undefined),
  // Supabase sometimes lands on /auth when Site URL is wrong — forward to the real handler.
  code: z.string().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  beforeLoad: ({ search }) => {
    if (search.code) {
      throw redirect({
        to: "/auth/callback",
        search: {
          code: search.code,
          next: "/onboarding",
        },
      });
    }
  },
  loader: async () => {
    try {
      return { providers: await fetchAuthProviderStatus() };
    } catch {
      return { providers: { email: true, google: true } };
    }
  },
  head: () => ({
    meta: [
      { title: `Sign in | ${BRAND.name}` },
      {
        name: "description",
        content: `Sign in or create a ${BRAND.name} account to open a shop and run the till.`,
      },
      { property: "og:title", content: `Sign in | ${BRAND.name}` },
      { property: "og:description", content: `Access your ${BRAND.name} workspace.` },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode, redirect, reason } = Route.useSearch();
  const { providers } = Route.useLoaderData();
  const emailEnabled = providers.email;
  const googleEnabled = providers.google;
  const navigate = useNavigate();
  const fetchCurrentUser = useServerFn(getCurrentUser);
  const fetchPostAuthDestination = useServerFn(getPostAuthDestination);
  const signInFn = useServerFn(signIn);
  const signUpFn = useServerFn(signUp);
  const requestResetFn = useServerFn(requestPasswordReset);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState<null | "email" | "google">(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [bootState, setBootState] = useState<"checking" | "ready">("checking");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendFn = useServerFn(resendSignupConfirmation);
  const needsAcceptance = mode === "signup" && !acceptedTerms;

  useEffect(() => {
    if (reason === "oauth") {
      toast.error(
        "Google sign-in did not finish. Try again, or use a private window if it keeps looping.",
      );
    }
  }, [reason]);

  useEffect(() => {
    let cancelled = false;
    void fetchCurrentUser()
      .then(async (user) => {
        if (cancelled) return;
        if (!user) {
          setBootState("ready");
          return;
        }
        if (redirect) {
          navigateAfterAuth(redirect);
          return;
        }
        const destination = await fetchPostAuthDestination();
        const path = destination.path === "/auth" ? "/onboarding" : destination.path;
        navigateAfterAuth(path);
      })
      .catch(() => {
        if (!cancelled) setBootState("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, fetchCurrentUser, fetchPostAuthDestination, redirect]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  async function handleResendConfirmation() {
    if (!sentTo || resendCooldown > 0 || resendBusy) return;
    setResendBusy(true);
    try {
      await resendFn({ data: { email: sentTo } });
      toast.success("Confirmation email sent again.");
      setResendCooldown(60);
    } catch (error) {
      toast.error(readableError(error as Error, "Could not resend the confirmation email."));
    } finally {
      setResendBusy(false);
    }
  }

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
      if (!emailEnabled) {
        toast.error(EMAIL_PROVIDER_OFF_MESSAGE);
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
        navigateAfterAuth(result.path ?? "/onboarding");
        return;
      }
      const signInResult = await signInFn({ data: { email: email.trim(), password } });
      navigateAfterAuth(signInResult.path ?? "/onboarding");
    } catch (error) {
      toast.error(readableError(error as Error, "We couldn't complete that. Please try again."));
    } finally {
      setBusy(null);
    }
  }

  async function handleGoogle() {
    if (mode === "signup" && !acceptedTerms) {
      toast.error("Please accept the Terms of Service and Privacy Policy first.");
      return;
    }
    setBusy("google");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: googleOAuthRedirectTo(window.location.origin, {
            next: "/onboarding",
            acceptedTerms: mode === "signup",
          }),
        },
      });
      if (error) throw error;
    } catch (error) {
      toast.error(
        readableError(error as Error, "Google sign-in did not start. Try email instead."),
      );
      setBusy(null);
    }
  }

  if (bootState === "checking") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <Logo to="/" />
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Checking your session…</p>
      </div>
    );
  }

  return (
    <div className="marketplace-theme grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-5 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <Logo to="/" />
          {sentTo ? (
            <div className="surface mt-8 p-6 text-center">
              <Mail className="mx-auto size-6 text-primary" aria-hidden="true" />
              <h1 className="mt-3 text-xl font-bold tracking-tight">Confirm your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a confirmation link to{" "}
                <span className="font-medium text-foreground">{sentTo}</span>. You are not signed in
                until you open that link. Auth email is sent by Supabase, not the shop receipt
                system.
              </p>
              <Button
                type="button"
                className="mt-5 w-full"
                disabled={resendBusy || resendCooldown > 0}
                onClick={() => void handleResendConfirmation()}
              >
                {resendBusy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : resendCooldown > 0 ? (
                  `Resend in ${resendCooldown}s`
                ) : (
                  "Resend confirmation email"
                )}
              </Button>
              <Button variant="outline" className="mt-2 w-full" onClick={() => setSentTo(null)}>
                Back
              </Button>
            </div>
          ) : (
            <>
              <h1 className="mt-8 font-display text-3xl font-semibold tracking-tight">
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

              {!emailEnabled && mode !== "reset" ? (
                <Alert variant="destructive" className="mt-6">
                  <CircleAlert className="size-4" aria-hidden="true" />
                  <AlertTitle>
                    {mode === "signup"
                      ? "Email accounts can't be created right now"
                      : "Email sign-in is turned off"}
                  </AlertTitle>
                </Alert>
              ) : null}

              {googleEnabled && mode !== "reset" && !emailEnabled ? (
                <div className="mt-5 space-y-4">
                  {mode === "signup" ? (
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="acceptedTermsGoogle"
                        checked={acceptedTerms}
                        onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor="acceptedTermsGoogle"
                        className="text-[13px] font-normal leading-relaxed text-muted-foreground"
                      >
                        I agree to the{" "}
                        <a
                          href="/terms"
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          Terms of Service
                        </a>{" "}
                        and{" "}
                        <a
                          href="/privacy"
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
                    type="button"
                    className="w-full rounded-full"
                    disabled={busy !== null || needsAcceptance}
                    onClick={() => void handleGoogle()}
                  >
                    {busy === "google" ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    Continue with Google
                  </Button>
                </div>
              ) : null}

              {emailEnabled || mode === "reset" ? (
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
                        disabled={!emailEnabled}
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
                      disabled={mode !== "reset" && !emailEnabled}
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
                        disabled={!emailEnabled}
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
                          href="/terms"
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          Terms of Service
                        </a>{" "}
                        and{" "}
                        <a
                          href="/privacy"
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
                    className="w-full rounded-full"
                    disabled={
                      busy !== null || needsAcceptance || (mode !== "reset" && !emailEnabled)
                    }
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
              ) : null}

              {googleEnabled && mode !== "reset" && emailEnabled ? (
                <>
                  <div className="relative my-5">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <span className="w-full border-t border-border" />
                    </div>
                    <p className="relative flex justify-center text-[12px] uppercase tracking-wide text-muted-foreground">
                      <span className="bg-background px-2">or</span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full rounded-full"
                    disabled={busy !== null || needsAcceptance}
                    onClick={() => void handleGoogle()}
                  >
                    {busy === "google" ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    Continue with Google
                  </Button>
                </>
              ) : null}

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

      <div className="relative hidden overflow-hidden bg-ink p-10 text-sand lg:flex lg:flex-col lg:justify-between">
        <img
          src="/marketing/hero-seller.jpg"
          alt=""
          className="pointer-events-none absolute inset-0 size-full object-cover opacity-40"
        />
        <div className="relative">
          <p className="inline-block rounded-full bg-accent/90 px-3 py-1 text-sm font-semibold text-accent-foreground">
            Karibu · Welcome home
          </p>
        </div>
        <div className="relative">
          <h2 className="max-w-md font-display text-4xl leading-tight text-background">
            Discover something you love. Or build a store of your own.
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-sand/85">
            Sign in with Google, then we walk you through naming your shop, choosing a design, and
            adding your first product — still free until you publish.
          </p>
        </div>
        <ul className="relative space-y-2 text-sm text-sand/90">
          <li className="flex gap-2">
            <span aria-hidden="true">·</span> Live address at your-shop.{BRAND.domain}
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true">·</span> Manual payments and your own Paynow keys when ready
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true">·</span> Same catalogue powers your till and storefront
          </li>
        </ul>
      </div>
    </div>
  );
}
