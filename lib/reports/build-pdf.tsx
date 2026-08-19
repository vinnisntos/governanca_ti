import "server-only";
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { ReportColumn, ReportDataset } from "./datasets";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 8, color: "#64748b", marginBottom: 14 },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
    paddingBottom: 4,
    marginBottom: 4,
  },
  headerCell: { fontFamily: "Helvetica-Bold", fontSize: 8, paddingRight: 6 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 3,
  },
  cell: { fontSize: 8, paddingRight: 6 },
  emptyNote: { fontSize: 9, color: "#64748b", marginTop: 8 },
});

function cellStyle(column: ReportColumn, base: object) {
  return { ...base, flexGrow: column.widthWeight ?? 1, flexBasis: 0 };
}

function formatCell(value: string | number | null, format: ReportColumn["format"]): string {
  if (value === null || value === "") return "—";
  switch (format) {
    case "currency":
      return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    case "number":
      return Number(value).toLocaleString("pt-BR");
    case "date": {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("pt-BR");
    }
    case "datetime": {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR");
    }
    default:
      return String(value);
  }
}

function DatasetPage({ dataset }: { dataset: ReportDataset }) {
  return (
    <Page size="A4" style={styles.page} orientation="landscape">
      <Text style={styles.title}>{dataset.title}</Text>
      <Text style={styles.subtitle}>
        Relatório — Governança de TI · {dataset.rows.length} registro(s)
      </Text>

      <View style={styles.headerRow} fixed>
        {dataset.columns.map((column) => (
          <Text key={column.key} style={cellStyle(column, styles.headerCell)}>
            {column.label}
          </Text>
        ))}
      </View>

      {dataset.rows.length === 0 ? (
        <Text style={styles.emptyNote}>Nenhum registro.</Text>
      ) : (
        dataset.rows.map((row, index) => (
          <View key={index} style={styles.row} wrap={false}>
            {dataset.columns.map((column) => (
              <Text key={column.key} style={cellStyle(column, styles.cell)}>
                {formatCell(row[column.key] ?? null, column.format)}
              </Text>
            ))}
          </View>
        ))
      )}
    </Page>
  );
}

function ReportDocument({ datasets }: { datasets: ReportDataset[] }) {
  return (
    <Document title="Relatório — Governança de TI">
      {datasets.map((dataset) => (
        <DatasetPage key={dataset.key} dataset={dataset} />
      ))}
    </Document>
  );
}

export async function buildPdfReport(datasets: ReportDataset[]): Promise<Buffer> {
  return renderToBuffer(<ReportDocument datasets={datasets} />);
}
