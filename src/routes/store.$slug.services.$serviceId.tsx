import { useMemo, useState } from "react";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatMoney, readableError } from "@/lib/format";
import {
  listPublicBookingSlotsFn,
  requestPublicBookingFn,
  submitPublicServiceRequestFn,
} from "@/lib/services.functions";
import { buildWhatsAppLink } from "@/lib/whatsapp";
import { Route as StoreRoute } from "./store.$slug";

export const Route = createFileRoute("/store/$slug/services/$serviceId")({
  head: () => ({
    meta: [{ title: "Service" }, { name: "description", content: "Book or request this service." }],
  }),
  component: PublicServicePage,
});

function upcomingDates(count = 14) {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i += 1) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, "0");
    const d = String(day.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
  }
  return dates;
}

function PublicServicePage() {
  const { store } = StoreRoute.useLoaderData();
  const { serviceId } = Route.useParams();
  const service = (store.services ?? []).find((item) => item.id === serviceId);
  if (!service) throw notFound();

  const [on, setOn] = useState(upcomingDates()[0] ?? "");
  const [startsAt, setStartsAt] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState<"booking" | "request" | null>(null);

  const loadSlots = useServerFn(listPublicBookingSlotsFn);
  const requestBooking = useServerFn(requestPublicBookingFn);
  const submitRequest = useServerFn(submitPublicServiceRequestFn);
  const dates = useMemo(() => upcomingDates(), []);

  const slots = useQuery({
    queryKey: ["public-slots", store.slug, service.id, on],
    enabled: service.requiresBooking && service.pricingType !== "quote" && Boolean(on),
    queryFn: () =>
      loadSlots({
        data: { slug: store.slug, serviceId: service.id, on, memberId: "" },
      }),
  });

  const bookingMutation = useMutation({
    mutationFn: () =>
      requestBooking({
        data: {
          slug: store.slug,
          serviceId: service.id,
          startsAt,
          customerName: name,
          customerPhone: phone,
          customerEmail: email,
          notes,
        },
      }),
    onSuccess: () => setDone("booking"),
  });

  const requestMutation = useMutation({
    mutationFn: () =>
      submitRequest({
        data: {
          slug: store.slug,
          serviceId: service.id,
          customerName: name,
          customerPhone: phone,
          customerEmail: email,
          description: notes || `Request for ${service.name}`,
          preferredDate: on,
        },
      }),
    onSuccess: () => setDone("request"),
  });

  const theme = store.theme;
  const whatsapp = buildWhatsAppLink(
    store.whatsapp || store.phone,
    `Hello ${store.storeName}, I would like to ask about ${service.name}.`,
  );
  const isQuote = service.pricingType === "quote" || !service.requiresBooking;
  const pending = bookingMutation.isPending || requestMutation.isPending;
  const error = bookingMutation.error || requestMutation.error;

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/store/$slug" params={{ slug: store.slug }} className="text-sm underline">
        Back to {store.storeName}
      </Link>
      <div className="mt-4 overflow-hidden rounded-xl" style={{ backgroundColor: theme.surface }}>
        {service.imageUrl ? (
          <img src={service.imageUrl} alt="" className="h-56 w-full object-cover" />
        ) : null}
        <div className="p-5">
          {service.categoryName ? (
            <p className="text-xs uppercase tracking-wide opacity-70">{service.categoryName}</p>
          ) : null}
          <h1 className="mt-1 text-3xl font-semibold" style={{ color: theme.primary }}>
            {service.name}
          </h1>
          <p className="mt-2 text-lg font-medium">
            {isQuote && service.price <= 0
              ? "Quote on request"
              : formatMoney(service.price, store.currency)}
            {service.durationMinutes ? ` · ${service.durationMinutes} min` : ""}
          </p>
          {service.description ? (
            <p className="mt-3 whitespace-pre-wrap opacity-80">{service.description}</p>
          ) : null}
          {store.hours ? (
            <p className="mt-3 whitespace-pre-wrap text-sm opacity-70">{store.hours}</p>
          ) : null}
        </div>
      </div>

      {done ? (
        <div className="mt-6 rounded-xl border p-5">
          <h2 className="text-lg font-semibold">Request received</h2>
          <p className="mt-2 text-sm opacity-80">
            {done === "booking"
              ? "The business will confirm this time, or you will see it confirmed if they auto-approve bookings."
              : "The business will come back to you with a quote or next step."}
          </p>
        </div>
      ) : (
        <form
          className="mt-6 space-y-3 rounded-xl border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (isQuote) requestMutation.mutate();
            else bookingMutation.mutate();
          }}
        >
          <h2 className="text-lg font-semibold">
            {isQuote ? "Ask for a quote" : "Request a booking"}
          </h2>
          <label className="block text-sm">
            Your name
            <input
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Phone
            <input
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Email (optional)
            <input
              type="email"
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Preferred date
            <select
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={on}
              onChange={(event) => {
                setOn(event.target.value);
                setStartsAt("");
              }}
            >
              {dates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </label>
          {!isQuote ? (
            <div>
              <p className="text-sm font-medium">Available times</p>
              {slots.isLoading ? (
                <p className="mt-2 text-sm opacity-70">Loading times…</p>
              ) : (slots.data ?? []).length === 0 ? (
                <p className="mt-2 text-sm opacity-70">
                  No free times that day. Try another date or message the business.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(slots.data ?? []).map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setStartsAt(slot)}
                      className={
                        startsAt === slot
                          ? "rounded-md px-2 py-1 text-xs font-semibold"
                          : "rounded-md border px-2 py-1 text-xs"
                      }
                      style={
                        startsAt === slot
                          ? { backgroundColor: theme.accent, color: theme.buttonText }
                          : undefined
                      }
                    >
                      {new Date(slot).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: store.delivery.timezone || "Africa/Harare",
                      })}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          <label className="block text-sm">
            {isQuote ? "What do you need?" : "Notes (optional)"}
            <textarea
              className="mt-1 w-full rounded-md border px-3 py-2"
              required={isQuote}
              minLength={isQuote ? 4 : 0}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {error ? (
            <p className="text-sm text-red-700">
              {readableError(error as Error, "Could not send that request.")}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending || (!isQuote && !startsAt)}
            className="rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: theme.accent, color: theme.buttonText }}
          >
            {pending ? "Sending…" : isQuote ? "Send request" : "Request booking"}
          </button>
        </form>
      )}

      {whatsapp ? (
        <a
          href={whatsapp}
          className="mt-4 inline-block text-sm underline"
          target="_blank"
          rel="noreferrer"
        >
          Message on WhatsApp
        </a>
      ) : null}
    </article>
  );
}
