import { Link } from "@tanstack/react-router";
import { formatMoney } from "@/lib/format";
import { paymentRailLabel } from "@/lib/payment-rails";

export type DailyTakingsView = {
  received: { rail: string; method: string; amount: number }[];
  creditOnAccount: number;
};

export function DailyTakingsList({
  takings,
  currency,
  showCashUpLink = true,
}: {
  takings: DailyTakingsView | undefined;
  currency: string;
  showCashUpLink?: boolean;
}) {
  const rows = takings?.received ?? [];
  const credit = takings?.creditOnAccount ?? 0;
  const receivedTotal = rows.reduce((sum, row) => sum + row.amount, 0);

  if (rows.length === 0 && credit <= 0) {
    return <p className="text-sm text-muted-foreground">No payments recorded today yet.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li
            key={`${row.rail}-${row.method}`}
            className="flex items-center justify-between gap-3 py-2"
          >
            <span className="text-sm">{paymentRailLabel(row.rail, row.method)}</span>
            <span className="text-sm font-semibold tabular-nums">
              {formatMoney(row.amount, currency)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-2 text-sm font-semibold">
        <span>Received today</span>
        <span className="tabular-nums">{formatMoney(receivedTotal, currency)}</span>
      </div>
      {credit > 0 ? (
        <p className="text-[13px] text-muted-foreground">
          On account (not received): {formatMoney(credit, currency)}
        </p>
      ) : null}
      <p className="text-[12px] text-muted-foreground">
        These are recorded tenders, not confirmed EcoCash or bank deposits.
        {showCashUpLink ? (
          <>
            {" "}
            <Link to="/cash-drawer" className="underline">
              Cash-up
            </Link>
          </>
        ) : (
          " Check statements before you treat digital payments as received."
        )}
      </p>
    </div>
  );
}
