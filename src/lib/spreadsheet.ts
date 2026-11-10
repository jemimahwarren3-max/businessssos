const MAX_IMPORT_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
const MAX_IMPORT_COLUMNS = 100;
const MAX_CELL_LENGTH = 5000;
const MAX_TOTAL_CHARACTERS = 250_000;

function sanitizeCellValue(value: unknown): string {
  if (value == null) return "";
  return (
    String(value)
      // eslint-disable-next-line no-control-regex -- stripping control chars is the point
      .replace(/\u0000/g, "")
      // eslint-disable-next-line no-control-regex -- stripping control chars is the point
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/<[^>]*>/g, "")
      .trim()
      .slice(0, MAX_CELL_LENGTH)
  );
}

function validateParsedRows(rows: string[][]): string[][] {
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(
      `This file has too many rows. Please split it into smaller files (max ${MAX_IMPORT_ROWS}).`,
    );
  }

  const rowLengths = rows.map((row) => row.length);
  if (rowLengths.some((length) => length > MAX_IMPORT_COLUMNS)) {
    throw new Error(
      `This file has too many columns. Please keep it under ${MAX_IMPORT_COLUMNS} columns.`,
    );
  }

  const totalCharacters = rows.reduce((sum, row) => sum + row.join("").length, 0);
  if (totalCharacters > MAX_TOTAL_CHARACTERS) {
    throw new Error("This file is too large after parsing. Please split it into smaller files.");
  }

  return rows.map((row) => row.map((cell) => sanitizeCellValue(cell)));
}

/** Handles quoted fields, embedded commas/newlines, and escaped quotes ("" inside a quoted field). */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  }
  return validateParsedRows(rows);
}

export async function parseSpreadsheetFile(file: File): Promise<string[][]> {
  if (file.size === 0) {
    throw new Error("The selected file is empty.");
  }
  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new Error(
      `The selected file is too large. Please keep imports under ${Math.round(MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024))}MB.`,
    );
  }

  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    if (text.includes("\u0000")) {
      throw new Error("The selected file contains unsupported characters.");
    }
    return parseCsvText(text);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const { readSheet } = await import("read-excel-file/browser");
    const rows = await readSheet(file);
    const parsedRows = rows.map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
    return validateParsedRows(parsedRows);
  }
  throw new Error("Please upload a .csv, .xlsx or .xls file.");
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

export type ImportColumn = {
  key: string;
  label: string;
  required: boolean;
  aliases: string[];
};

/** Extra header words common on merchant spreadsheets (Zimbabwe/SA retail). */
const COLUMN_HEADER_SYNONYMS: Record<string, string[]> = {
  name: [
    "item",
    "items",
    "productname",
    "product",
    "description",
    "itemdescription",
    "productdescription",
    "goods",
    "particulars",
    "inventoryitem",
    "stockitem",
    "merchandise",
  ],
  stock: ["soh", "stockonhand", "onhand", "qtyonhand", "balance", "closingstock", "physicalstock"],
  sellingPrice: ["unitprice", "retail", "retailprice", "sell", "selling", "rate", "rsp"],
  costPrice: ["buy", "buying", "cost", "landedcost", "purchaseprice"],
  sku: ["code", "itemcode", "productcode", "plu", "stockcode"],
  barcode: ["ean", "upc", "gtin"],
  saleDate: ["date", "transactiondate", "saledate", "invoicedate", "trandate"],
  total: ["amount", "totalamount", "grandtotal", "revenue", "salesamount", "value"],
  quantity: ["qty", "units", "qnty", "soldqty"],
  unitPrice: ["price", "unitprice", "sellingprice", "rate"],
  product: ["item", "productname", "description", "sku", "stockdescription"],
  customer: ["customername", "client", "buyer", "account", "debtor", "shippedto"],
  amount: ["total", "value", "expenseamount", "paid"],
  category: ["expensecategory", "type", "expensetype"],
  phone: ["mobile", "cell", "telephone", "contact", "phonenumber", "mobilenumber"],
  email: ["emailaddress", "mail"],
};

function headerCandidates(column: ImportColumn): string[] {
  const extras = COLUMN_HEADER_SYNONYMS[column.key] ?? [];
  return [column.key, column.label, ...column.aliases, ...extras].map(normalizeHeader);
}

function scoreHeaderMatch(normalizedHeader: string, column: ImportColumn): number {
  if (!normalizedHeader) return 0;
  let best = 0;
  for (const candidate of headerCandidates(column)) {
    if (!candidate) continue;
    if (normalizedHeader === candidate) best = Math.max(best, 100);
    else if (normalizedHeader.includes(candidate) || candidate.includes(normalizedHeader)) {
      const shorter = Math.min(normalizedHeader.length, candidate.length);
      const longer = Math.max(normalizedHeader.length, candidate.length);
      if (shorter >= 3 && shorter / longer >= 0.5) best = Math.max(best, 78);
    } else if (
      candidate.length >= 4 &&
      (normalizedHeader.startsWith(candidate.slice(0, 4)) ||
        candidate.startsWith(normalizedHeader.slice(0, 4)))
    ) {
      best = Math.max(best, 45);
    }
  }
  return best;
}

/** Maps each defined column to the header index it matched, or -1 if not found. */
export function matchColumns(headers: string[], columns: ImportColumn[]): Record<string, number> {
  const normalized = headers.map(normalizeHeader);
  const result: Record<string, number> = {};
  for (const column of columns) {
    const candidates = headerCandidates(column);
    result[column.key] = normalized.findIndex((h) => h && candidates.includes(h));
  }
  return result;
}

/** Best-effort match when headers use unfamiliar labels (one header per column). */
export function matchColumnsFuzzy(
  headers: string[],
  columns: ImportColumn[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const column of columns) result[column.key] = -1;

  type Scored = { colKey: string; headerIdx: number; score: number };
  const scored: Scored[] = [];
  headers.forEach((header, headerIdx) => {
    const nh = normalizeHeader(header);
    if (!nh) return;
    for (const column of columns) {
      const score = scoreHeaderMatch(nh, column);
      if (score >= 45) scored.push({ colKey: column.key, headerIdx, score });
    }
  });
  scored.sort((a, b) => b.score - a.score);
  const usedHeaders = new Set<number>();
  const usedCols = new Set<string>();
  for (const entry of scored) {
    if (entry.score < 50) continue;
    if (usedHeaders.has(entry.headerIdx) || usedCols.has(entry.colKey)) continue;
    result[entry.colKey] = entry.headerIdx;
    usedHeaders.add(entry.headerIdx);
    usedCols.add(entry.colKey);
  }
  return result;
}

/** Pick the row that looks most like column titles (skips title rows above the table). */
export function detectHeaderRowIndex(rows: string[][], columns: ImportColumn[]): number {
  let bestIdx = 0;
  let bestScore = -1;
  const scan = Math.min(8, rows.length);
  for (let i = 0; i < scan; i++) {
    const row = rows[i];
    if (!row?.some((cell) => cell.trim() !== "")) continue;
    const fuzzy = matchColumnsFuzzy(row, columns);
    const strict = matchColumns(row, columns);
    const merged = { ...fuzzy };
    for (const col of columns) {
      const strictIdx = strict[col.key] ?? -1;
      if (strictIdx >= 0) merged[col.key] = strictIdx;
    }
    const score = columns.reduce((sum, col) => {
      const idx = merged[col.key] ?? -1;
      return sum + (idx >= 0 ? (col.required ? 3 : 1) : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function applyPositionalNameFallback(
  headerRow: string[],
  columnIndex: Record<string, number>,
  columns: ImportColumn[],
): Record<string, number> {
  const needsName = columns.some(
    (c) => c.key === "name" && c.required && (columnIndex["name"] ?? -1) === -1,
  );
  if (!needsName) return columnIndex;
  const filled = headerRow
    .map((cell, index) => ({ index, text: cell.trim() }))
    .filter((entry) => entry.text !== "");
  if (filled.length === 0) return columnIndex;
  const next = { ...columnIndex };
  const nameCol = columns.find((c) => c.key === "name");
  if (!nameCol) return next;
  const textLike = filled.filter(
    (entry) =>
      !/^\d+([.,]\d+)?$/.test(entry.text) &&
      !/^(qty|quantity|stock|soh|price|amount|total)$/i.test(entry.text),
  );
  if (textLike[0]) next["name"] = textLike[0].index;
  const numberLike = filled.filter((entry) => /^\d+([.,]\d+)?$/.test(entry.text));
  if (numberLike[0] && columns.some((c) => c.key === "stock" && (next["stock"] ?? -1) === -1)) {
    next["stock"] = numberLike[0].index;
  }
  return next;
}

export type RowsToRecordsResult = {
  records: Record<string, string>[];
  missingRequired: string[];
  columnMapping: { field: string; fromHeader: string }[];
  headerRowIndex: number;
};

export function rowsToRecords(
  rows: string[][],
  columns: ImportColumn[],
): { records: Record<string, string>[]; missingRequired: string[] } {
  const smart = rowsToRecordsSmart(rows, columns);
  return { records: smart.records, missingRequired: smart.missingRequired };
}

/** Strict match first, then fuzzy headers, header-row detection, and light positional hints. */
export function rowsToRecordsSmart(rows: string[][], columns: ImportColumn[]): RowsToRecordsResult {
  const emptyRequired = columns.filter((c) => c.required).map((c) => c.label);
  if (rows.length === 0) {
    return { records: [], missingRequired: emptyRequired, columnMapping: [], headerRowIndex: 0 };
  }

  const headerRowIndex = detectHeaderRowIndex(rows, columns);
  const headerRow = rows[headerRowIndex] ?? [];
  const dataRows = rows.slice(headerRowIndex + 1).filter((row) => row.some((cell) => cell.trim()));

  let columnIndex = matchColumns(headerRow, columns);
  const strictMissing = columns.filter((c) => c.required && columnIndex[c.key] === -1);
  if (strictMissing.length > 0) {
    const fuzzy = matchColumnsFuzzy(headerRow, columns);
    columnIndex = { ...fuzzy, ...columnIndex };
    for (const col of columns) {
      const fuzzyIdx = fuzzy[col.key] ?? -1;
      if ((columnIndex[col.key] ?? -1) === -1 && fuzzyIdx >= 0) columnIndex[col.key] = fuzzyIdx;
    }
    columnIndex = applyPositionalNameFallback(headerRow, columnIndex, columns);
  }

  const missingRequired = columns
    .filter((c) => c.required && columnIndex[c.key] === -1)
    .map((c) => c.label);

  const columnMapping: { field: string; fromHeader: string }[] = [];
  for (const column of columns) {
    const idx = columnIndex[column.key];
    if (idx == null || idx < 0) continue;
    const fromHeader = (headerRow[idx] ?? "").trim() || `Column ${idx + 1}`;
    columnMapping.push({ field: column.label, fromHeader });
  }

  if (missingRequired.length > 0) {
    return { records: [], missingRequired, columnMapping, headerRowIndex };
  }

  const records = dataRows.map((row) => {
    const record: Record<string, string> = {};
    for (const column of columns) {
      const index = columnIndex[column.key];
      record[column.key] = index != null && index >= 0 ? (row[index] ?? "").trim() : "";
    }
    return record;
  });

  return { records, missingRequired: [], columnMapping, headerRowIndex };
}

export function downloadCsvTemplate(filename: string, columns: ImportColumn[]) {
  const headers = columns.map((c) => c.label);
  const blob = new Blob([headers.join(",") + "\n"], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
