import { LifeBuoy } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";

// Cobre o notFound() em page.tsx quando o chamado não existe ou pertence a
// outro usuário — a policy support_tickets_select não distingue os dois
// casos de propósito (evita vazar a existência do chamado de outra pessoa).
export default function TicketNotFound() {
  return (
    <>
      <PageHeader title="Chamado não encontrado" />
      <EmptyState
        icon={LifeBuoy}
        title="Este chamado não existe ou não está disponível"
        description="Ele pode ter sido removido ou o link pode estar incorreto."
      />
      <div className="mt-4">
        <LinkButton href="/dashboard/ajuda" variant="primary">
          Voltar para a Central de Ajuda
        </LinkButton>
      </div>
    </>
  );
}
