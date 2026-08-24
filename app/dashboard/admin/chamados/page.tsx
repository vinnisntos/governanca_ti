import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { TicketList, type TicketListRow } from "@/app/dashboard/ajuda/ticket-list";

export default async function AdminTicketQueuePage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // O middleware já bloqueia quem não é admin_ti; a autoridade real é a
  // policy support_tickets_update_admin/select (RLS) — aqui a query só usa o
  // acesso de leitura que aquela policy já concede a todo admin_ti.
  const { data: tickets } = await supabase
    .from("support_tickets")
    .select(
      "id, category, subject, status, updated_at, requester:profiles!support_tickets_requester_id_fkey(full_name, email)"
    )
    .order("updated_at", { ascending: false })
    .returns<TicketListRow[]>();

  return (
    <>
      <PageHeader
        title="Chamados"
        description="Todos os chamados abertos pelos colaboradores, para acompanhamento e resposta do TI."
      />

      <TicketList
        tickets={tickets ?? []}
        showRequester
        emptyTitle="Nenhum chamado registrado ainda"
      />
    </>
  );
}
