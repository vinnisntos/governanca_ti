import { z } from "zod";
import { pool } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { buildTicketPdfReport, type TicketPdfMessage } from "@/lib/reports/build-ticket-pdf";
import { formatTicketNumber } from "@/lib/utils/format-ticket-number";
import { CATEGORY_LABELS, STATUS_LABELS } from "../../labels";

// @react-pdf/renderer usa Buffer/APIs de Node — nunca rodar em Edge runtime.
export const runtime = "nodejs";

type TicketQueryRow = {
  ticket_number: number;
  subject: string;
  category: keyof typeof CATEGORY_LABELS;
  status: keyof typeof STATUS_LABELS;
  created_at: string;
  closed_at: string | null;
  requester_full_name: string | null;
  requester_email: string | null;
};

type MessageQueryRow = {
  message: string;
  created_at: string;
  sender_full_name: string | null;
  sender_role: string | null;
};

// Entrega via Route Handler (GET), não Server Action: Server Actions não são
// feitas para devolver um arquivo binário direto ao browser (mesmo padrão do
// export do Dashboard Executivo, ver app/dashboard/admin/relatorios/export/route.ts).
// Sem RLS: o WHERE da query abaixo substitui a antiga policy
// support_tickets_select — só devolve a linha pro próprio solicitante ou
// admin_ti; ausência de linha vira 404.
export async function GET(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const session = await getSession();

  if (!session || !session.is_active) {
    return new Response("Não autenticado", { status: 401 });
  }

  if (!z.string().uuid().safeParse(ticketId).success) {
    return new Response("Chamado não encontrado", { status: 404 });
  }

  const isAdmin = session.role === "admin_ti";

  const { rows } = await pool.query<TicketQueryRow>(
    `select t.ticket_number, t.subject, t.category, t.status, t.created_at, t.closed_at,
            r.full_name as requester_full_name, r.email as requester_email
     from support_tickets t
     left join profiles r on r.id = t.requester_id
     where t.id = $1 and (t.requester_id = $2 or $3)`,
    [ticketId, session.id, isAdmin]
  );
  const ticket = rows[0];

  if (!ticket) {
    return new Response("Chamado não encontrado", { status: 404 });
  }

  const { rows: messages } = await pool.query<MessageQueryRow>(
    `select m.message, m.created_at, p.full_name as sender_full_name, p.role as sender_role
     from support_ticket_messages m
     left join profiles p on p.id = m.sender_id
     where m.ticket_id = $1
     order by m.created_at asc`,
    [ticketId]
  );

  const ticketNumber = formatTicketNumber(ticket.ticket_number);

  const pdfMessages: TicketPdfMessage[] = messages.map((message) => ({
    senderName: message.sender_full_name ?? "Usuário removido",
    senderIsAdmin: message.sender_role === "admin_ti",
    message: message.message,
    createdAt: message.created_at,
  }));

  const buffer = await buildTicketPdfReport({
    ticketNumber,
    subject: ticket.subject,
    category: CATEGORY_LABELS[ticket.category] ?? ticket.category,
    status: STATUS_LABELS[ticket.status] ?? ticket.status,
    requesterName: ticket.requester_full_name ?? "Colaborador removido",
    requesterEmail: ticket.requester_email ?? "—",
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
