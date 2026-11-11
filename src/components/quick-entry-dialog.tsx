import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileUp, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { hasPermission, useWorkspace } from "@/hooks/use-workspace";
import {
  addCustomer,
  addExpense,
  addProduct,
  addSale,
  getCustomers,
  getProducts,
  extractQuickAddImageTextFn,
  importProductsFn,
  parseQuickEntryFn,
  updateStock,
} from "@/lib/business.functions";
import {
  customerSchema,
  EXPENSE_CATEGORIES,
  expenseSchema,
  importProductsSchema,
  PAYMENT_METHODS,
  productSchema,
  saleSchema,
  stockAdjustSchema,
  type LineItemInput,
} from "@/lib/business.schemas";
import { formatMoney, readableError } from "@/lib/format";
import type {
  QuickEntryDraft,
  QuickEntryPurchaseDraft,
  QuickEntrySaleDraft,
} from "@/lib/quick-entry.server";
import {
  quickEntryPurchaseFailureReason,
  quickEntrySaleFailureReason,
  quickEntrySaleHasProducts,
  quickEntrySaleIsStockOk,
} from "@/lib/quick-entry.server";
import {
  extractQuickAddFileText,
  isQuickAddImageFile,
  quickAddImageMime,
  QUICK_ADD_FILE_HELP,
  readFileAsDataUrl,
} from "@/lib/quick-add-files";
import type { QuickAddIntent } from "@/lib/quick-entry-intent";
import {
  INVENTORY_IMPORT_BEFORE_YOU_IMPORT,
  INVENTORY_IMPORT_COLUMN_GUIDE,
  INVENTORY_IMPORT_NO_UNDO,
} from "@/lib/inventory-import-guide";
import type { ProductImportRow } from "@/lib/business.schemas";

const NONE = "__none";
const EXAMPLES = [
  "Sales 9 November",
  "Sold 3 shirts to Mary for $90",
  "Bought 20 cases of Mazoe from ABC Suppliers at $8 each",
  "Paid $45 for transport",
];

type SaleDraftState = {
  items: LineItemInput[];
  customerId: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: (typeof PAYMENT_METHODS)[number]["value"];
  saleDate: string;
  stockByLine: boolean[];
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
  const canImportProducts = hasPermission(workspace.data, "inventory.import");

  const [text, setText] = useState("");
  const [fileLabel, setFileLabel] = useState("");
  const [fileIntent, setFileIntent] = useState<QuickAddIntent | null>(null);
  const [importApplyStock, setImportApplyStock] = useState(true);
  const [importApplyCost, setImportApplyCost] = useState(false);
  const [importApplySell, setImportApplySell] = useState(false);
  const [draft, setDraft] = useState<QuickEntryDraft | null>(null);
  const [saleForm, setSaleForm] = useState<SaleDraftState | null>(null);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseDraftState | null>(null);
  const [expenseForm, setExpenseForm] = useState<ExpenseDraftState | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerDraftState | null>(null);
  const [saleBatch, setSaleBatch] = useState<QuickEntrySaleDraft[] | null>(null);
  const [purchaseBatch, setPurchaseBatch] = useState<QuickEntryPurchaseDraft[] | null>(null);
  const [batchOutcome, setBatchOutcome] = useState<{
    recorded: number;
    skipped: { label: string; reason: string }[];
    failed: { label: string; reason: string }[];
  } | null>(null);
  const [purchaseBatchOutcome, setPurchaseBatchOutcome] = useState<typeof batchOutcome>(null);

  function saleDraftToForm(sale: QuickEntrySaleDraft): SaleDraftState {
    return {
      items: sale.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
      })),
      customerId: sale.customerId,
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      paymentMethod: sale.paymentMethod,
      saleDate: sale.saleDate,
      stockByLine: sale.items.map((item) => item.stockOk),
    };
  }

  async function resolveCustomerId(sale: QuickEntrySaleDraft): Promise<string> {
    if (sale.customerId) return sale.customerId;
    const name = sale.customerName.trim();
    if (!name) return "";
    const created = await createCustomerFn({
      data: customerSchema.parse({
        businessId,
        name,
        phone: sale.customerPhone,
        email: "",
      }),
    });
    return created.id;
  }

  async function submitSale(sale: QuickEntrySaleDraft, form: SaleDraftState) {
    let customerId = form.customerId === NONE ? "" : form.customerId;
    if (!customerId) customerId = await resolveCustomerId(sale);
    const noteParts = ["Recorded via Quick Add"];
    if (form.saleDate) noteParts.push(form.saleDate);
    if (form.customerName.trim() && !customerId) noteParts.push(`customer: ${form.customerName}`);
    const parsed = saleSchema.parse({
      businessId,
      customerId: customerId || "",
      discount: 0,
      paymentMethod: form.paymentMethod,
      notes: noteParts.join(" · "),
      items: form.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      idempotencyKey: crypto.randomUUID(),
    });
    return createSaleFn({ data: parsed });
  }

  async function resolveProductIdForPurchase(form: PurchaseDraftState): Promise<string> {
    if (form.productId) return form.productId;
    const name = form.productName.trim();
    if (!name) throw new Error("Product name is required");
    const cost = Number(form.unitCost) || 0;
    const created = await createProductFn({
      data: productSchema.parse({
        businessId: businessId!,
        name,
        sku: "",
        barcode: "",
        unit: "unit",
        costPrice: cost,
        sellingPrice: cost > 0 ? cost : 0,
        stock: 0,
        minStock: 0,
        taxRate: 0,
        description: "",
        supplierId: "",
        categoryId: "",
      }),
    });
    return String((created as { id: string }).id);
  }

  async function recordPurchaseStock(form: PurchaseDraftState) {
    const productId = await resolveProductIdForPurchase(form);
    const cost = Number(form.unitCost) || 0;
    const supplier = form.supplierName.trim();
    const reasonParts = ["Recorded via Quick Add"];
    if (supplier) reasonParts.push(`from ${supplier}`);
    if (cost > 0) reasonParts.push(`at ${cost}/unit`);
    const parsed = stockAdjustSchema.parse({
      businessId,
      productId,
      movementType: "stock_in",
      quantity: form.quantity,
      reason: reasonParts.join(" "),
    });
    return createPurchaseFn({ data: parsed });
  }

  const parseFn = useServerFn(parseQuickEntryFn);
  const extractImageFn = useServerFn(extractQuickAddImageTextFn);
  const createSaleFn = useServerFn(addSale);
  const createPurchaseFn = useServerFn(updateStock);
  const createProductFn = useServerFn(addProduct);
  const importProducts = useServerFn(importProductsFn);
  const createExpenseFn = useServerFn(addExpense);
  const createCustomerFn = useServerFn(addCustomer);
  const fetchCustomers = useServerFn(getCustomers);
  const fetchProducts = useServerFn(getProducts);

  const needsProducts =
    draft?.type === "sale" || draft?.type === "purchase" || draft?.type === "purchase_batch";
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
    setFileLabel("");
    setDraft(null);
    setSaleForm(null);
    setPurchaseForm(null);
    setExpenseForm(null);
    setCustomerForm(null);
    setSaleBatch(null);
    setPurchaseBatch(null);
    setBatchOutcome(null);
    setPurchaseBatchOutcome(null);
    setFileIntent(null);
    setImportApplyStock(true);
    setImportApplyCost(false);
    setImportApplySell(false);
  }

  function productRowsForImport(rows: ProductImportRow[]): ProductImportRow[] {
    return rows.map((row) => ({
      ...row,
      stock: importApplyStock ? row.stock : 0,
      costPrice: importApplyCost ? row.costPrice : 0,
      sellingPrice: importApplySell ? row.sellingPrice : 0,
    }));
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  const prepareIntent: QuickAddIntent = fileLabel ? (fileIntent ?? "auto") : "auto";

  const parseMutation = useMutation({
    mutationFn: () => {
      if (fileLabel && fileIntent === null) {
        throw new Error("Choose what you want to add from this file.");
      }
      return parseFn({
        data: { businessId: businessId!, text, intent: prepareIntent },
      });
    },
    onSuccess: (result) => {
      setDraft(result);
      if (result.type === "sale_batch") {
        setSaleBatch(result.sales);
        setPurchaseBatch(null);
        setSaleForm(null);
      } else if (result.type === "purchase_batch") {
        setPurchaseBatch(result.purchases);
        setSaleBatch(null);
        setSaleForm(null);
      } else if (result.type === "product_import") {
        setSaleBatch(null);
        setPurchaseBatch(null);
        setSaleForm(null);
        setPurchaseForm(null);
      } else if (result.type === "sale") {
        setSaleBatch(null);
        setPurchaseBatch(null);
        setSaleForm(saleDraftToForm(result));
      } else {
        setSaleBatch(null);
        setPurchaseBatch(null);
        setSaleForm(null);
      }
      if (result.type === "purchase") {
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
      const form = saleForm!;
      const sale = draft?.type === "sale" ? draft : null;
      if (!sale) throw new Error("No sale draft");
      return submitSale(sale, form);
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
    mutationFn: async () => recordPurchaseStock(purchaseForm!),
    onSuccess: async () => {
      toast.success("Stock updated.");
      close();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't record that purchase.")),
  });

  const purchaseBatchMutation = useMutation({
    mutationFn: async () => {
      if (!purchaseBatch?.length) throw new Error("No stock lines to record");
      const skipped: { label: string; reason: string }[] = [];
      const failed: { label: string; reason: string }[] = [];
      let recorded = 0;
      for (let index = 0; index < purchaseBatch.length; index++) {
        const line = purchaseBatch[index]!;
        const label = line.productName.trim() || `Line ${index + 1}`;
        const preflight = quickEntryPurchaseFailureReason(line);
        if (preflight) {
          skipped.push({ label, reason: preflight });
          continue;
        }
        const form: PurchaseDraftState = {
          productId: line.productId,
          productName: line.productName,
          quantity: String(line.quantity),
          unitCost: line.unitCost ? String(line.unitCost) : "",
          supplierName: line.supplierName,
        };
        try {
          await recordPurchaseStock(form);
          recorded += 1;
        } catch (error) {
          failed.push({
            label,
            reason: readableError(error as Error, "Could not add this stock line."),
          });
        }
      }
      if (recorded === 0 && skipped.length + failed.length === 0) {
        throw new Error("No stock to record.");
      }
      return { recorded, skipped, failed };
    },
    onSuccess: async (outcome) => {
      setPurchaseBatchOutcome(outcome);
      if (outcome.recorded > 0) {
        toast.success(
          outcome.recorded === 1
            ? "1 product restocked."
            : `${outcome.recorded} products restocked from your file.`,
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["products"] }),
          queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        ]);
      }
      const problemCount = outcome.skipped.length + outcome.failed.length;
      if (problemCount > 0) {
        toast.error(
          `${problemCount} line${problemCount === 1 ? "" : "s"} skipped or failed. See the list below.`,
          { duration: 8000 },
        );
      }
      if (outcome.recorded > 0 && problemCount === 0) close();
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't record that stock.")),
  });

  const productImportMutation = useMutation({
    mutationFn: async () => {
      if (draft?.type !== "product_import") throw new Error("No import draft");
      const parsed = importProductsSchema.parse({
        businessId,
        rows: productRowsForImport(draft.rows),
      });
      return importProducts({ data: parsed });
    },
    onSuccess: async (result) => {
      toast.success(
        result.imported === 1
          ? "1 product added to inventory."
          : `${result.imported} products added to inventory.`,
      );
      if (result.skipped > 0) {
        toast.error(
          `${result.skipped} row${result.skipped === 1 ? "" : "s"} skipped.${result.errors.length ? ` ${result.errors[0]}` : ""}`,
          { duration: 8000 },
        );
      }
      close();
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't import those products.")),
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

  const saleBatchMutation = useMutation({
    mutationFn: async () => {
      if (!saleBatch?.length) throw new Error("No sales to record");
      const skipped: { label: string; reason: string }[] = [];
      const failed: { label: string; reason: string }[] = [];
      let recorded = 0;
      for (let index = 0; index < saleBatch.length; index++) {
        const sale = saleBatch[index]!;
        const label =
          sale.customerName.trim() ||
          (sale.saleDate ? `Sale ${sale.saleDate}` : `Sale ${index + 1}`);
        const preflight = quickEntrySaleFailureReason(sale);
        if (preflight) {
          skipped.push({ label, reason: preflight });
          continue;
        }
        try {
          await submitSale(sale, saleDraftToForm(sale));
          recorded += 1;
        } catch (error) {
          failed.push({
            label,
            reason: readableError(error as Error, "Could not save this sale."),
          });
        }
      }
      if (recorded === 0 && skipped.length + failed.length === 0) {
        throw new Error("No sales to record.");
      }
      return { recorded, skipped, failed };
    },
    onSuccess: async (outcome) => {
      setBatchOutcome(outcome);
      if (outcome.recorded > 0) {
        toast.success(
          outcome.recorded === 1
            ? "1 sale recorded."
            : `${outcome.recorded} sales recorded from your file.`,
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["products"] }),
          queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
          queryClient.invalidateQueries({ queryKey: ["customers"] }),
        ]);
      }
      const problemCount = outcome.skipped.length + outcome.failed.length;
      if (problemCount > 0) {
        toast.error(
          `${problemCount} sale${problemCount === 1 ? "" : "s"} skipped or failed. See the list below for reasons.`,
          { duration: 8000 },
        );
      }
      if (outcome.recorded > 0 && problemCount === 0) close();
    },
    onError: (error: Error) => toast.error(readableError(error, "Couldn't record those sales.")),
  });

  const saleItemsValid =
    saleForm != null && saleForm.items.length > 0 && saleForm.items.every((i) => i.productId);
  const saleStockValid =
    saleForm != null &&
    (draft?.type === "sale" ? quickEntrySaleIsStockOk(draft) : saleForm.stockByLine.every(Boolean));
  const saleBatchReadyCount =
    saleBatch?.filter((s) => quickEntrySaleFailureReason(s) === null).length ?? 0;
  const purchaseBatchReadyCount =
    purchaseBatch?.filter((line) => quickEntryPurchaseFailureReason(line) === null).length ?? 0;
  const purchaseValid =
    purchaseForm != null &&
    purchaseForm.productName.trim().length > 0 &&
    Number(purchaseForm.quantity) > 0;

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
            Describe sales, stock received, or expenses in plain language or attach a file. Kwetuu
            guesses products from what you mean, creates new ones when needed, and matches your
            catalogue when it can.
          </DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div className="space-y-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add inventory — or sales, stock received, expenses"
              rows={3}
              autoFocus
            />
            <input
              id="quick-add-file"
              type="file"
              accept=".csv,.xlsx,.xls,.txt,.docx,.pdf,image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void (async () => {
                  try {
                    let next = "";
                    if (isQuickAddImageFile(file)) {
                      if (!businessId) return;
                      const dataUrl = await readFileAsDataUrl(file);
                      next = await extractImageFn({
                        data: {
                          businessId,
                          base64: dataUrl,
                          mimeType: quickAddImageMime(file),
                        },
                      });
                    } else {
                      next = await extractQuickAddFileText(file);
                    }
                    if (!next.trim()) {
                      toast.error("That file did not contain any rows we could read.");
                      return;
                    }
                    setText((prev) =>
                      prev.trim()
                        ? `${prev.trim()}\n\nFrom file ${file.name}:\n${next}`
                        : `From file ${file.name}:\n${next}`,
                    );
                    setFileLabel(file.name);
                    setFileIntent(null);
                    toast.success("File added. Say what it is for, then tap Prepare.");
                  } catch (error) {
                    toast.error(readableError(error as Error, "Could not read that file."));
                  } finally {
                    event.target.value = "";
                  }
                })();
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
                <label htmlFor="quick-add-file" className="cursor-pointer">
                  <FileUp className="size-4" aria-hidden="true" />
                  Attach file
                </label>
              </Button>
              {fileLabel ? (
                <span className="text-xs text-muted-foreground">Using {fileLabel}</span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{QUICK_ADD_FILE_HELP}</p>
            {fileLabel ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-sm font-medium text-foreground">
                  What do you want to add from this file?
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["inventory", "Inventory list"],
                      ["sales", "Sales"],
                      ["stock_in", "Stock received"],
                      ["expense", "Expenses"],
                      ["customer", "Customers"],
                      ["auto", "Not sure"],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={fileIntent === value ? "default" : "outline"}
                      onClick={() => setFileIntent(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {fileIntent === null ? (
                  <p className="text-[13px] text-muted-foreground">
                    Pick one so Kwetuu does not treat totals, credits, or allergy lines as products.
                  </p>
                ) : null}
                {fileIntent === "inventory" ? (
                  <div className="mt-2 space-y-2 border-t border-border pt-2 text-[13px] text-muted-foreground">
                    <p className="font-medium text-foreground">Label your spreadsheet like this</p>
                    <ul className="list-inside list-disc space-y-0.5">
                      {INVENTORY_IMPORT_COLUMN_GUIDE.map((entry) => (
                        <li key={entry.label}>
                          <span className="text-foreground">{entry.label}:</span> {entry.headers}
                        </li>
                      ))}
                    </ul>
                    <ul className="list-inside list-disc space-y-0.5">
                      {INVENTORY_IMPORT_BEFORE_YOU_IMPORT.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
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
                disabled={
                  !text.trim() ||
                  parseMutation.isPending ||
                  (Boolean(fileLabel) && fileIntent === null)
                }
                onClick={() => parseMutation.mutate()}
              >
                {parseMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 className="size-4" aria-hidden="true" />
                )}
                Prepare
              </Button>
            </DialogFooter>
          </div>
        ) : draft.type === "sale_batch" && saleBatch ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Found {saleBatch.length} sale{saleBatch.length === 1 ? "" : "s"} in your file.
              {saleBatchReadyCount > 0
                ? ` ${saleBatchReadyCount} can be recorded now. The rest will be skipped with a reason.`
                : " None are ready to record yet, fix the reasons below or edit your file."}
            </p>
            <ul className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border p-3 text-sm">
              {saleBatch.map((sale, index) => {
                const reason = quickEntrySaleFailureReason(sale);
                const label = sale.customerName.trim() || "Walk-in";
                const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
                return (
                  <li key={`${label}-${index}`}>
                    <span className={reason ? "text-destructive" : "text-foreground"}>
                      <span className="font-medium">{label}</span>
                      {sale.saleDate ? ` · ${sale.saleDate}` : ""}: {itemCount} item
                      {itemCount === 1 ? "" : "s"}
                    </span>
                    {reason ? (
                      <span className="mt-0.5 block text-[13px] text-destructive">{reason}</span>
                    ) : (
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">
                        Ready to record
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {batchOutcome ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <p>
                  Recorded <span className="font-medium">{batchOutcome.recorded}</span> sale
                  {batchOutcome.recorded === 1 ? "" : "s"}.
                </p>
                {[...batchOutcome.skipped, ...batchOutcome.failed].length > 0 ? (
                  <ul className="space-y-1 text-[13px] text-destructive">
                    {[...batchOutcome.skipped, ...batchOutcome.failed].map((row) => (
                      <li key={`${row.label}-${row.reason}`}>
                        <span className="font-medium">{row.label}:</span> {row.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>
                Back
              </Button>
              {batchOutcome?.recorded ? (
                <Button onClick={close}>Done</Button>
              ) : (
                <Button
                  disabled={saleBatchReadyCount === 0 || saleBatchMutation.isPending}
                  onClick={() => saleBatchMutation.mutate()}
                >
                  {saleBatchMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Record {saleBatchReadyCount} ready sale
                  {saleBatchReadyCount === 1 ? "" : "s"}
                </Button>
              )}
            </DialogFooter>
          </div>
        ) : draft.type === "product_import" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <strong>
                {draft.rows.length} product{draft.rows.length === 1 ? "" : "s"}
              </strong>{" "}
              ready for inventory. Review the list before you import.
            </p>
            {draft.skippedJunk.length > 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Left out {draft.skippedJunk.length} non-product row
                {draft.skippedJunk.length === 1 ? "" : "s"} (totals, credits, allergies, and
                similar): {draft.skippedJunk.slice(0, 5).join(", ")}
                {draft.skippedJunk.length > 5 ? "…" : ""}
              </p>
            ) : null}
            {draft.columnMapping.length > 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Columns: {draft.columnMapping.map((m) => `${m.fromHeader} → ${m.field}`).join(", ")}
              </p>
            ) : null}
            <p className="text-[13px] text-muted-foreground">{INVENTORY_IMPORT_NO_UNDO}</p>
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">What should we take from the file?</p>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={importApplyStock}
                  onCheckedChange={(value) => setImportApplyStock(value === true)}
                />
                Stock / SOH (opening quantity)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={importApplyCost}
                  onCheckedChange={(value) => setImportApplyCost(value === true)}
                />
                Cost price (what you paid)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={importApplySell}
                  onCheckedChange={(value) => setImportApplySell(value === true)}
                />
                Retail / selling price
              </label>
              {!importApplyStock && !importApplyCost && !importApplySell ? (
                <p className="text-[13px] text-destructive">
                  Turn on at least one field to import.
                </p>
              ) : null}
            </div>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-3 text-sm">
              {productRowsForImport(draft.rows)
                .slice(0, 12)
                .map((row) => (
                  <li key={`${row.name}-${row.sku}`}>
                    <span className="font-medium">{row.name}</span>
                    {importApplyStock && row.stock > 0 ? (
                      <span className="text-muted-foreground"> · stock {row.stock}</span>
                    ) : null}
                    {importApplyCost && row.costPrice > 0 ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · cost {formatMoney(row.costPrice, currency)}
                      </span>
                    ) : null}
                    {importApplySell && row.sellingPrice > 0 ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · sell {formatMoney(row.sellingPrice, currency)}
                      </span>
                    ) : null}
                  </li>
                ))}
              {draft.rows.length > 12 ? (
                <li className="text-muted-foreground">…and {draft.rows.length - 12} more</li>
              ) : null}
            </ul>
            {!canImportProducts ? (
              <p className="text-[13px] text-destructive">
                Your role cannot import products. Ask an owner or admin, or use Inventory → Import.
              </p>
            ) : null}
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>
                Back
              </Button>
              <Button
                disabled={
                  !canImportProducts ||
                  productImportMutation.isPending ||
                  (!importApplyStock && !importApplyCost && !importApplySell)
                }
                onClick={() => productImportMutation.mutate()}
              >
                {productImportMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Add {draft.rows.length} to inventory
              </Button>
            </DialogFooter>
          </div>
        ) : draft.type === "purchase_batch" && purchaseBatch ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Found {purchaseBatch.length} stock line{purchaseBatch.length === 1 ? "" : "s"}.
              {purchaseBatchReadyCount > 0
                ? ` ${purchaseBatchReadyCount} can be added now. Unmatched names create new products.`
                : " Fix the reasons below or edit your file."}
            </p>
            <ul className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border p-3 text-sm">
              {purchaseBatch.map((line, index) => {
                const reason = quickEntryPurchaseFailureReason(line);
                const matchNote = line.productId ? "Matched in inventory" : "Will create if needed";
                return (
                  <li key={`${line.productName}-${index}`}>
                    <span className={reason ? "text-destructive" : "text-foreground"}>
                      <span className="font-medium">{line.productName || `Line ${index + 1}`}</span>
                      {": "}
                      {line.quantity} unit{line.quantity === 1 ? "" : "s"}
                    </span>
                    {reason ? (
                      <span className="mt-0.5 block text-[13px] text-destructive">{reason}</span>
                    ) : (
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">
                        {matchNote}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {purchaseBatchOutcome ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <p>
                  Updated stock for{" "}
                  <span className="font-medium">{purchaseBatchOutcome.recorded}</span> product
                  {purchaseBatchOutcome.recorded === 1 ? "" : "s"}.
                </p>
                {[...purchaseBatchOutcome.skipped, ...purchaseBatchOutcome.failed].length > 0 ? (
                  <ul className="space-y-1 text-[13px] text-destructive">
                    {[...purchaseBatchOutcome.skipped, ...purchaseBatchOutcome.failed].map(
                      (row) => (
                        <li key={`${row.label}-${row.reason}`}>
                          <span className="font-medium">{row.label}:</span> {row.reason}
                        </li>
                      ),
                    )}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>
                Back
              </Button>
              {purchaseBatchOutcome?.recorded ? (
                <Button onClick={close}>Done</Button>
              ) : (
                <Button
                  disabled={purchaseBatchReadyCount === 0 || purchaseBatchMutation.isPending}
                  onClick={() => purchaseBatchMutation.mutate()}
                >
                  {purchaseBatchMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Add stock for {purchaseBatchReadyCount} line
                  {purchaseBatchReadyCount === 1 ? "" : "s"}
                </Button>
              )}
            </DialogFooter>
          </div>
        ) : draft.type === "unknown" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Couldn't quite understand that, try rephrasing, or use the full form for a{" "}
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
            {saleForm.customerName && !saleForm.customerId ? (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
                Customer{" "}
                <span className="font-medium text-foreground">{saleForm.customerName}</span>
                {saleForm.customerPhone ? ` (${saleForm.customerPhone})` : ""} is not in your list
                yet. Kwetuu will add them when you record this sale.
              </p>
            ) : null}
            {saleForm.saleDate ? (
              <p className="text-xs text-muted-foreground">
                Sale date from your note: {saleForm.saleDate}
              </p>
            ) : null}
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
              onChange={(items) => {
                const stockByLine = items.map((item) => {
                  const product = (products.data ?? []).find((p) => p.id === item.productId);
                  const stock = product ? Number(product.stock) : 0;
                  return (
                    Boolean(item.productId) &&
                    Number(item.quantity) > 0 &&
                    Number(item.quantity) <= stock
                  );
                });
                setSaleForm({ ...saleForm, items, stockByLine });
              }}
              products={productOptions}
              currency={currency}
            />
            {!saleItemsValid ? (
              <p className="text-[13px] text-warning-foreground">
                Pick a product for every line before confirming.
              </p>
            ) : null}
            {!saleStockValid ? (
              <p className="text-[13px] text-destructive">
                Not enough stock for one or more lines. Reduce quantities or receive stock first.
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
                disabled={!saleItemsValid || !saleStockValid || saleMutation.isPending}
                onClick={() => saleMutation.mutate()}
              >
                {saleMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Record sale
              </Button>
            </DialogFooter>
          </div>
        ) : draft.type === "purchase" && purchaseForm ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="qe-purchase-name">What you received</Label>
              <Input
                id="qe-purchase-name"
                maxLength={160}
                value={purchaseForm.productName}
                onChange={(e) =>
                  setPurchaseForm({
                    ...purchaseForm,
                    productName: e.target.value,
                    productId:
                      productOptions.find((p) => p.name === e.target.value)?.id ??
                      purchaseForm.productId,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qe-purchase-product">Match to inventory (optional)</Label>
              <Select
                value={purchaseForm.productId || NONE}
                onValueChange={(value) => {
                  if (value === NONE) {
                    setPurchaseForm({ ...purchaseForm, productId: "" });
                    return;
                  }
                  const picked = productOptions.find((p) => p.id === value);
                  setPurchaseForm({
                    ...purchaseForm,
                    productId: value,
                    productName: picked?.name ?? purchaseForm.productName,
                  });
                }}
              >
                <SelectTrigger id="qe-purchase-product">
                  <SelectValue placeholder="Use catalogue match or create new" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Create new product with this name</SelectItem>
                  {productOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!purchaseForm.productId ? (
                <p className="text-[13px] text-muted-foreground">
                  No close match found. Confirming creates &quot;{purchaseForm.productName}&quot; in
                  inventory and adds the quantity.
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
                Add to inventory
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
                type="tel"
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
