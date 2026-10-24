import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Download,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck,
} from "lucide-react";
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
import { LineItemsEditor } from "@/components/line-items-editor";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  addPurchaseOrder,
  addSupplier,
  deleteSupplierFn,
  getProducts,
  getSuppliers,
  updateSupplierFn,
} from "@/lib/business.functions";
import {
  purchaseOrderSchema,
  supplierSchema,
  updateSupplierSchema,
  type LineItemInput,
} from "@/lib/business.schemas";
import { readableError } from "@/lib/format";
import { computeTotals } from "@/lib/invoice-calc";
import { buildPurchaseOrderWhatsAppMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import { downloadXlsx } from "@/lib/xlsx-export";

const EMPTY_ITEM: LineItemInput = {
  productId: "",
  name: "",
  quantity: 1,
  unitPrice: 0,
  taxRate: 0,
};

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers | Kwetuu" },
      {
        name: "description",
        content: "Your supplier directory, who you buy from and how to reach them.",
      },
      { property: "og:title", content: "Suppliers | Kwetuu" },
      { property: "og:description", content: "Know who you buy from." },
    ],
  }),
  component: Suppliers,
});

type SupplierRow = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

const EMPTY = { name: "", contactPerson: "", phone: "", email: "", address: "", notes: "" };

function Suppliers() {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";
  const businessName = workspace.data?.business.name ?? "";
  const canManage = ["owner", "admin", "manager"].includes(workspace.data?.role ?? "");

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [orderTarget, setOrderTarget] = useState<SupplierRow | null>(null);
  const [orderItems, setOrderItems] = useState<LineItemInput[]>([{ ...EMPTY_ITEM }]);

  const fetchSuppliers = useServerFn(getSuppliers);
  const createSupplierFn = useServerFn(addSupplier);
  const editSupplierFn = useServerFn(updateSupplierFn);
  const removeSupplierFn = useServerFn(deleteSupplierFn);
  const fetchProducts = useServerFn(getProducts);
  const createPurchaseOrderFn = useServerFn(addPurchaseOrder);

  useEffect(() => {
    if (!workspace.isLoading && workspace.data === null) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [workspace.isLoading, workspace.data, navigate]);

  const suppliers = useQuery({
    queryKey: ["suppliers", businessId, search],
    enabled: Boolean(businessId),
    queryFn: () => fetchSuppliers({ data: { businessId: businessId!, search } }),
  });

  const orderProducts = useQuery({
    queryKey: ["products", businessId, "", orderTarget?.id],
    enabled: Boolean(businessId) && Boolean(orderTarget),
    queryFn: () =>
      fetchProducts({ data: { businessId: businessId!, search: "", supplierId: orderTarget!.id } }),
  });

  const orderMutation = useMutation({
    mutationFn: async () => {
      const parsed = purchaseOrderSchema.parse({
        businessId,
        supplierId: orderTarget!.id,
        orderDate: new Date().toISOString().slice(0, 10),
        items: orderItems,
      });
      return createPurchaseOrderFn({ data: parsed });
    },
    onSuccess: async () => {
      const totals = computeTotals(orderItems, 0);
      const contactName = orderTarget!.contact_person || orderTarget!.name;
      const message = buildPurchaseOrderWhatsAppMessage(
        contactName,
        businessName,
        orderItems,
        totals,
        currency,
      );
      const link = buildWhatsAppLink(orderTarget!.phone, message);
      setOrderTarget(null);
      setOrderItems([{ ...EMPTY_ITEM }]);
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      if (link) {
        toast.success("Purchase order created. Opening WhatsApp…");
        window.open(link, "_blank", "noopener,noreferrer");
      } else {
        toast.success("Purchase order created, but this supplier has no phone on file to message.");
      }
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "We couldn't create that purchase order.")),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const parsed = updateSupplierSchema.parse({ businessId, supplierId: editingId, ...form });
        return editSupplierFn({ data: parsed });
      }
      const parsed = supplierSchema.parse({ businessId, ...form });
      return createSupplierFn({ data: parsed });
    },
    onSuccess: async () => {
      setOpen(false);
      setEditingId(null);
      setForm(EMPTY);
      toast.success(editingId ? "Supplier updated." : "Supplier added.");
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "We couldn't save that supplier.")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (supplierId: string) =>
      removeSupplierFn({ data: { businessId: businessId!, supplierId } }),
    onSuccess: async () => {
      toast.success("Supplier deleted.");
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "We couldn't delete that supplier.")),
  });

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(supplier: SupplierRow) {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name,
      contactPerson: supplier.contact_person ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      address: supplier.address ?? "",
      notes: supplier.notes ?? "",
    });
    setOpen(true);
  }

  if (!workspace.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const rows = (suppliers.data ?? []) as SupplierRow[];

  function exportExcel() {
    downloadXlsx("suppliers", [
      {
        name: "Suppliers",
        headers: ["Name", "Contact person", "Phone", "Email", "Address", "Notes"],
        rows: rows.map((s) => [
          s.name,
          s.contact_person ?? "",
          s.phone ?? "",
          s.email ?? "",
          s.address ?? "",
          s.notes ?? "",
        ]),
      },
    ]);
  }

  return (
    <AppShell
      businessName={workspace.data.business.name}
      role={workspace.data.role}
      plan={workspace.data.plan}
      isReadOnly={workspace.data.isReadOnly}
      billingEnabled={workspace.data.billingEnabled}
      title="Suppliers"
      subtitle="Who you buy from, and how to reach them."
      actions={
        <>
          {rows.length > 0 ? (
            <Button variant="outline" className="gap-1.5" onClick={exportExcel}>
              <Download className="size-4" aria-hidden="true" /> Export to Excel
            </Button>
          ) : null}
          {canManage ? (
            <Button className="gap-1.5" onClick={openAdd}>
              <Plus className="size-4" aria-hidden="true" /> Add supplier
            </Button>
          ) : null}
        </>
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
          aria-label="Search suppliers"
        />
      </div>

      <div className="surface mt-4 overflow-hidden">
        {suppliers.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Truck className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-semibold">
              {search ? "No suppliers match that search" : "No suppliers yet"}
            </h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              {search
                ? "Try a shorter search term."
                : "Add who you buy from so you can link products to them and keep contact details in one place."}
            </p>
            {canManage && !search ? (
              <Button className="mt-5 gap-1.5" onClick={openAdd}>
                <Plus className="size-4" aria-hidden="true" /> Add your first supplier
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((supplier) => (
              <li
                key={supplier.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{supplier.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {supplier.contact_person ? `${supplier.contact_person} · ` : ""}
                    {supplier.phone || supplier.email || "No contact details"}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => {
                        setOrderItems([{ ...EMPTY_ITEM }]);
                        setOrderTarget(supplier);
                      }}
                    >
                      <MessageCircle className="size-3.5" aria-hidden="true" /> Order
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => openEdit(supplier)}
                      aria-label="Edit supplier"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        if (confirm("Delete this supplier? This can't be undone.")) {
                          deleteMutation.mutate(supplier.id);
                        }
                      }}
                      aria-label="Delete supplier"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit supplier" : "Add a supplier"}</DialogTitle>
            <DialogDescription>Only the name is required.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="s-name">Supplier name</Label>
              <Input
                id="s-name"
                value={form.name}
                maxLength={160}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Acme Wholesale"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="s-contact">Contact person</Label>
              <Input
                id="s-contact"
                value={form.contactPerson}
                maxLength={160}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-phone">Phone</Label>
              <Input
                id="s-phone"
                value={form.phone}
                maxLength={40}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-email">Email</Label>
              <Input
                id="s-email"
                type="email"
                value={form.email}
                maxLength={200}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="s-address">Address</Label>
              <Input
                id="s-address"
                value={form.address}
                maxLength={240}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="s-notes">Notes</Label>
              <Textarea
                id="s-notes"
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
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || form.name.trim().length === 0}
              className="gap-1.5"
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Save supplier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(orderTarget)} onOpenChange={(next) => !next && setOrderTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order from {orderTarget?.name}</DialogTitle>
            <DialogDescription>
              Add what you're buying, this creates a purchase order and opens WhatsApp with it
              pre-filled, using their phone number on file. Prices are estimates from your last
              recorded cost; ask the supplier to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Items</Label>
            <LineItemsEditor
              items={orderItems}
              onChange={setOrderItems}
              products={(orderProducts.data ?? []).map((p) => ({
                id: p.id,
                name: p.name,
                price: Number(p.cost_price),
                tax_rate: Number(p.tax_rate),
              }))}
              currency={currency}
            />
            {orderTarget && !orderProducts.isLoading && (orderProducts.data ?? []).length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No products are tagged to this supplier yet, use "Custom item" below, or tag
                products to this supplier from Inventory.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOrderTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => orderMutation.mutate()}
              disabled={orderMutation.isPending || orderItems.every((item) => !item.name.trim())}
              className="gap-1.5"
            >
              {orderMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <MessageCircle className="size-4" aria-hidden="true" />
              )}
              Create order &amp; message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
