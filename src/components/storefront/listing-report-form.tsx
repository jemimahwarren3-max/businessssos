import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listingReportReasons } from "@/lib/storefront/contract";
import { createListingReportFn } from "@/lib/storefront/storefront.functions";
import { readableError } from "@/lib/format";

const REASON_LABEL: Record<(typeof listingReportReasons)[number], string> = {
  misleading: "Misleading description or price",
  prohibited: "Looks unlawful or unsafe",
  spam: "Spam or fake shop",
  other: "Something else",
};

export function ListingReportForm({ slug, productId }: { slug: string; productId?: string }) {
  const submit = useServerFn(createListingReportFn);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof listingReportReasons)[number]>("misleading");
  const [detail, setDetail] = useState("");
  const [contact, setContact] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await submit({
        data: {
          slug,
          reason,
          detail,
          ...(productId ? { productId } : {}),
          ...(contact.trim() ? { contact: contact.trim() } : {}),
        },
      });
      setDone(true);
    } catch (reasonCaught) {
      setError(readableError(reasonCaught as Error, "The report was not sent. You can try again."));
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-neutral-600">
        Report received. This is not a public score and does not remove the listing by itself.
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className="text-sm underline" onClick={() => setOpen(true)}>
        {productId ? "Report this listing" : "Report this shop"}
      </button>
    );
  }

  return (
    <form className="space-y-3 text-sm" onSubmit={(event) => void onSubmit(event)}>
      <p className="font-medium">{productId ? "Report this listing" : "Report this shop"}</p>
      <label className="block">
        Reason
        <select
          className="mt-1 w-full rounded border px-3 py-2"
          value={reason}
          onChange={(event) =>
            setReason(event.target.value as (typeof listingReportReasons)[number])
          }
        >
          {listingReportReasons.map((value) => (
            <option key={value} value={value}>
              {REASON_LABEL[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Details
        <textarea
          className="mt-1 w-full rounded border px-3 py-2"
          required
          minLength={8}
          maxLength={2000}
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
        />
      </label>
      <label className="block">
        Contact (optional)
        <input
          className="mt-1 w-full rounded border px-3 py-2"
          value={contact}
          onChange={(event) => setContact(event.target.value)}
        />
      </label>
      {error ? <p className="text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
          disabled={pending}
          type="submit"
        >
          {pending ? "Sending…" : "Send report"}
        </button>
        <button type="button" className="px-3 py-2" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
