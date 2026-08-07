// Cells starting with these characters can be interpreted as formulas by
// Excel/Sheets when the CSV is opened — prefixing with a quote forces them
// to render as literal text instead of executing. Only applies to strings;
// legitimate numeric exports (revenue, quantities, negative amounts) are
// never at risk since a JS `number` can't carry a formula.
const FORMULA_TRIGGER_CHARS = new Set(["=", "+", "-", "@", "\t", "\r"]);

function escapeCsvCell(value: string | number) {
  if (typeof value === "number") return String(value);
  const text =
    value.length > 0 && FORMULA_TRIGGER_CHARS.has(value[0] as string) ? `'${value}` : value;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
