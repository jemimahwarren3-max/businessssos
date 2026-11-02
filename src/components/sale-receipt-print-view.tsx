import { formatMoney, friendlyDateTime } from "@/lib/format";

export type SaleReceiptProps = {
  businessName: string;
  receiptNumber: string;
  date: string;
  paymentMethod: string;
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  cashierName?: string | undefined;
  customerName?: string | undefined;
};

export function SaleReceiptPrintView(props: SaleReceiptProps) {
  return (
    <div className="bg-white text-black">
      <div className="border-b border-black/20 pb-3 text-center">
        <h1 className="text-lg font-bold">{props.businessName}</h1>
        <p className="text-sm text-black/60">Receipt #{props.receiptNumber}</p>
        <p className="text-sm text-black/60">{friendlyDateTime(props.date)}</p>
      </div>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-black/40 text-left">
            <th className="py-1">Item</th>
            <th className="py-1 text-right">Qty</th>
            <th className="py-1 text-right">Price</th>
            <th className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {props.items.map((item, i) => (
            <tr key={i} className="border-b border-black/10">
              <td className="py-1">{item.name}</td>
              <td className="py-1 text-right">{item.quantity}</td>
              <td className="py-1 text-right">{formatMoney(item.unitPrice, props.currency)}</td>
              <td className="py-1 text-right">{formatMoney(item.lineTotal, props.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-3 w-56 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-black/60">Subtotal</span>
          <span>{formatMoney(props.subtotal, props.currency)}</span>
        </div>
        {props.discount > 0 ? (
          <div className="flex justify-between">
            <span className="text-black/60">Discount</span>
            <span>-{formatMoney(props.discount, props.currency)}</span>
          </div>
        ) : null}
        {props.tax > 0 ? (
          <div className="flex justify-between">
            <span className="text-black/60">Tax</span>
            <span>{formatMoney(props.tax, props.currency)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-black/40 pt-1 text-base font-bold">
          <span>Total</span>
          <span>{formatMoney(props.total, props.currency)}</span>
        </div>
      </div>

      <div className="mt-4 space-y-1 border-t border-black/20 pt-3 text-sm">
        <div className="flex justify-between">
          <span className="text-black/60">Payment</span>
          <span>{props.paymentMethod}</span>
        </div>
        {props.customerName ? (
          <div className="flex justify-between">
            <span className="text-black/60">Customer</span>
            <span>{props.customerName}</span>
          </div>
        ) : null}
        {props.cashierName ? (
          <div className="flex justify-between">
            <span className="text-black/60">Served by</span>
            <span>{props.cashierName}</span>
          </div>
        ) : null}
      </div>

      <p className="mt-6 text-center text-xs text-black/40">Thank you for your purchase</p>
    </div>
  );
}
