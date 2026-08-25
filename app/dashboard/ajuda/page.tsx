import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("id, category, subject, status, ticket_number, updated_at")
    .eq("requester_id", user.id)
    .order("updated_at", { ascending: false })
    .returns<TicketListRow[]>();

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Central de Ajuda"
        description="Abra um chamado para o TI e acompanhe a conversa por aqui."
        actions={
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
        }
      />

      <TicketList
        tickets={tickets ?? []}
        emptyTitle="Nenhum chamado aberto"
        emptyDescription="Precisa de ajuda com acessos, hardware, telefonia ou login? Abra um chamado e o TI responde por aqui."
      />
    </>
  );
}
