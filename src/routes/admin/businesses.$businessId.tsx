import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  getAdminBusinessDetailFn,
  getBusinessFeatureFlagsFn,
  setBusinessFeatureFlagsFn,
  startImpersonationFn,
} from "@/lib/admin/admin.functions";
import { formatMoney, friendlyDate, friendlyDateTime, readableError } from "@/lib/format";
import { storePublicUrl } from "@/lib/storefront/host";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/businesses/$businessId")({
  component: AdminBusinessDetailPage,
});

function AdminBusinessDetailPage() {
  const { businessId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetch = useServerFn(getAdminBusinessDetailFn);
  const fetchFlags = useServerFn(getBusinessFeatureFlagsFn);
  const saveFlags = useServerFn(setBusinessFeatureFlagsFn);
  const startImpersonation = useServerFn(startImpersonationFn);
  const detail = useQuery({
    queryKey: ["admin-business", businessId],
    queryFn: () => fetch({ data: { businessId } }),
  });
  const flags = useQuery({
    queryKey: ["admin-business-flags", businessId],
    queryFn: () => fetchFlags({ data: { businessId } }),
  });

  const [impersonationReason, setImpersonationReason] = useState("");
  const [flagReason, setFlagReason] = useState("");
  const [billingExempt, setBillingExempt] = useState(false);
  const [onlineShopEnabled, setOnlineShopEnabled] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [courierManualMode, setCourierManualMode] = useState(true);
  const [flagNotes, setFlagNotes] = useState("");

  useEffect(() => {
    if (!flags.data) return;
    setBillingExempt(flags.data.billingExempt);
    setOnlineShopEnabled(flags.data.onlineShopEnabled);
    setSmsNotifications(flags.data.smsNotifications);
    setCourierManualMode(flags.data.courierManualMode);
    setFlagNotes(flags.data.notes);
  }, [flags.data]);

  const impersonate = useMutation({
    mutationFn: () =>
      startImpersonation({
        data: {
          businessId,
          reason: impersonationReason.trim(),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace"] });
      navigate({ to: "/dashboard" });
    },
  });

  const saveFlagsMutation = useMutation({
    mutationFn: () =>
      saveFlags({
        data: {
          businessId,
          billingExempt,
          onlineShopEnabled,
          smsNotifications,
          courierManualMode,
          notes: flagNotes,
          reason: flagReason.trim() || "Updated tenant feature flags",
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-business-flags", businessId] });
      setFlagReason("");
    },
  });

  if (detail.isLoading) {
    return (
      <AdminShell title="Business">
        <Skeleton className="h-64" />
      </AdminShell>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <AdminShell title="Business">
        <p className="text-sm text-destructive">
          {detail.isError
            ? readableError(detail.error as Error, "Could not load this business.")
            : "Business not found."}
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/admin/businesses">Back to list</Link>
        </Button>
      </AdminShell>
    );
  }

  const data = detail.data;
  const sf = data.storefront;

  return (
    <AdminShell title={data.business.name}>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/businesses">All businesses</Link>
        </Button>
        {sf?.status === "published" ? (
          <Button asChild size="sm" variant="outline">
            <a href={storePublicUrl(sf.slug)} target="_blank" rel="noreferrer">
              Open live shop
            </a>
          </Button>
        ) : null}
      </div>

      <section className="surface space-y-3 p-4">
        <h2 className="text-sm font-semibold">Support impersonation</h2>
        <p className="text-sm text-muted-foreground">
          Opens the merchant dashboard as this tenant (read-only). Every start/end is written to the
          platform audit log.
        </p>
        <Label htmlFor="impersonation-reason">Reason (required)</Label>
        <Input
          id="impersonation-reason"
          value={impersonationReason}
          onChange={(event) => setImpersonationReason(event.target.value)}
          placeholder="Ticket #1234 — checkout issue"
        />
        {impersonate.isError ? (
          <p className="text-sm text-destructive">
            {readableError(impersonate.error as Error, "Could not start support view.")}
          </p>
        ) : null}
        <Button
          type="button"
          disabled={impersonate.isPending || impersonationReason.trim().length < 3}
          onClick={() => impersonate.mutate()}
        >
          Open merchant dashboard (read-only)
        </Button>
      </section>

      <section className="surface space-y-3 p-4">
        <h2 className="text-sm font-semibold">Tenant feature flags</h2>
        {flags.isLoading ? <Skeleton className="h-24" /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={billingExempt} onCheckedChange={(v) => setBillingExempt(v === true)} />
            Billing exempt (treat like platform owner for entitlements)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={onlineShopEnabled}
              onCheckedChange={(v) => setOnlineShopEnabled(v === true)}
            />
            Online shop enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={smsNotifications}
              onCheckedChange={(v) => setSmsNotifications(v === true)}
            />
            SMS notifications (placeholder — manual ops)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={courierManualMode}
              onCheckedChange={(v) => setCourierManualMode(v === true)}
            />
            Courier manual mode
          </label>
        </div>
        <Label htmlFor="flag-notes">Internal notes</Label>
        <Textarea
          id="flag-notes"
          rows={3}
          value={flagNotes}
          onChange={(event) => setFlagNotes(event.target.value)}
        />
        <Label htmlFor="flag-reason">Audit reason</Label>
        <Input
          id="flag-reason"
          value={flagReason}
          onChange={(event) => setFlagReason(event.target.value)}
        />
        {saveFlagsMutation.isError ? (
          <p className="text-sm text-destructive">
            {readableError(saveFlagsMutation.error as Error, "Could not save flags.")}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={saveFlagsMutation.isPending}
          onClick={() => saveFlagsMutation.mutate()}
        >
          Save feature flags
        </Button>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Products", data.counts.products],
          ["Store orders", data.counts.store_orders],
          ["Sales rows", data.counts.sales],
          ["Team", data.counts.members],
        ].map(([label, value]) => (
          <div key={String(label)} className="surface p-3">
            <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="surface space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Subscription</h2>
          {data.subscription ? (
            <>
              <p>
                Plan: <Badge variant="outline">{data.subscription.plan}</Badge> ·{" "}
                {data.subscription.status}
              </p>
              <p className="text-muted-foreground">
                Trial ends:{" "}
                {data.subscription.trial_ends_at
                  ? friendlyDate(data.subscription.trial_ends_at)
                  : "—"}
              </p>
              <p className="text-muted-foreground">
                Period ends:{" "}
                {data.subscription.current_period_end
                  ? friendlyDate(data.subscription.current_period_end)
                  : "—"}
              </p>
              <Button asChild size="sm" variant="outline" className="mt-2">
                <Link to="/admin/billing">Override in billing</Link>
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">No subscription row.</p>
          )}
        </section>
        <section className="surface space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Storefront</h2>
          {sf ? (
            <>
              <p>{sf.store_name}</p>
              <p>
                <Badge variant="outline">{sf.status}</Badge> · {sf.template_id}
              </p>
              <p className="font-mono text-xs">{sf.slug}</p>
            </>
          ) : (
            <p className="text-muted-foreground">No storefront configured.</p>
          )}
        </section>
      </div>

      <section className="surface overflow-x-auto p-4">
        <h2 className="mb-2 text-sm font-semibold">Team</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Shop alert email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.members.map((m) => (
              <TableRow key={m.user_id}>
                <TableCell>{m.email ?? m.user_id}</TableCell>
                <TableCell className="capitalize">{m.role}</TableCell>
                <TableCell>{m.notify_email ? "On" : "Off"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="surface overflow-x-auto p-4">
        <h2 className="mb-2 text-sm font-semibold">Recent store orders</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Fulfilment</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.recent_orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No orders yet.
                </TableCell>
              </TableRow>
            ) : null}
            {data.recent_orders.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-mono text-xs">{o.reference}</TableCell>
                <TableCell>{o.customer_name}</TableCell>
                <TableCell>{formatMoney(Number(o.total), o.currency)}</TableCell>
                <TableCell>{o.payment_status}</TableCell>
                <TableCell>{o.fulfilment_status}</TableCell>
                <TableCell>{friendlyDateTime(o.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <p className="text-xs text-muted-foreground">
        Created {friendlyDate(data.business.created_at)} · {data.business.currency} ·{" "}
        {data.business.business_type}
      </p>
    </AdminShell>
  );
}
