import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentUser, signIn, signOutFn, signUp } from "@/lib/auth/auth.functions";
import {
  claimShopperOrderFn,
  getShopperAccountFn,
  setShopperConsentFn,
} from "@/lib/storefront/storefront.functions";
import type { ShopperAccount } from "@/lib/storefront/contract";
import { formatMoney, friendlyDateTime, readableError } from "@/lib/format";
import { Route as StoreRoute } from "./store.$slug";

export const Route = createFileRoute("/store/$slug/account")({
  head: () => ({
    meta: [{ title: "Your orders" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: ShopperAccountPage,
});

function ShopperAccountPage() {
  const { store, preview } = StoreRoute.useLoaderData();
  const fetchUser = useServerFn(getCurrentUser);
  const signInFn = useServerFn(signIn);
  const signUpFn = useServerFn(signUp);
  const signOut = useServerFn(signOutFn);
  const loadAccount = useServerFn(getShopperAccountFn);
  const claim = useServerFn(claimShopperOrderFn);
  const saveConsent = useServerFn(setShopperConsentFn);
  const [user, setUser] = useState<{ userId: string; email: string | null } | null | undefined>(
    undefined,
  );
  const [account, setAccount] = useState<ShopperAccount | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [claimReference, setClaimReference] = useState("");
  const [claimToken, setClaimToken] = useState("");
  const [confirmSent, setConfirmSent] = useState<string | null>(null);

  async function refresh(signedIn: { userId: string; email: string | null } | null) {
    setUser(signedIn);
    if (!signedIn) {
      setAccount(null);
      return;
    }
    const next = await loadAccount({ data: { slug: store.slug } });
    setAccount(next);
  }

  useEffect(() => {
    void fetchUser()
      .then((signedIn) => refresh(signedIn))
      .catch(() => setUser(null));
  }, [store.slug]);

  async function onAuth(event: React.FormEvent) {
    event.preventDefault();
    if (preview || pending) return;
    setPending(true);
    setError(null);
    try {
      if (mode === "signup") {
        if (password.length < 8) {
          setError("Please use a password with at least 8 characters.");
          return;
        }
        if (!acceptedTerms) {
          setError("Please accept the Terms of Service and Privacy Policy first.");
          return;
        }
        const result = await signUpFn({
          data: {
            email: email.trim(),
            password,
            fullName: fullName.trim(),
            acceptedTerms,
          },
        });
        if (result.needsEmailConfirmation) {
          setConfirmSent(email.trim());
          return;
        }
      } else {
        await signInFn({ data: { email: email.trim(), password } });
      }
      const signedIn = await fetchUser();
      await refresh(signedIn);
    } catch (reason) {
      setError(readableError(reason as Error, "We couldn't complete that. Please try again."));
    } finally {
      setPending(false);
    }
  }

  async function onClaim(event: React.FormEvent) {
    event.preventDefault();
    if (!user || pending) return;
    setPending(true);
    setError(null);
    try {
      await claim({
        data: { slug: store.slug, reference: claimReference, token: claimToken },
      });
      setClaimReference("");
      setClaimToken("");
      await refresh(user);
    } catch (reason) {
      setError(readableError(reason as Error, "That order could not be saved to this account."));
    } finally {
      setPending(false);
    }
  }

  async function onConsent(next: boolean) {
    if (!user || pending) return;
    setPending(true);
    setError(null);
    try {
      const updated = await saveConsent({ data: { slug: store.slug, messages: next } });
      setAccount(updated);
    } catch (reason) {
      setError(readableError(reason as Error, "Your preference was not saved."));
    } finally {
      setPending(false);
    }
  }

  if (preview) {
    return <p className="px-4 py-10">Publish the shop before customers can create accounts.</p>;
  }

  if (user === undefined) {
    return <p className="px-4 py-10 text-sm text-neutral-500">Loading…</p>;
  }

  if (confirmSent) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="mt-2 text-sm text-neutral-600">
          We sent a link to {confirmSent}. You are not signed in until you open it.
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl font-semibold">Your orders at {store.storeName}</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Guest checkout still works. An account only saves orders you place while signed in, or
          orders you claim with the access code. Matching an email by itself does not attach an
          order.
        </p>
        <div className="mt-4 flex gap-3 text-sm">
          <button type="button" onClick={() => setMode("signin")}>
            Sign in
          </button>
          <button type="button" onClick={() => setMode("signup")}>
            Create account
          </button>
        </div>
        <form className="mt-4 space-y-3" onSubmit={(event) => void onAuth(event)}>
          {mode === "signup" ? (
            <label className="block text-sm">
              Name
              <input
                className="mt-1 w-full rounded border px-3 py-2"
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </label>
          ) : null}
          <label className="block text-sm">
            Email
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Password
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {mode === "signup" ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
              />
              <span>
                I agree to the{" "}
                <a href="/terms" target="_blank" rel="noreferrer">
                  Terms
                </a>{" "}
                and{" "}
                <a href="/privacy" target="_blank" rel="noreferrer">
                  Privacy Policy
                </a>
                .
              </span>
            </label>
          ) : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
            disabled={pending}
            type="submit"
          >
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Your orders at {store.storeName}</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Signed in as {user.email ?? "your account"}. Guest access codes still open orders. Receipts
        and status emails go to the address on each order. Marketing email is not sent.
      </p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <button
          type="button"
          onClick={() => {
            void signOut().then(() => {
              setUser(null);
              setAccount(null);
            });
          }}
        >
          Sign out
        </button>
      </div>
      <label className="mt-6 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={account?.messagesConsent ?? false}
          disabled={pending || !account}
          onChange={(event) => void onConsent(event.target.checked)}
        />
        <span>
          {store.storeName} may send extra shop messages. Receipts and status emails are separate
          and still go to the email on the order.
        </span>
      </label>
      <form
        className="mt-8 space-y-3 rounded-lg border p-4"
        onSubmit={(event) => void onClaim(event)}
      >
        <h2 className="font-medium">Save a guest order</h2>
        <p className="text-sm text-neutral-600">
          Use the order number and the access code shown once at checkout.
        </p>
        <label className="block text-sm">
          Order number
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            value={claimReference}
            onChange={(event) => setClaimReference(event.target.value)}
            placeholder="ON-0001"
          />
        </label>
        <label className="block text-sm">
          Access code
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            value={claimToken}
            onChange={(event) => setClaimToken(event.target.value)}
          />
        </label>
        <button
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
          disabled={pending}
          type="submit"
        >
          Save to this account
        </button>
      </form>
      {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
      <h2 className="mt-8 font-medium">Order history</h2>
      {!account || account.orders.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600">
          No saved orders at this shop yet. Place an order while signed in, or save a guest order
          with its access code.
        </p>
      ) : (
        <ul className="mt-3 divide-y">
          {account.orders.map((order) => (
            <li key={order.reference} className="py-3">
              <Link
                to="/store/$slug/order/$reference"
                params={{ slug: store.slug, reference: order.reference }}
                className="flex justify-between gap-3 text-sm"
              >
                <span>
                  {order.reference}
                  <span className="mt-1 block text-neutral-500">
                    {friendlyDateTime(order.createdAt)} · {order.fulfilmentStatus} ·{" "}
                    {order.paymentStatus}
                  </span>
                </span>
                <span>{formatMoney(order.total, order.currency)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
