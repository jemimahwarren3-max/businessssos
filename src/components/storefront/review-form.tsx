import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createReviewFn } from "@/lib/storefront/storefront.functions";
import { readableError } from "@/lib/format";

export function StoreReviewForm({
  slug,
  reference,
  token,
  productId,
  productName,
  askForOrderAccess = false,
  onSaved,
}: {
  slug: string;
  reference: string;
  token: string;
  productId: string;
  productName: string;
  askForOrderAccess?: boolean;
  onSaved?: () => void | Promise<void>;
}) {
  const submit = useServerFn(createReviewFn);
  const [orderReference, setOrderReference] = useState(reference);
  const [orderToken, setOrderToken] = useState(token);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await submit({
        data: { slug, reference: orderReference, token: orderToken, productId, rating, body },
      });
    } catch (reason) {
      setError(readableError(reason as Error, "The review was not saved. You can try again."));
      setPending(false);
      return;
    }
    setDone(true);
    try {
      await onSaved?.();
    } catch (reason) {
      setError(
        readableError(
          reason as Error,
          "Your review was saved, but the review list did not refresh.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="text-sm text-neutral-600">
        <p>Saved as a verified purchase review for {productName}.</p>
        {error ? <p className="mt-1 text-amber-800">{error}</p> : null}
      </div>
    );
  }

  return (
    <form className="space-y-2 text-sm" onSubmit={(event) => void onSubmit(event)}>
      <p className="font-medium">Review {productName}</p>
      <p className="text-neutral-500">
        Reviews are tied to an eligible order and its access code. The shop can hide the review;
        this is not a platform guarantee.
      </p>
      {askForOrderAccess ? (
        <>
          <label className="block">
            Order reference
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              autoComplete="off"
              required
              maxLength={40}
              value={orderReference}
              onChange={(event) => setOrderReference(event.target.value)}
            />
          </label>
          <label className="block">
            Order access code
            <input
              className="mt-1 w-full rounded border px-3 py-2"
              type="password"
              autoComplete="off"
              required
              maxLength={80}
              value={orderToken}
              onChange={(event) => setOrderToken(event.target.value)}
            />
          </label>
        </>
      ) : null}
      <label className="block">
        Rating
        <select
          className="mt-1 w-full rounded border px-3 py-2"
          value={rating}
          onChange={(event) => setRating(Number(event.target.value))}
        >
          <option value={5}>5 · as described</option>
          <option value={4}>4 · mostly as described</option>
          <option value={3}>3 · mixed</option>
          <option value={2}>2 · not as described</option>
          <option value={1}>1 · serious problem</option>
        </select>
      </label>
      <label className="block">
        What you received
        <textarea
          className="mt-1 w-full rounded border px-3 py-2"
          required
          minLength={8}
          maxLength={1000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      {error ? <p className="text-red-700">{error}</p> : null}
      <button
        className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Publish review"}
      </button>
    </form>
  );
}
