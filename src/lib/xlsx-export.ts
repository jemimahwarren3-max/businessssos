export type XlsxSheet = {
  name: string;
  headers: string[];
  rows: (string | number)[][];
};

export async function downloadXlsx(filename: string, sheets: XlsxSheet[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await writeXlsxFile(
    sheets.map((sheet) => ({
      sheet: sheet.name,
      data: [sheet.headers, ...sheet.rows],
    })),
  ).toFile(filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
