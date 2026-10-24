import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import {
  addCashMovementFn,
  closeCashSessionFn,
  getCashDrawerFn,
  openCashSessionFn,
} from "@/lib/business.functions";
import { formatMoney, friendlyDateTime, readableError } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/cash-drawer")({
  head: () => ({
    meta: [
      { title: "Cash drawer | Kwetuu" },
      {
        name: "description",
        content:
          "Open a till with a float, record cash in and out, and close with a counted total.",
      },
    ],
  }),
  component: CashDrawerPage,
});

const KIND_LABEL: Record<string, string> = {
  open_float: "Opening float",
  cash_sale: "Cash sale",
  cash_refund: "Cash refund",
  pay_in: "Pay in",
  pay_out: "Pay out",
};

function CashDrawerPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useWorkspace();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const canDrawer = hasPermission(workspace.data, "cash.drawer");
  const canPayOut = ["owner", "admin", "manager"].includes(workspace.data?.role ?? "");

  const [float, setFloat] = useState("0");
  const [openNote, setOpenNote] = useState("");
  const [counted, setCounted] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [moveKind, setMoveKind] = useState<"pay_in" | "pay_out">("pay_in");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveNote, setMoveNote] = useState("");

  const loadDrawer = useServerFn(getCashDrawerFn);
  const openSession = useServerFn(openCashSessionFn);
  const closeSession = useServerFn(closeCashSessionFn);
  const addMove = useServerFn(addCashMovementFn);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const drawer = useQuery({
    queryKey: ["cash-drawer", businessId],
    enabled: Boolean(businessId),
    queryFn: () => loadDrawer({ data: { businessId: businessId! } }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["cash-drawer", businessId] });

  const openMutation = useMutation({
    mutationFn: () =>
      openSession({
        data: { businessId: businessId!, openingFloat: Number(float) || 0, note: openNote },
      }),
    onSuccess: () => {
      toast.success("Cash drawer opened.");
      setOpenNote("");
      void invalidate();
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not open the drawer")),
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      closeSession({
        data: { businessId: businessId!, countedCash: Number(counted) || 0, note: closeNote },
      }),
    onSuccess: (result) => {
      const discrepancy =
        result && typeof result === "object" && "discrepancy" in result
          ? Number((result as { discrepancy: number }).discrepancy)
          : 0;
      toast.success(
        discrepancy === 0
          ? "Cash drawer closed. Count matched expected cash."
          : `Cash drawer closed. Difference: ${formatMoney(discrepancy, currency)}.`,
      );
      setCounted("");
      setCloseNote("");
      void invalidate();
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not close the drawer")),
  });

  const moveMutation = useMutation({
    mutationFn: () =>
      addMove({
        data: {
          businessId: businessId!,
          kind: moveKind,
          amount: Number(moveAmount),
          note: moveNote,
        },
      }),
    onSuccess: () => {
      toast.success(moveKind === "pay_in" ? "Cash in recorded." : "Cash out recorded.");
      setMoveAmount("");
      setMoveNote("");
      void invalidate();
    },
    onError: (error: Error) => toast.error(readableError(error, "Could not record cash movement")),
  });

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const open = drawer.data?.open === true;

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Cash drawer"
      subtitle="A signed ledger of float, cash sales, refunds, and pay in or out. Closing stores counted versus expected."
    >
      {drawer.isLoading ? (
        <Skeleton className="h-48" />
      ) : open ? (
        <div className="space-y-6">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              Opened {drawer.data?.openedAt ? friendlyDateTime(drawer.data.openedAt) : ""}
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">
              {formatMoney(drawer.data?.expected ?? 0, currency)}
            </p>
            <p className="text-sm text-muted-foreground">Expected in the drawer from the ledger</p>
            <p className="mt-2 text-sm">
              Opening float {formatMoney(drawer.data?.openingFloat ?? 0, currency)}
            </p>
          </div>
          {canDrawer ? (
            <form
              className="grid gap-3 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                closeMutation.mutate();
              }}
            >
              <label className="text-sm">
                <Label>Counted cash</Label>
                <Input
                  value={counted}
                  onChange={(event) => setCounted(event.target.value)}
                  inputMode="decimal"
                  required
                />
              </label>
              <label className="text-sm">
                <Label>Close note (optional)</Label>
                <Input value={closeNote} onChange={(event) => setCloseNote(event.target.value)} />
              </label>
              <Button className="md:col-span-2" type="submit" disabled={closeMutation.isPending}>
                Close drawer
              </Button>
            </form>
          ) : null}
          {canDrawer ? (
            <form
              className="grid gap-3 md:grid-cols-4"
              onSubmit={(event) => {
                event.preventDefault();
                moveMutation.mutate();
              }}
            >
              <label className="text-sm">
                <Label>Movement</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={moveKind}
                  onChange={(event) => setMoveKind(event.target.value as "pay_in" | "pay_out")}
                >
                  <option value="pay_in">Pay in</option>
                  {canPayOut ? <option value="pay_out">Pay out</option> : null}
                </select>
              </label>
              <label className="text-sm">
                <Label>Amount</Label>
                <Input
                  value={moveAmount}
                  onChange={(event) => setMoveAmount(event.target.value)}
                  inputMode="decimal"
                  required
                />
              </label>
              <label className="text-sm md:col-span-2">
                <Label>Reason</Label>
                <Input
                  value={moveNote}
                  onChange={(event) => setMoveNote(event.target.value)}
                  required
                  minLength={2}
                />
              </label>
              <Button className="md:col-span-4" type="submit" disabled={moveMutation.isPending}>
                Record movement
              </Button>
            </form>
          ) : null}
          <ul className="divide-y rounded-lg border text-sm">
            {(drawer.data?.movements ?? []).map((row) => (
              <li key={row.id} className="flex justify-between gap-3 p-3">
                <span>
                  {KIND_LABEL[row.kind] ?? row.kind}
                  {row.note ? ` · ${row.note}` : ""}
                </span>
                <span className="tabular-nums">{formatMoney(row.amount, currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Cash sales and cash refunds are refused until a drawer is open. Card and credit sales
            still work. Online shop cash is not in this till.
          </p>
          {canDrawer ? (
            <form
              className="grid max-w-md gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                openMutation.mutate();
              }}
            >
              <label className="text-sm">
                <Label>Opening float</Label>
                <Input value={float} onChange={(event) => setFloat(event.target.value)} />
              </label>
              <label className="text-sm">
                <Label>Note (optional)</Label>
                <Input value={openNote} onChange={(event) => setOpenNote(event.target.value)} />
              </label>
              <Button type="submit" disabled={openMutation.isPending}>
                <Wallet className="mr-2 size-4" aria-hidden="true" /> Open drawer
              </Button>
            </form>
          ) : (
            <p className="text-sm">You do not have permission to open the cash drawer.</p>
          )}
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-base font-semibold">Recent sessions</h2>
        <ul className="mt-3 divide-y rounded-lg border text-sm">
          {(drawer.data?.sessions ?? []).length === 0 ? (
            <li className="p-3 text-muted-foreground">No sessions yet.</li>
          ) : (
            (drawer.data?.sessions ?? []).map((session) => (
              <li key={session.id} className="p-3">
                <p>
                  {friendlyDateTime(session.openedAt)}
                  {session.closedAt ? ` to ${friendlyDateTime(session.closedAt)}` : " (open)"}
                </p>
                {session.closedAt ? (
                  <p className="text-muted-foreground">
                    Counted {formatMoney(session.counted ?? 0, currency)} · expected{" "}
                    {formatMoney(session.expected ?? 0, currency)} · difference{" "}
                    {formatMoney(session.discrepancy ?? 0, currency)}
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Float {formatMoney(session.openingFloat, currency)}
                  </p>
                )}
              </li>
            ))
          )}
        </ul>
        <p className="mt-3 text-sm">
          <Link to="/sales" className="underline">
            Back to sales
          </Link>
        </p>
      </section>
    </AppShell>
  );
}
