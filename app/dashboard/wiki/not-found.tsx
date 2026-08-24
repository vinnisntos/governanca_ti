import { BookX } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";

// Cobre o notFound() disparado em wiki/[articleId]/page.tsx quando o artigo
// não existe (ou o usuário não tem permissão para vê-lo — a policy de RLS
// não distingue os dois casos de propósito). Sem este arquivo, a rota cairia
// na 404 genérica do Next, fora da identidade visual em pt-BR do portal.
export default function WikiArticleNotFound() {
  return (
    <>
      <PageHeader title="Artigo não encontrado" />
      <EmptyState
        icon={BookX}
        title="Este artigo não existe ou não está disponível"
        description="Ele pode ter sido removido, ainda estar em rascunho ou o link pode estar incorreto."
      />
      <div className="mt-4">
        <LinkButton href="/dashboard/wiki" variant="primary">
          Voltar para a Base de Conhecimento
        </LinkButton>
      </div>
    </>
  );
}
