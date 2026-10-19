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
  onSaved,
}: {
  slug: string;
  reference: string;
  token: string;
  productId: string;
  productName: string;
  onSaved?: () => void;
}) {
  const submit = useServerFn(createReviewFn);
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
        data: { slug, reference, token, productId, rating, body },
      });
      setDone(true);
      onSaved?.();
    } catch (reason) {
      setError(readableError(reason as Error, "The review was not saved. You can try again."));
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-neutral-600">
        Saved as a verified purchase review for {productName}.
      </p>
    );
  }

  return (
    <form className="space-y-2 text-sm" onSubmit={(event) => void onSubmit(event)}>
      <p className="font-medium">Review {productName}</p>
      <p className="text-neutral-500">
        This uses your order access code. The shop can hide the review. It is not a platform
        guarantee.
      </p>
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
