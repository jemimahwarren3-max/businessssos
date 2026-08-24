import { formatMoney, friendlyDate } from "@/lib/format";

type PrintItem = {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type DocumentPrintViewProps = {
  kind: "invoice" | "quote";
  number: string;
  issueDate: string;
  secondDateLabel: string;
  secondDate: string | null;
  business: { name: string; address: string | null; phone: string | null; email: string | null };
  customer: { name: string; phone: string | null; email: string | null } | null;
  items: PrintItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid?: number;
  notes: string | null;
  terms: string | null;
  currency: string;
};

/** Rendered `hidden print:block` inside the existing detail dialog — never
 * seen on screen, only when printing/saving as PDF (see the .print-area
 * rule in src/styles.css). Deliberately plain black-on-white regardless of
 * the app's own theme tokens: printers print on white paper, and a
 * dark-mode-aware color would either invert badly or waste ink. */
export function DocumentPrintView({
  kind,
  number,
  issueDate,
  secondDateLabel,
  secondDate,
  business,
  customer,
  items,
  subtotal,
  discount,
  tax,
  total,
  amountPaid,
  notes,
  terms,
  currency,
}: DocumentPrintViewProps) {
  return (
    <div className="bg-white text-black">
      <div className="flex items-start justify-between border-b border-black/20 pb-4">
        <div>
          <h1 className="text-lg font-bold">{business.name}</h1>
          {business.address ? <p className="text-sm">{business.address}</p> : null}
          {business.phone ? <p className="text-sm">{business.phone}</p> : null}
          {business.email ? <p className="text-sm">{business.email}</p> : null}
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-bold uppercase tracking-wide">{kind}</h2>
          <p className="text-sm">#{number}</p>
        </div>
      </div>

      <div className="mt-4 flex justify-between gap-6 text-sm">
        <div>
          <p className="font-semibold uppercase text-[11px] tracking-wide text-black/60">Bill to</p>
          {customer ? (
            <>
              <p className="font-medium">{customer.name}</p>
              {customer.phone ? <p>{customer.phone}</p> : null}
              {customer.email ? <p>{customer.email}</p> : null}
            </>
          ) : (
            <p>Walk-in / no customer on file</p>
          )}
        </div>
        <div className="text-right">
          <p>
            <span className="text-black/60">Issued: </span>
            {friendlyDate(issueDate)}
          </p>
          {secondDate ? (
            <p>
              <span className="text-black/60">{secondDateLabel}: </span>
              {friendlyDate(secondDate)}
            </p>
          ) : null}
        </div>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/40 text-left">
            <th className="py-1.5">Item</th>
            <th className="py-1.5 text-right">Qty</th>
            <th className="py-1.5 text-right">Price</th>
            <th className="py-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="border-b border-black/10">
              <td className="py-1.5">{item.name}</td>
              <td className="py-1.5 text-right">{item.quantity}</td>
              <td className="py-1.5 text-right">{formatMoney(item.unit_price, currency)}</td>
              <td className="py-1.5 text-right">{formatMoney(item.line_total, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-4 w-64 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-black/60">Subtotal</span>
          <span>{formatMoney(subtotal, currency)}</span>
        </div>
        {discount > 0 ? (
          <div className="flex justify-between">
            <span className="text-black/60">Discount</span>
            <span>-{formatMoney(discount, currency)}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span className="text-black/60">Tax</span>
          <span>{formatMoney(tax, currency)}</span>
        </div>
        <div className="flex justify-between border-t border-black/40 pt-1 text-base font-bold">
          <span>Total</span>
          <span>{formatMoney(total, currency)}</span>
        </div>
        {amountPaid !== undefined ? (
          <div className="flex justify-between">
            <span className="text-black/60">Paid</span>
            <span>{formatMoney(amountPaid, currency)}</span>
          </div>
        ) : null}
      </div>

      {notes || terms ? (
        <div className="mt-8 space-y-3 border-t border-black/20 pt-4 text-[13px]">
          {notes ? (
            <div>
              <p className="font-semibold uppercase text-[11px] tracking-wide text-black/60">
                Notes
              </p>
              <p className="whitespace-pre-wrap">{notes}</p>
            </div>
          ) : null}
          {terms ? (
            <div>
              <p className="font-semibold uppercase text-[11px] tracking-wide text-black/60">
                Terms
              </p>
              <p className="whitespace-pre-wrap">{terms}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
