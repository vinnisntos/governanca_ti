import { pool } from "@/lib/db/client";
import { PageHeader } from "@/components/ui/page-header";
import { TicketList, type TicketListRow } from "@/app/dashboard/ajuda/ticket-list";

type TicketQueryRow = TicketListRow & {
  requester_full_name: string | null;
  requester_email: string | null;
};

export default async function AdminTicketQueuePage() {
  // app/dashboard/admin/layout.tsx já garante admin_ti — sem RLS no banco,
  // aqui não há mais nenhuma linha restrita: admin vê todos os chamados.
  const { rows } = await pool.query<TicketQueryRow>(
    `select t.id, t.category, t.subject, t.status, t.ticket_number, t.updated_at,
            r.full_name as requester_full_name, r.email as requester_email
     from support_tickets t
     left join profiles r on r.id = t.requester_id
     order by t.updated_at desc`
  );

  const tickets: TicketListRow[] = rows.map((row) => ({
    id: row.id,
    category: row.category,
    subject: row.subject,
    status: row.status,
    ticket_number: row.ticket_number,
    updated_at: row.updated_at,
    requester: row.requester_full_name ? { full_name: row.requester_full_name, email: row.requester_email ?? "" } : null,
  }));

  return (
    <>
      <PageHeader
        title="Chamados"
        description="Todos os chamados abertos pelos colaboradores, para acompanhamento e resposta do TI."
      />

      <TicketList tickets={tickets} showRequester emptyTitle="Nenhum chamado registrado ainda" />
    </>
  );
}
