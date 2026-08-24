import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Wand2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LineItemsEditor, type ProductOption } from "@/components/line-items-editor";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  addCustomer,
  addExpense,
  addSale,
  getCustomers,
  getProducts,
  parseQuickEntryFn,
  updateStock,
} from "@/lib/business.functions";
import {
  customerSchema,
  EXPENSE_CATEGORIES,
  expenseSchema,
  PAYMENT_METHODS,
  saleSchema,
  stockAdjustSchema,
  type LineItemInput,
} from "@/lib/business.schemas";
import { readableError } from "@/lib/format";
import type { QuickEntryDraft } from "@/lib/quick-entry.server";

const NONE = "__none";
const EXAMPLES = [
  "Sold 3 shirts to Mary for $90",
  "Bought 20 cases of Mazoe from ABC Suppliers at $8 each",
  "Paid $45 for transport",
  "New customer John, 0771234567",
];

type SaleDraftState = {
  items: LineItemInput[];
  customerId: string;
  paymentMethod: (typeof PAYMENT_METHODS)[number]["value"];
};

type ExpenseDraftState = {
  category: (typeof EXPENSE_CATEGORIES)[number]["value"];
  description: string;
  amount: string;
  vendor: string;
};

type PurchaseDraftState = {
  productId: string;
  productName: string;
  quantity: string;
  unitCost: string;
  supplierName: string;
};

type CustomerDraftState = { name: string; phone: string; email: string };

export function QuickEntryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const businessId = workspace.data?.business.id;
  const currency = workspace.data?.business.currency ?? "USD";

  const [text, setText] = useState("");
  const [draft, setDraft] = useState<QuickEntryDraft | null>(null);
  const [saleForm, setSaleForm] = useState<SaleDraftState | null>(null);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseDraftState | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseDraftState | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerDraftState | null>(null);

  const parseFn = useServerFn(parseQuickEntryFn);
  const createSaleFn = useServerFn(addSale);
  const createPurchaseFn = useServerFn(updateStock);
  const createExpenseFn = useServerFn(addExpense);
  const createCustomerFn = useServerFn(addCustomer);
  const fetchCustomers = useServerFn(getCustomers);
  const fetchProducts = useServerFn(getProducts);

  const needsProducts = draft?.type === "sale" || draft?.type === "purchase";
  const customers = useQuery({
    queryKey: ["customers", businessId, ""],
    enabled: Boolean(businessId) && draft?.type === "sale",
    queryFn: () => fetchCustomers({ data: { businessId: businessId!, search: "" } }),
  });
  const products = useQuery({
    queryKey: ["products", businessId, ""],
    enabled: Boolean(businessId) && needsProducts,
    queryFn: () => fetchProducts({ data: { businessId: businessId!, search: "" } }),
  });
  const productOptions: ProductOption[] = (products.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    price: Number(p.selling_price),
    tax_rate: Number(p.tax_rate),
  }));

  function reset() {
    setText("");
    setDraft(null);
    setSaleForm(null);
    setPurchaseForm(null);
    setExpenseForm(null);
    setCustomerForm(null);
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  const parseMutation = useMutation({
    mutationFn: () => parseFn({ data: { businessId: businessId!, text } }),
    onSuccess: (result) => {
      setDraft(result);
      if (result.type === "sale") {
        setSaleForm({
          items: result.items.map((item) => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: item.taxRate,
          })),
          customerId: result.customerId,
          paymentMethod: result.paymentMethod,
        });
      } else if (result.type === "purchase") {
        setPurchaseForm({
          productId: result.productId,
          productName: result.productName,
          quantity: String(result.quantity),
          unitCost: result.unitCost ? String(result.unitCost) : "",
          supplierName: result.supplierName,
        });
      } else if (result.type === "expense") {
        setExpenseForm({
          category: result.category,
          description: result.description,
          amount: String(result.amount),
          vendor: result.vendor,
        });
      } else if (result.type === "customer") {
        setCustomerForm({ name: result.name, phone: result.phone, email: result.email });
      }
    },
    onError: (error: Error) =>
      toast.error(readableError(error, "Couldn't understand that. Please try again.")),
  });

  const saleMutation = useMutation({
    mutationFn: async () => {
      const parsed = saleSchema.parse({
        businessId,
        customerId: saleForm!.customerId === NONE ? "" : saleForm!.customerId,
        discount: 0,
        paymentMethod: saleForm!.paymentMethod,
        items: saleForm!.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
        idempotencyKey: crypto.randomUUID(),
      });
      return createSaleFn({ data: parsed });
    },
    onSuccess: async () => {
      toast.success("Sale recorded.");
      close();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
      ]);
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't record that sale.")),
  });

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      const cost = Number(purchaseForm!.unitCost) || 0;
      const supplier = purchaseForm!.supplierName.trim();
      const reasonParts = ["Recorded via Quick Add"];
      if (supplier) reasonParts.push(`from ${supplier}`);
      if (cost > 0) reasonParts.push(`at ${cost}/unit`);
      const parsed = stockAdjustSchema.parse({
        businessId,
        productId: purchaseForm!.productId,
        movementType: "stock_in",
        quantity: purchaseForm!.quantity,
        reason: reasonParts.join(" "),
      });
      return createPurchaseFn({ data: parsed });
    },
    onSuccess: async () => {
      toast.success("Purchase recorded — stock updated.");
      close();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't record that purchase.")),
  });

  const expenseMutation = useMutation({
    mutationFn: async () => {
      const parsed = expenseSchema.parse({
        businessId,
        category: expenseForm!.category,
        description: expenseForm!.description,
        amount: expenseForm!.amount || 0,
        expenseDate: new Date().toISOString().slice(0, 10),
        method: "cash",
        vendor: expenseForm!.vendor,
      });
      return createExpenseFn({ data: parsed });
    },
    onSuccess: async () => {
      toast.success("Expense recorded.");
      close();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["expenses"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't record that expense.")),
  });

  const customerMutation = useMutation({
    mutationFn: async () => {
      const parsed = customerSchema.parse({
        businessId,
        name: customerForm!.name,
        phone: customerForm!.phone,
        email: customerForm!.email,
      });
      return createCustomerFn({ data: parsed });
    },
    onSuccess: async () => {
      toast.success("Customer added.");
      close();
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't add that customer.")),
  });

  const saleItemsValid =
    saleForm != null && saleForm.items.length > 0 && saleForm.items.every((i) => i.productId);
  const purchaseValid =
    purchaseForm != null && Boolean(purchaseForm.productId) && Number(purchaseForm.quantity) > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick add</DialogTitle>
          <DialogDescription>
            Describe what happened — a sale, a purchase, an expense, or a new customer — and confirm
            before it's saved.
          </DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div className="space-y-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Sold 3 shirts to Mary for $90"
              rows={3}
              autoFocus
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setText(example)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {example}
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                className="gap-1.5"
                disabled={!text.trim() || parseMutation.isPending}
                onClick={() => parseMutation.mutate()}
              >
                {parseMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 className="size-4" aria-hidden="true" />
                )}
                Understand
              </Button>
            </DialogFooter>
          </div>
        ) : draft.type === "unknown" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Couldn't quite understand that — try rephrasing, or use the full form for a{" "}
              <Link to="/sales" className="font-medium text-primary underline underline-offset-2">
                sale
              </Link>
              ,{" "}
              <Link
                to="/inventory"
                className="font-medium text-primary underline underline-offset-2"
              >
                purchase
              </Link>
              ,{" "}
              <Link
                to="/expenses"
                className="font-medium text-primary underline underline-offset-2"
              >
                expense
              </Link>
              , or{" "}
              <Link
                to="/customers"
                className="font-medium text-primary underline underline-offset-2"
              >
                customer
              </Link>
              .
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>
                Try again
              </Button>
              <Button onClick={close}>Close</Button>
            </DialogFooter>
          </div>
        ) : draft.type === "sale" && saleForm ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="qe-customer">Customer (optional)</Label>
              <Select
                value={saleForm.customerId || NONE}
                onValueChange={(value) => setSaleForm({ ...saleForm, customerId: value })}
              >
                <SelectTrigger id="qe-customer">
                  <SelectValue placeholder="Walk-in customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Walk-in customer</SelectItem>
                  {(customers.data ?? []).map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <LineItemsEditor
              items={saleForm.items}
              onChange={(items) => setSaleForm({ ...saleForm, items })}
              products={productOptions}
              currency={currency}
            />
            {!saleItemsValid ? (
              <p className="text-[13px] text-warning-foreground">
                Pick a product for every line before confirming.
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="qe-payment">Payment method</Label>
              <Select
                value={saleForm.paymentMethod}
                onValueChange={(value) =>
                  setSaleForm({
                    ...saleForm,
                    paymentMethod: value as typeof saleForm.paymentMethod,
                  })
                }
              >
                <SelectTrigger id="qe-payment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>
                Back
              </Button>
              <Button
                className="gap-1.5"
                disabled={!saleItemsValid || saleMutation.isPending}
                onClick={() => saleMutation.mutate()}
              >
                {saleMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Confirm sale
              </Button>
            </DialogFooter>
          </div>
        ) : draft.type === "purchase" && purchaseForm ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="qe-purchase-product">Product</Label>
              <Select
                value={purchaseForm.productId || NONE}
                onValueChange={(value) =>
                  setPurchaseForm({ ...purchaseForm, productId: value === NONE ? "" : value })
                }
              >
                <SelectTrigger id="qe-purchase-product">
                  <SelectValue placeholder={`Which product is "${purchaseForm.productName}"?`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE} disabled>
                    Pick a product
                  </SelectItem>
                  {productOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!purchaseForm.productId ? (
                <p className="text-[13px] text-warning-foreground">
                  Couldn't match "{purchaseForm.productName}" to a product — pick one, or add it
                  first from{" "}
                  <Link
                    to="/inventory"
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    Inventory
                  </Link>
                  .
                </p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="qe-purchase-qty">Quantity</Label>
                <Input
                  id="qe-purchase-qty"
                  type="number"
                  min={0}
                  step="1"
                  value={purchaseForm.quantity}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qe-purchase-cost">Unit cost ({currency}, optional)</Label>
                <Input
                  id="qe-purchase-cost"
                  type="number"
                  min={0}
                  step="0.01"
                  value={purchaseForm.unitCost}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, unitCost: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qe-purchase-supplier">Supplier (optional)</Label>
              <Input
                id="qe-purchase-supplier"
                maxLength={160}
                value={purchaseForm.supplierName}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, supplierName: e.target.value })}
              />
            </div>
            <p className="text-[13px] text-muted-foreground">
              This adds {purchaseForm.quantity || 0} units to stock for this product.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>
                Back
              </Button>
              <Button
                className="gap-1.5"
                disabled={!purchaseValid || purchaseMutation.isPending}
                onClick={() => purchaseMutation.mutate()}
              >
                {purchaseMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Confirm purchase
              </Button>
            </DialogFooter>
          </div>
        ) : draft.type === "expense" && expenseForm ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="qe-category">Category</Label>
              <Select
                value={expenseForm.category}
                onValueChange={(value) =>
                  setExpenseForm({ ...expenseForm, category: value as typeof expenseForm.category })
                }
              >
                <SelectTrigger id="qe-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qe-amount">Amount ({currency})</Label>
              <Input
                id="qe-amount"
                type="number"
                min={0}
                step="0.01"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qe-vendor">Vendor (optional)</Label>
              <Input
                id="qe-vendor"
                maxLength={160}
                value={expenseForm.vendor}
                onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="qe-desc">Description (optional)</Label>
              <Input
                id="qe-desc"
                maxLength={240}
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              />
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button variant="ghost" onClick={reset}>
                Back
              </Button>
              <Button
                className="gap-1.5"
                disabled={Number(expenseForm.amount) <= 0 || expenseMutation.isPending}
                onClick={() => expenseMutation.mutate()}
              >
                {expenseMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Confirm expense
              </Button>
            </DialogFooter>
          </div>
        ) : draft.type === "customer" && customerForm ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="qe-name">Name</Label>
              <Input
                id="qe-name"
                maxLength={160}
                value={customerForm.name}
                onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qe-phone">Phone (optional)</Label>
              <Input
                id="qe-phone"
                maxLength={40}
                value={customerForm.phone}
                onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qe-email">Email (optional)</Label>
              <Input
                id="qe-email"
                type="email"
                maxLength={200}
                value={customerForm.email}
                onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>
                Back
              </Button>
              <Button
                className="gap-1.5"
                disabled={!customerForm.name.trim() || customerMutation.isPending}
                onClick={() => customerMutation.mutate()}
              >
                {customerMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Confirm customer
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
