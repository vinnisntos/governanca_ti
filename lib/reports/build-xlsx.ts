import "server-only";
import ExcelJS from "exceljs";
import type { ReportColumn, ReportDataset } from "./datasets";

const INVALID_SHEET_NAME_CHARS = /[:\\/?*[\]]/g;

function sanitizeSheetName(title: string): string {
  return title.replace(INVALID_SHEET_NAME_CHARS, "").slice(0, 31) || "Dados";
}

function widthFor(column: ReportColumn): number {
  const base = column.format === "currency" || column.format === "number" ? 14 : column.format === "date" ? 14 : column.format === "datetime" ? 18 : 22;
  return Math.round(base * (column.widthWeight ?? 1));
}

function numFmtFor(column: ReportColumn): string | undefined {
  switch (column.format) {
    case "currency":
      return '"R$" #,##0.00';
    case "date":
      return "dd/mm/yyyy";
    case "datetime":
      return "dd/mm/yyyy hh:mm";
    default:
      return undefined;
  }
}

function cellValue(raw: string | number | null, format: ReportColumn["format"]) {
  if (raw === null) return null;
  if (format === "date" || format === "datetime") {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? raw : date;
  }
  return raw;
}

export async function buildXlsxReport(datasets: ReportDataset[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  for (const dataset of datasets) {
    const sheet = workbook.addWorksheet(sanitizeSheetName(dataset.title));
    sheet.columns = dataset.columns.map((column) => ({
      header: column.label,
      key: column.key,
      width: widthFor(column),
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    dataset.rows.forEach((row) => {
      const values: Record<string, unknown> = {};
      for (const column of dataset.columns) {
        values[column.key] = cellValue(row[column.key] ?? null, column.format);
      }
      sheet.addRow(values);
    });

    dataset.columns.forEach((column) => {
      const numFmt = numFmtFor(column);
      if (numFmt) sheet.getColumn(column.key).numFmt = numFmt;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
