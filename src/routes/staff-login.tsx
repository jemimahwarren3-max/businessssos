import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth/auth.functions";
import { resolveStaffLoginFn, verifyShopLoginFn } from "@/lib/business.functions";

export const Route = createFileRoute("/staff-login")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Sign in | BusinessOS AI" }, { name: "robots", content: "noindex" }],
  }),
  component: StaffLogin,
});

function StaffLogin() {
  const navigate = useNavigate();
  const verifyShopFn = useServerFn(verifyShopLoginFn);
  const resolveFn = useServerFn(resolveStaffLoginFn);
  const signInFn = useServerFn(signIn);

  const [step, setStep] = useState<"shop" | "person">("shop");
  const [businessNameInput, setBusinessNameInput] = useState("");
  const [shopPassword, setShopPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [staffNames, setStaffNames] = useState<string[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [personalPassword, setPersonalPassword] = useState("");
  const [busy, setBusy] = useState(false);

  function backToShopStep() {
    setStep("shop");
    setBusinessName("");
    setStaffNames([]);
    setSelectedName(null);
    setPersonalPassword("");
  }

  async function handleShopSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await verifyShopFn({
        data: { businessName: businessNameInput.trim(), password: shopPassword },
      });
      if (!result.valid) {
        toast.error("Business name and password don't match.");
        return;
      }
      if (result.staffNames.length === 0) {
        toast.error("No staff accounts have been set up yet, ask the owner.");
        return;
      }
      setBusinessName(result.businessName ?? "");
      setStaffNames(result.staffNames);
      setStep("person");
    } catch {
      toast.error("Business name and password don't match.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePersonSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedName) return;
    setBusy(true);
    try {
      const { email } = await resolveFn({
        data: { businessName: businessNameInput.trim(), name: selectedName },
      });
      if (!email) {
        toast.error("That name and password don't match.");
        return;
      }
      await signInFn({ data: { email, password: personalPassword } });
      navigate({ to: "/dashboard", replace: true });
    } catch {
      toast.error("That name and password don't match.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border px-4 py-4">
        <Logo to="/" />
      </header>
      <div className="mx-auto w-full max-w-sm flex-1 px-4 py-14">
        {step === "shop" ? (
          <>
            <h1 className="text-xl font-bold tracking-tight">Sign in</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Enter your business name and the shop password.
            </p>
            <form onSubmit={handleShopSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="shop-business-name">Business name</Label>
                <Input
                  id="shop-business-name"
                  // Deliberately left autocomplete-able (unlike the personal
                  // step below) — this is a shared device-level credential
                  // the owner may legitimately want the browser to remember,
                  // same as any normal login.
                  autoComplete="username"
                  required
                  maxLength={120}
                  value={businessNameInput}
                  onChange={(e) => setBusinessNameInput(e.target.value)}
                  placeholder="e.g. Sarah's Grocery"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shop-password">Shop password</Label>
                <Input
                  id="shop-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={shopPassword}
                  onChange={(e) => setShopPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full gap-1.5" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Continue
              </Button>
            </form>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={backToShopStep}
              className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" /> Different shop
            </button>
            <h1 className="mt-3 text-xl font-bold tracking-tight">
              Hey {businessName}, who would like to operate?
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Pick your name.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {staffNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setSelectedName(name);
                    setPersonalPassword("");
                  }}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    selectedName === name
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
            {selectedName ? (
              <form onSubmit={handlePersonSubmit} className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="person-password">Password for {selectedName}</Label>
                  <Input
                    id="person-password"
                    type="password"
                    // Never offered for the browser to remember — this is a
                    // per-person credential on what's often a shared device,
                    // unlike the shop password above which is fine to save.
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    required
                    autoFocus
                    value={personalPassword}
                    onChange={(e) => setPersonalPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full gap-1.5" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  Sign in
                </Button>
              </form>
            ) : null}
          </>
        )}
        <p className="mt-6 text-center text-[13px] text-muted-foreground">
          Signing in with an email instead?{" "}
          <Link to="/auth" search={{ mode: "signin" }} className="text-primary hover:underline">
            Go there
          </Link>
        </p>
      </div>
    </div>
  );
}
