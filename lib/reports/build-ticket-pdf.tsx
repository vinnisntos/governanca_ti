import "server-only";
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

// Relatório da conversa de um chamado da Central de Ajuda — layout dedicado
// de transcript (diferente do grid tabular de build-pdf.tsx, usado pelo
// Dashboard Executivo), pensado para ser lido como um histórico de
// atendimento, não como uma planilha.

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { fontSize: 9, color: "#64748b", marginBottom: 14 },
  metaRow: { flexDirection: "row", marginBottom: 3 },
  metaLabel: { width: 110, fontFamily: "Helvetica-Bold", color: "#334155" },
  metaValue: { flex: 1, color: "#334155" },
  divider: { borderBottomWidth: 1, borderBottomColor: "#94a3b8", marginTop: 10, marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 8, color: "#0f172a" },
  message: { marginBottom: 10, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  messageHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  messageSender: { fontFamily: "Helvetica-Bold", color: "#0f172a" },
  messageTimestamp: { color: "#64748b" },
  messageBody: { color: "#1e293b", lineHeight: 1.4 },
  emptyNote: { color: "#64748b" },
});

export type TicketPdfMessage = {
  senderName: string;
  senderIsAdmin: boolean;
  message: string;
  createdAt: string;
};

export type TicketPdfData = {
  ticketNumber: string;
  subject: string;
  category: string;
  status: string;
  requesterName: string;
  requesterEmail: string;
  createdAt: string;
  closedAt: string | null;
  messages: TicketPdfMessage[];
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function TicketDocument({ data }: { data: TicketPdfData }) {
  return (
    <Document title={`Chamado ${data.ticketNumber} — ${data.subject}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>
          Chamado {data.ticketNumber} — {data.subject}
        </Text>
        <Text style={styles.subtitle}>Relatório da conversa — Central de Ajuda · Governança de TI</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Solicitante</Text>
          <Text style={styles.metaValue}>
            {data.requesterName} ({data.requesterEmail})
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Categoria</Text>
          <Text style={styles.metaValue}>{data.category}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Status</Text>
          <Text style={styles.metaValue}>{data.status}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Aberto em</Text>
          <Text style={styles.metaValue}>{formatDateTime(data.createdAt)}</Text>
        </View>
        {data.closedAt ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Encerrado em</Text>
            <Text style={styles.metaValue}>{formatDateTime(data.closedAt)}</Text>
          </View>
        ) : null}

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Conversa ({data.messages.length} mensagem(ns))</Text>

        {data.messages.length === 0 ? (
          <Text style={styles.emptyNote}>Nenhuma mensagem registrada.</Text>
        ) : (
          data.messages.map((message, index) => (
            <View key={index} style={styles.message} wrap={false}>
              <View style={styles.messageHeaderRow}>
                <Text style={styles.messageSender}>
                  {message.senderName}
                  {message.senderIsAdmin ? " (TI)" : ""}
                </Text>
                <Text style={styles.messageTimestamp}>{formatDateTime(message.createdAt)}</Text>
              </View>
              <Text style={styles.messageBody}>{message.message}</Text>
            </View>
          ))
        )}
      </Page>
    </Document>
  );
}

export async function buildTicketPdfReport(data: TicketPdfData): Promise<Buffer> {
  return renderToBuffer(<TicketDocument data={data} />);
}
