function toCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function titleCase(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Rendered `hidden print:block` the same way DocumentPrintView is for
 * invoices/quotes (see .print-area in src/styles.css) — window.print() then
 * produces a PDF via the browser's own "Save as PDF" destination, no PDF
 * library needed. One table per non-empty array in the export payload,
 * headers derived from whatever fields that row shape actually has —
 * mirrors downloadExcel's sheet-per-array approach in settings.data.tsx,
 * just rendered as HTML instead of xlsx sheets. */
export function DataExportPrintView({
  businessName,
  exportedAt,
  data,
}: {
  businessName: string;
  exportedAt: string;
  data: Record<string, unknown>;
}) {
  const sections = Object.entries(data)
    .filter(([key]) => key !== "business" && key !== "exportedAt")
    .map(([key, value]) => [key, value] as const)
    .filter(
      (entry): entry is [string, Record<string, unknown>[]] =>
        Array.isArray(entry[1]) && entry[1].length > 0,
    );

  return (
    <div className="bg-white text-black">
      <div className="border-b border-black/20 pb-4">
        <h1 className="text-lg font-bold">{businessName}</h1>
        <p className="text-sm text-black/60">
          Data export, {new Date(exportedAt).toLocaleDateString()}
        </p>
      </div>

      {sections.map(([key, rows]) => {
        const headers = Object.keys(rows[0]!);
        return (
          <div key={key} className="mt-6 break-inside-avoid-page">
            <h2 className="text-sm font-bold uppercase tracking-wide">{titleCase(key)}</h2>
            <table className="mt-2 w-full border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-black/40 text-left">
                  {headers.map((h) => (
                    <th key={h} className="py-1 pr-2">
                      {titleCase(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-black/10">
                    {headers.map((h) => (
                      <td key={h} className="py-1 pr-2">
                        {toCell(row[h])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {sections.length === 0 ? (
        <p className="mt-6 text-sm text-black/60">There's no data yet to export.</p>
      ) : null}
    </div>
  );
}
