import { readSheet } from "read-excel-file/browser";

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
  return rows;
}

export async function parseSpreadsheetFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    return parseCsvText(text);
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const rows = await readSheet(file);
    return rows.map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
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

/** Maps each defined column to the header index it matched, or -1 if not found. */
export function matchColumns(headers: string[], columns: ImportColumn[]): Record<string, number> {
  const normalized = headers.map(normalizeHeader);
  const result: Record<string, number> = {};
  for (const column of columns) {
    const candidates = [column.key, column.label, ...column.aliases].map(normalizeHeader);
    result[column.key] = normalized.findIndex((h) => candidates.includes(h));
  }
  return result;
}

export function rowsToRecords(
  rows: string[][],
  columns: ImportColumn[],
): { records: Record<string, string>[]; missingRequired: string[] } {
  if (rows.length === 0)
    return { records: [], missingRequired: columns.filter((c) => c.required).map((c) => c.label) };
  const [headerRow, ...dataRows] = rows;
  const columnIndex = matchColumns(headerRow!, columns);
  const missingRequired = columns
    .filter((c) => c.required && columnIndex[c.key] === -1)
    .map((c) => c.label);
  if (missingRequired.length > 0) return { records: [], missingRequired };

  const records = dataRows.map((row) => {
    const record: Record<string, string> = {};
    for (const column of columns) {
      const index = columnIndex[column.key];
      record[column.key] = index != null && index >= 0 ? (row[index] ?? "").trim() : "";
    }
    return record;
  });
  return { records, missingRequired: [] };
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
