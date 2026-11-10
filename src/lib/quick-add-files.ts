import { parseCsvText, parseSpreadsheetFile } from "@/lib/spreadsheet";

const MAX_QUICK_ADD_CHARS = 12_000;
const MAX_PDF_PAGES = 20;

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

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const chunks: string[] = [];
  const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
      .join(" ")
      .trim();
    if (line) chunks.push(line);
  }

  const text = chunks.join("\n").trim();
  if (!text) {
    throw new Error(
      "That PDF has no selectable text. It may be a scan. Use a clear photo instead, or export to Excel.",
    );
  }
  return text.slice(0, MAX_QUICK_ADD_CHARS);
}

export function isQuickAddImageFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  if (/\.(png|jpe?g|webp|heic)$/.test(lower)) return true;
  return file.type.startsWith("image/");
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

export function quickAddImageMime(file: File): "image/jpeg" | "image/png" | "image/webp" {
  const type = file.type.toLowerCase();
  if (type === "image/png") return "image/png";
  if (type === "image/webp") return "image/webp";
  return "image/jpeg";
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
  if (lower.endsWith(".pdf")) {
    return extractPdfText(file);
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
  if (isQuickAddImageFile(file)) {
    throw new Error("IMAGE_NEEDS_SERVER");
  }
  throw new Error("Use CSV, Excel (.xlsx), Word (.docx), PDF with text, or a photo (JPEG/PNG).");
}

export const QUICK_ADD_FILE_HELP =
  "Excel, CSV, Word, PDF (text), or a photo of a list. Photos are read on the server when Gemini is configured.";

/** Optional: paste from clipboard with loose CSV detection. */
export function normalizeQuickAddPaste(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.includes("\t") && trimmed.includes(",") && trimmed.includes("\n")) {
    const rows = parseCsvText(trimmed);
    if (rows.length > 1) return rowsToPlainText(rows);
  }
  return trimmed.slice(0, MAX_QUICK_ADD_CHARS);
}
