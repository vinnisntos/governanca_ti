import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTicketPdfReport, type TicketPdfMessage } from "@/lib/reports/build-ticket-pdf";
import { formatTicketNumber } from "@/lib/utils/format-ticket-number";
import { CATEGORY_LABELS, STATUS_LABELS } from "../../labels";

// @react-pdf/renderer usa Buffer/APIs de Node — nunca rodar em Edge runtime.
export const runtime = "nodejs";

// Entrega via Route Handler (GET), não Server Action: Server Actions não são
// feitas para devolver um arquivo binário direto ao browser (mesmo padrão do
// export do Dashboard Executivo, ver app/dashboard/admin/relatorios/export/route.ts).
// Autorização: busca o chamado com o client Supabase normal — a policy
// support_tickets_select (RLS) já só devolve a linha para o próprio
// solicitante ou admin_ti; null vira 404, sem precisar de requireRole aqui
// (diferente do relatório executivo, este é acessível ao próprio dono).
export async function GET(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Não autenticado", { status: 401 });
  }

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select(
      "ticket_number, subject, category, status, created_at, closed_at, requester:profiles!support_tickets_requester_id_fkey(full_name, email)"
    )
    .eq("id", ticketId)
    .maybeSingle<{
      ticket_number: number;
      subject: string;
      category: keyof typeof CATEGORY_LABELS;
      status: keyof typeof STATUS_LABELS;
      created_at: string;
      closed_at: string | null;
      requester: { full_name: string; email: string } | null;
    }>();

  if (!ticket) {
    return new Response("Chamado não encontrado", { status: 404 });
  }

  const { data: messages } = await supabase
    .from("support_ticket_messages")
    .select("message, created_at, sender:profiles!support_ticket_messages_sender_id_fkey(full_name, role)")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .returns<{ message: string; created_at: string; sender: { full_name: string; role: string } | null }[]>();

  const ticketNumber = formatTicketNumber(ticket.ticket_number);

  const pdfMessages: TicketPdfMessage[] = (messages ?? []).map((message) => ({
    senderName: message.sender?.full_name ?? "Usuário removido",
    senderIsAdmin: message.sender?.role === "admin_ti",
    message: message.message,
    createdAt: message.created_at,
  }));

  const buffer = await buildTicketPdfReport({
    ticketNumber,
    subject: ticket.subject,
    category: CATEGORY_LABELS[ticket.category] ?? ticket.category,
    status: STATUS_LABELS[ticket.status] ?? ticket.status,
    requesterName: ticket.requester?.full_name ?? "Colaborador removido",
    requesterEmail: ticket.requester?.email ?? "—",
    createdAt: ticket.created_at,
    closedAt: ticket.closed_at,
    messages: pdfMessages,
  });

  const filename = `chamado-${String(ticket.ticket_number).padStart(6, "0")}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
