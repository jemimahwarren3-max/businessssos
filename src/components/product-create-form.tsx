import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { productCreateFieldsSchema } from "@/lib/business.schemas";

const NO_SUPPLIER = "none";

export type ProductCreateFields = z.input<typeof productCreateFieldsSchema>;

type SupplierOption = { id: string; name: string };

type ProductCreateFormProps = {
  currency: string;
  suppliers: SupplierOption[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: ProductCreateFields, photo: File | null) => void;
};

export function ProductCreateForm({
  currency,
  suppliers,
  pending,
  onCancel,
  onSubmit,
}: ProductCreateFormProps) {
  const [photo, setPhoto] = useState<File | null>(null);
  const form = useForm<ProductCreateFields>({
    resolver: zodResolver(productCreateFieldsSchema),
    defaultValues: {
      name: "",
      sku: "",
      barcode: "",
      unit: "unit",
      costPrice: 0,
      sellingPrice: 0,
      stock: 0,
      minStock: 0,
      taxRate: 0,
      description: "",
      supplierId: "",
    },
  });

  return (
    <Form {...form}>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={form.handleSubmit((values) => onSubmit(values, photo))}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Product name</FormLabel>
              <FormControl>
                <Input id="p-name" maxLength={160} placeholder="2kg White Sugar" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="sku"
          render={({ field }) => (
            <FormItem>
              <FormLabel>SKU / code (optional)</FormLabel>
              <FormControl>
                <Input id="p-sku" maxLength={60} {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="unit"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Unit</FormLabel>
              <FormControl>
                <Input id="p-unit" maxLength={24} placeholder="unit, kg, box" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="costPrice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cost price ({currency})</FormLabel>
              <FormControl>
                <Input
                  id="p-cost"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={field.value === undefined ? "" : String(field.value)}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="sellingPrice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Selling price ({currency})</FormLabel>
              <FormControl>
                <Input
                  id="p-price"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={field.value === undefined ? "" : String(field.value)}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="stock"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Stock on hand</FormLabel>
              <FormControl>
                <Input
                  id="p-stock"
                  inputMode="decimal"
                  placeholder="0"
                  value={field.value === undefined ? "" : String(field.value)}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="minStock"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Alert me below</FormLabel>
              <FormControl>
                <Input
                  id="p-min"
                  inputMode="decimal"
                  value={field.value === undefined ? "" : String(field.value)}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="supplierId"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Supplier (optional)</FormLabel>
              <Select
                value={field.value ? field.value : NO_SUPPLIER}
                onValueChange={(value) => field.onChange(value === NO_SUPPLIER ? "" : value)}
              >
                <FormControl>
                  <SelectTrigger id="p-supplier">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NO_SUPPLIER}>No supplier</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl>
                <Textarea
                  id="p-desc"
                  rows={2}
                  maxLength={600}
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="space-y-1.5 sm:col-span-2">
          <FormLabel htmlFor="p-photo">Photo (optional)</FormLabel>
          <Input
            id="p-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
          />
          <p className="text-[13px] text-muted-foreground">
            JPEG, PNG, or WebP, up to 12 MB. Photos are resized on this device before upload.
          </p>
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} className="gap-1.5">
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Save product
          </Button>
        </div>
      </form>
    </Form>
  );
}
