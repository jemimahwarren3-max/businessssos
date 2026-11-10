import { productImportRowSchema, type ProductImportRow } from "./business.schemas";
import { parseCsvText, rowsToRecordsSmart, type ImportColumn } from "./spreadsheet";

/** Same header vocabulary as Inventory → Import (SOH, retail price, and so on). */
export const QUICK_ADD_PRODUCT_COLUMNS: ImportColumn[] = [
  { key: "name", label: "Name", required: false, aliases: ["product", "item", "productname", "description", "goods"] },
  { key: "sku", label: "SKU", required: false, aliases: ["code", "productcode", "itemcode"] },
  { key: "barcode", label: "Barcode", required: false, aliases: ["upc", "ean"] },
  {
    key: "costPrice",
    label: "Cost Price",
    required: false,
    aliases: ["cost", "buyprice", "buyingprice", "wholesaleprice"],
  },
  {
    key: "sellingPrice",
    label: "Selling Price",
    required: false,
    aliases: ["price", "sellprice", "retailprice", "retail", "unitprice", "rsp", "selling"],
  },
  {
    key: "stock",
    label: "Stock",
    required: false,
    aliases: ["quantity", "qty", "stockonhand", "soh", "onhand", "qtyonhand", "stockqty", "received"],
  },
  {
    key: "minStock",
    label: "Min Stock",
    required: false,
    aliases: ["reorderlevel", "reorderpoint", "minimumstock", "minqty"],
  },
  { key: "unit", label: "Unit", required: false, aliases: ["uom", "units"] },
  { key: "taxRate", label: "Tax Rate", required: false, aliases: ["tax", "vat", "taxpercent"] },
];

const INVENTORY_INTENT =
  /\b(add inventory|inventory list|stock take|stocktake|update stock|product list|products list|soh|opening stock)\b/i;
const SALE_HEADER_HINT = /\b(customer|client|sold to|buyer|invoice|receipt|amount paid)\b/i;

export function quickAddTextToRows(text: string): string[][] {
  const body = text
    .replace(/^From file [^\n]+:\n?/gim, "")
    .trim()
    .slice(0, 250_000);
  if (!body) return [];

  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  const keyValueLines = lines.filter((line) => line.includes("=") && line.includes(","));
  if (keyValueLines.length >= Math.max(1, Math.floor(lines.length * 0.4))) {
    const keyOrder: string[] = [];
    const keySeen = new Set<string>();
    const recordRows: Record<string, string>[] = [];
    for (const line of keyValueLines) {
      const record: Record<string, string> = {};
      for (const segment of line.split(",")) {
        const eq = segment.indexOf("=");
        if (eq <= 0) continue;
        const key = segment.slice(0, eq).trim();
        const value = segment.slice(eq + 1).trim();
        if (!value) continue;
        record[key] = value;
        if (!keySeen.has(key)) {
          keySeen.add(key);
          keyOrder.push(key);
        }
      }
      if (Object.keys(record).length > 0) recordRows.push(record);
    }
    if (keyOrder.length === 0) return [];
    return [keyOrder, ...recordRows.map((record) => keyOrder.map((key) => record[key] ?? ""))];
  }

  if (body.includes("\t") || (body.includes(",") && lines.length > 1)) {
    const parsed = parseCsvText(body);
    if (parsed.length > 1) return parsed;
  }

  return [];
}

function inferProductName(record: Record<string, string>): string {
  const explicit =
    record["name"]?.trim() ||
    record["sku"]?.trim() ||
    record["barcode"]?.trim() ||
    record["description"]?.trim();
  if (explicit) return explicit;

  for (const value of Object.values(record)) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (/^\d+([.,]\d+)?$/.test(trimmed)) continue;
    if (/^(qty|quantity|stock|soh|price|amount|total|unit|vat)$/i.test(trimmed)) continue;
    return trimmed.slice(0, 160);
  }
  return "";
}

function recordToImportRow(record: Record<string, string>): ProductImportRow | null {
  const name = inferProductName(record);
  if (!name) return null;
  const stockRaw = record["stock"]?.trim() ?? "";
  const hasStock = stockRaw !== "" && Number.isFinite(Number(stockRaw.replace(",", ".")));
  const hasPrice =
    (record["sellingPrice"]?.trim() ?? "") !== "" || (record["costPrice"]?.trim() ?? "") !== "";
  if (!hasStock && !hasPrice && !record["sku"]?.trim()) {
    return null;
  }
  try {
    return productImportRowSchema.parse({
      name,
      sku: record["sku"] ?? "",
      barcode: record["barcode"] ?? "",
      unit: record["unit"]?.trim() || "unit",
      costPrice: record["costPrice"] ?? 0,
      sellingPrice: record["sellingPrice"] ?? 0,
      stock: record["stock"] ?? 0,
      minStock: record["minStock"] ?? 0,
      taxRate: record["taxRate"] ?? 0,
    });
  } catch {
    return null;
  }
}

export type QuickAddProductImportParse = {
  rows: ProductImportRow[];
  columnMapping: { field: string; fromHeader: string }[];
};

/** Stock / product spreadsheets (especially SOH columns) without treating them as sales. */
export function tryParseProductInventoryImport(text: string): QuickAddProductImportParse | null {
  const grid = quickAddTextToRows(text);
  if (grid.length < 2) return null;

  const smart = rowsToRecordsSmart(grid, QUICK_ADD_PRODUCT_COLUMNS);
  if (smart.records.length === 0) return null;

  const rawHeaderText = (grid[0] ?? []).join(" ").toLowerCase();
  const headerText = smart.columnMapping.map((entry) => entry.fromHeader).join(" ").toLowerCase();
  const looksLikeSale = SALE_HEADER_HINT.test(`${rawHeaderText} ${headerText}`);
  const hasCustomerColumn = /\bcustomer\b|\bclient\b/.test(rawHeaderText);
  const hasStockColumn = smart.columnMapping.some((entry) => entry.field === "Stock");
  const hasNameColumn = smart.columnMapping.some((entry) => entry.field === "Name");
  const intent = INVENTORY_INTENT.test(text);

  if (hasCustomerColumn) return null;
  if (looksLikeSale && !hasStockColumn) return null;
  if (!intent && !hasStockColumn && !(hasNameColumn && smart.columnMapping.length >= 2)) {
    return null;
  }

  const rows: ProductImportRow[] = [];
  for (const record of smart.records) {
    const parsed = recordToImportRow(record);
    if (parsed) rows.push(parsed);
  }
  if (rows.length === 0) return null;

  return { rows, columnMapping: smart.columnMapping };
}
