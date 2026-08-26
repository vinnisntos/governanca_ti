import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { NewTicketForm } from "./new-ticket-form";
import { TicketList, type TicketListRow } from "./ticket-list";

export default async function HelpCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error: errorMessage, success: successMessage } = await searchParams;
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Sem RLS: WHERE requester_id = $1 substitui a antiga policy
  // support_tickets_select (que restringia ao próprio solicitante, exceto
  // admin_ti — aqui nem é admin_ti, então sempre é o próprio).
  const { rows: tickets } = await pool.query<TicketListRow>(
    `select id, category, subject, status, ticket_number, updated_at
     from support_tickets
     where requester_id = $1
     order by updated_at desc`,
    [session.id]
  );

  const openTicketModal = (
    <Modal
      title="Abrir chamado"
      trigger={
        <Button variant="primary">
          <Plus className="h-4 w-4" aria-hidden />
          Abrir chamado
        </Button>
      }
    >
      <NewTicketForm />
    </Modal>
  );

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Central de Ajuda"
        description="Abra um chamado para o TI e acompanhe a conversa por aqui."
        actions={openTicketModal}
      />

      <TicketList
        tickets={tickets}
        emptyTitle="Você ainda não abriu nenhum chamado"
        emptyDescription="Precisa de ajuda com acessos, hardware, telefonia ou login? Abra um chamado e o TI responde por aqui."
        emptyAction={openTicketModal}
      />
    </>
  );
}
