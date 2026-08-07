import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  downloadCsvTemplate,
  parseSpreadsheetFile,
  rowsToRecords,
  type ImportColumn,
} from "@/lib/spreadsheet";
import { readableError } from "@/lib/format";

type ParsedRow<T> =
  | { rowNumber: number; ok: true; value: T; summary: string }
  | { rowNumber: number; ok: false; error: string };

export function ImportDialog<T>({
  open,
  onOpenChange,
  title,
  description,
  columns,
  templateFilename,
  parseRow,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  columns: ImportColumn[];
  templateFilename: string;
  parseRow: (record: Record<string, string>, rowNumber: number) => ParsedRow<T>;
  onImport: (rows: T[]) => Promise<{ imported: number; skipped: number; errors: string[] }>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow<T>[]>([]);
  const [headerError, setHeaderError] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  function reset() {
    setFileName("");
    setRows([]);
    setHeaderError("");
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    try {
      const parsed = await parseSpreadsheetFile(file);
      const { records, missingRequired } = rowsToRecords(parsed, columns);
      if (missingRequired.length > 0) {
        setHeaderError(
          `Missing required column${missingRequired.length > 1 ? "s" : ""}: ${missingRequired.join(", ")}`,
        );
        setRows([]);
        return;
      }
      setHeaderError("");
      setRows(records.map((record, index) => parseRow(record, index + 2)));
    } catch (error) {
      setHeaderError(readableError(error as Error, "We couldn't read that file."));
      setRows([]);
    }
  }

  const validRows = rows.filter((r): r is Extract<ParsedRow<T>, { ok: true }> => r.ok);
  const invalidRows = rows.filter((r): r is Extract<ParsedRow<T>, { ok: false }> => !r.ok);

  async function handleImport() {
    setImporting(true);
    try {
      const outcome = await onImport(validRows.map((r) => r.value));
      setResult(outcome);
      if (outcome.imported > 0)
        toast.success(`Imported ${outcome.imported} row${outcome.imported === 1 ? "" : "s"}.`);
    } catch (error) {
      toast.error(readableError(error as Error, "The import failed. Please try again."));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="surface flex items-start gap-3 p-4">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-medium">
                  Imported {result.imported} row{result.imported === 1 ? "" : "s"}
                  {result.skipped > 0 ? `, skipped ${result.skipped}` : ""}.
                </p>
                {result.errors.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5 text-[13px] text-muted-foreground">
                    {result.errors.slice(0, 10).map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                    {result.errors.length > 10 ? (
                      <li>…and {result.errors.length - 10} more.</li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => downloadCsvTemplate(templateFilename, columns)}
            >
              <Download className="size-3.5" aria-hidden="true" /> Download CSV template
            </Button>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="surface flex w-full items-center gap-3 border-dashed p-5 text-left hover:bg-muted/40"
              >
                <Upload className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{fileName || "Choose a .csv or .xlsx file"}</p>
                  <p className="text-[13px] text-muted-foreground">
                    Columns: {columns.map((c) => c.label).join(", ")}
                  </p>
                </div>
              </button>
            </div>

            {headerError ? (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {headerError}
              </p>
            ) : null}

            {rows.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[13px] text-muted-foreground">
                  {validRows.length} row{validRows.length === 1 ? "" : "s"} ready to import
                  {invalidRows.length > 0 ? `, ${invalidRows.length} will be skipped` : ""}.
                </p>
                <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {rows.slice(0, 100).map((row) => (
                    <li
                      key={row.rowNumber}
                      className="flex items-start gap-2 px-3 py-2 text-[13px]"
                    >
                      <span className="w-12 shrink-0 text-muted-foreground">
                        Row {row.rowNumber}
                      </span>
                      {row.ok ? (
                        <span className="min-w-0 truncate">{row.summary}</span>
                      ) : (
                        <span className="min-w-0 truncate text-destructive">{row.error}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {rows.length > 100 ? (
                  <p className="text-[13px] text-muted-foreground">
                    Showing the first 100 of {rows.length} rows.
                  </p>
                ) : null}
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
                className="gap-1.5"
              >
                {importing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Import {validRows.length > 0 ? validRows.length : ""} row
                {validRows.length === 1 ? "" : "s"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
