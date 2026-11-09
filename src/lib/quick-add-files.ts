import { parseCsvText, parseSpreadsheetFile } from "@/lib/spreadsheet";

const MAX_QUICK_ADD_CHARS = 12_000;

function rowsToPlainText(rows: string[][]): string {
  return rows
    .slice(0, 80)
    .map((row) => row.join("\t"))
    .join("\n")
    .slice(0, MAX_QUICK_ADD_CHARS);
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value.trim().slice(0, MAX_QUICK_ADD_CHARS);
}

/** Turn an uploaded note or spreadsheet into text the Quick Add AI can read. */
export async function extractQuickAddFileText(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".txt")) {
    return (await file.text()).trim().slice(0, MAX_QUICK_ADD_CHARS);
  }
  if (lower.endsWith(".docx")) {
    const text = await extractDocxText(file);
    if (!text) throw new Error("That Word file did not contain any text we could read.");
    return text;
  }
  if (lower.endsWith(".csv") || lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const rows = await parseSpreadsheetFile(file);
    const plain = rowsToPlainText(rows);
    if (!plain.trim()) throw new Error("That file did not contain any rows we could read.");
    return plain;
  }
  if (lower.endsWith(".doc")) {
    throw new Error("Save older .doc files as .docx or export to Excel/CSV, then attach again.");
  }
  throw new Error(
    "Attach CSV, Excel (.xlsx), plain text, or Word (.docx). For photos or PDF, type a short note instead.",
  );
}

/** Optional: paste from clipboard with loose CSV detection. */
export function normalizeQuickAddPaste(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.includes("\t") && trimmed.includes(",") && trimmed.includes("\n")) {
    const rows = parseCsvText(trimmed);
    if (rows.length > 1) return rowsToPlainText(rows);
  }
  return trimmed.slice(0, MAX_QUICK_ADD_CHARS);
}
