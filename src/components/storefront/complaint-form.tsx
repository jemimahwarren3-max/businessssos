import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createComplaintFn } from "@/lib/storefront/storefront.functions";
import { readableError } from "@/lib/format";

export function StoreComplaintForm({
  slug,
  reference,
  token,
  defaultName,
  defaultPhone,
  defaultEmail,
}: {
  slug: string;
  reference?: string;
  token?: string;
  defaultName?: string;
  defaultPhone?: string;
  defaultEmail?: string;
}) {
  const submit = useServerFn(createComplaintFn);
  const [name, setName] = useState(defaultName ?? "");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [message, setMessage] = useState("");
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
          message,
          customer: { name, phone, email },
          reference,
          token,
        },
      });
      setDone(true);
    } catch (reason) {
      setError(readableError(reason as Error, "The report was not sent. You can try again."));
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-neutral-600">
        The shop has been notified. This is not a guarantee of a refund. Keep your order details.
      </p>
    );
  }

  return (
    <form className="space-y-3 text-sm" onSubmit={(event) => void onSubmit(event)}>
      <p className="font-medium">Report a problem to this shop</p>
      <label className="block">
        Name
        <input
          className="mt-1 w-full rounded border px-3 py-2"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="block">
        Phone
        <input
          className="mt-1 w-full rounded border px-3 py-2"
          required
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </label>
      <label className="block">
        Email (optional)
        <input
          className="mt-1 w-full rounded border px-3 py-2"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label className="block">
        What went wrong
        <textarea
          className="mt-1 w-full rounded border px-3 py-2"
          required
          minLength={8}
          maxLength={2000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </label>
      {error ? <p className="text-red-700">{error}</p> : null}
      <button
        className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        disabled={pending}
        type="submit"
      >
        {pending ? "Sending…" : "Send report"}
      </button>
    </form>
  );
}
