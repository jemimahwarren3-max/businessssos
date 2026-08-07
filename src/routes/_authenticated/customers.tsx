import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Search, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/hooks/use-workspace";
import { addCustomer, getCustomers } from "@/lib/business.functions";
import { customerSchema } from "@/lib/business.schemas";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers — BusinessOS AI" },
      {
        name: "description",
        content: "Your customer directory with contact details and outstanding balances.",
      },
      { property: "og:title", content: "Customers — BusinessOS AI" },
      { property: "og:description", content: "Know who buys from you and who owes you." },
    ],
  }),
  component: Customers,
});

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  outstanding_balance: number;
};

const EMPTY = { name: "", phone: "", email: "", address: "", notes: "" };

function Customers() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const fetchCustomers = useServerFn(getCustomers);
  const createCustomer = useServerFn(addCustomer);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const customers = useQuery({
    queryKey: ["customers", businessId, search],
    enabled: Boolean(businessId),
    queryFn: () => fetchCustomers({ data: { businessId: businessId!, search } }),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const parsed = customerSchema.parse({ businessId, ...form });
      return createCustomer({ data: parsed });
    },
    onSuccess: async () => {
      setOpen(false);
      setForm(EMPTY);
      toast.success("Customer added.");
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error: Error) => toast.error(error.message || "We couldn't add that customer."),
  });

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const rows = (customers.data ?? []) as CustomerRow[];

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      title="Customers"
      subtitle="Your customer directory and who still owes you money."
      actions={
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden="true" /> Add customer
        </Button>
      }
    >
      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone or email"
          className="pl-9"
          aria-label="Search customers"
        />
      </div>

      <div className="surface mt-4 overflow-hidden">
        {customers.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Users className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-semibold">
              {search ? "No customers match that search" : "No customers yet"}
            </h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              {search
                ? "Try a shorter search term."
                : "Add the people who buy from you so you can track credit, invoices and repeat sales."}
            </p>
            {!search ? (
              <Button className="mt-5 gap-1.5" onClick={() => setOpen(true)}>
                <Plus className="size-4" aria-hidden="true" /> Add your first customer
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((customer) => {
              const owed = Number(customer.outstanding_balance ?? 0);
              return (
                <li
                  key={customer.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{customer.name}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {customer.phone || customer.email || "No contact details"}
                    </p>
                  </div>
                  <span
                    className={
                      owed > 0
                        ? "shrink-0 rounded-lg bg-warning-soft px-2.5 py-1 text-[13px] font-semibold tabular-nums text-warning-foreground"
                        : "shrink-0 text-[13px] text-muted-foreground"
                    }
                  >
                    {owed > 0 ? `Owes ${formatMoney(owed, currency)}` : "Settled"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add a customer</DialogTitle>
            <DialogDescription>Only the name is required.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="c-name">Full name</Label>
              <Input
                id="c-name"
                value={form.name}
                maxLength={160}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Tendai Moyo"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Phone</Label>
              <Input
                id="c-phone"
                value={form.phone}
                maxLength={40}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input
                id="c-email"
                type="email"
                value={form.email}
                maxLength={200}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="c-address">Address</Label>
              <Input
                id="c-address"
                value={form.address}
                maxLength={240}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="c-notes">Notes</Label>
              <Textarea
                id="c-notes"
                rows={2}
                maxLength={600}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || form.name.trim().length === 0}
              className="gap-1.5"
            >
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Save customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
