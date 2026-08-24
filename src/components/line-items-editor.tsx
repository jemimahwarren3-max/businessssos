import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LineItemInput } from "@/lib/business.schemas";
import { formatMoney } from "@/lib/format";

export type ProductOption = {
  id: string;
  name: string;
  price: number;
  tax_rate: number;
};

const CUSTOM = "__custom";

export function LineItemsEditor({
  items,
  onChange,
  products,
  currency,
}: {
  items: LineItemInput[];
  onChange: (items: LineItemInput[]) => void;
  products: ProductOption[];
  currency: string;
}) {
  function updateItem(index: number, patch: Partial<LineItemInput>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function pickProduct(index: number, value: string) {
    if (value === CUSTOM) {
      updateItem(index, { productId: "" });
      return;
    }
    const product = products.find((p) => p.id === value);
    if (!product) return;
    updateItem(index, {
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      taxRate: product.tax_rate,
    });
  }

  return (
    <div className="space-y-2.5">
      {items.map((item, index) => {
        const lineTotal =
          (Number(item.quantity) || 0) *
          (Number(item.unitPrice) || 0) *
          (1 + (Number(item.taxRate) || 0) / 100);
        return (
          <div
            key={index}
            className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1.6fr_0.7fr_0.9fr_0.6fr_auto] sm:items-end"
          >
            <div className="col-span-2 space-y-1.5 sm:col-span-1">
              <Select
                value={item.productId || CUSTOM}
                onValueChange={(value) => pickProduct(index, value)}
              >
                <SelectTrigger aria-label="Choose a product">
                  <SelectValue placeholder="Custom item" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CUSTOM}>Custom item</SelectItem>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={item.name}
                placeholder="Item name"
                maxLength={160}
                onChange={(e) => updateItem(index, { name: e.target.value })}
                aria-label="Item name"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Qty</span>
              <Input
                type="number"
                min={0}
                step="any"
                value={item.quantity}
                onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                aria-label="Quantity"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Price</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={item.unitPrice}
                onChange={(e) => updateItem(index, { unitPrice: Number(e.target.value) })}
                aria-label="Unit price"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Tax %</span>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={item.taxRate}
                onChange={(e) => updateItem(index, { taxRate: Number(e.target.value) })}
                aria-label="Tax rate percent"
              />
            </div>
            <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end sm:gap-1">
              <span className="text-sm font-medium tabular-nums">
                {formatMoney(lineTotal, currency)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                disabled={items.length <= 1}
                aria-label="Remove item"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() =>
          onChange([...items, { productId: "", name: "", quantity: 1, unitPrice: 0, taxRate: 0 }])
        }
      >
        <Plus className="size-4" aria-hidden="true" /> Add item
      </Button>
    </div>
  );
}
