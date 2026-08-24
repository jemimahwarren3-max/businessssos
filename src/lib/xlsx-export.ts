import writeXlsxFile from "write-excel-file/browser";

export type XlsxSheet = {
  name: string;
  headers: string[];
  rows: (string | number)[][];
};

/** Real .xlsx download, entirely client-side — every caller already has the
 * rows loaded for whatever table it's rendering, so there's no extra
 * server round trip. Uses write-excel-file (same author/family as
 * read-excel-file, already used for spreadsheet imports) rather than the
 * more common `xlsx`/SheetJS package: SheetJS has two disclosed
 * high-severity advisories with no available fix on the npm registry
 * (prototype pollution, ReDoS), both in its file-parsing path — this
 * library never parses anything, only writes, and has none. */
export async function downloadXlsx(filename: string, sheets: XlsxSheet[]) {
  await writeXlsxFile(
    sheets.map((sheet) => ({
      sheet: sheet.name,
      data: [sheet.headers, ...sheet.rows],
    })),
  ).toFile(filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
