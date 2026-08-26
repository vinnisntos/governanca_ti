import { ClipboardCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { DecisionForm } from "./decision-form";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type DecidableRequestRow = {
  id: string;
  justification: string;
  created_at: string;
  catalog_name: string | null;
  requested_system_name: string | null;
  requester_full_name: string;
  requester_email: string;
};

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error: errorMessage, success: successMessage } = await searchParams;
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const isAdmin = session.role === "admin_ti";

  // Sem RLS: a mesma regra que antes vivia em access_requests_update_approver
  // (quem pode decidir = admin_ti ou gestor direto do solicitante) já
  // filtra a consulta — cada linha devolvida aqui é decidível por quem está
  // vendo a página, sem precisar de um filtro extra em JS depois.
  const { rows: decidable } = await pool.query<DecidableRequestRow>(
    `select ar.id, ar.justification, ar.created_at, cat.name as catalog_name,
            ar.requested_system_name, req.full_name as requester_full_name, req.email as requester_email
     from access_requests ar
     left join access_catalog cat on cat.id = ar.system_id
     join profiles req on req.id = ar.requester_id
     where ar.status = 'pendente'
       and ar.requester_id <> $1
       and ($2 or req.manager_id = $1)
     order by ar.created_at asc`,
    [session.id, isAdmin]
  );

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Aprovações pendentes"
        description="Solicitações de acesso que aguardam sua decisão."
      />

      {decidable.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nenhuma solicitação pendente"
          description="Você não tem nenhuma solicitação aguardando decisão no momento."
        />
      ) : (
        <ul className="space-y-4">
          {decidable.map((request) => (
            <li key={request.id}>
              <Card>
                <p className="font-medium text-slate-900">
                  {request.catalog_name ?? request.requested_system_name ?? "Sistema removido"}
                  {!request.catalog_name && request.requested_system_name ? (
                    <span className="ml-2 text-xs font-normal text-amber-600">
                      (fora do catálogo)
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-slate-600">
                  Solicitado por {request.requester_full_name} ({request.requester_email})
                </p>
                <p className="mt-2 text-sm text-slate-700">{request.justification}</p>

                <DecisionForm requestId={request.id} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
