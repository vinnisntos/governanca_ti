import { ClipboardCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decideAccessRequestAction } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { EmptyState } from "@/components/ui/empty-state";

type PendingRequestRow = {
  id: string;
  justification: string;
  created_at: string;
  access_catalog: { name: string } | null;
  requested_system_name: string | null;
  requester: {
    id: string;
    full_name: string;
    email: string;
    manager_id: string | null;
  } | null;
};

export default async function ApprovalsPage({
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin_ti";

  // A RLS (access_requests_select) já limita o que volta aqui: o próprio
  // usuário só enxerga solicitações de quem ele é gestor direto, ou tudo se
  // for admin_ti/rh. O filtro requester_id != user.id abaixo é só para não
  // listar as próprias solicitações do usuário nesta fila de aprovação.
  const { data: pending } = await supabase
    .from("access_requests")
    .select(
      "id, justification, created_at, access_catalog(name), requested_system_name, requester:profiles!access_requests_requester_id_fkey(id, full_name, email, manager_id)"
    )
    .eq("status", "pendente")
    .neq("requester_id", user.id)
    .order("created_at", { ascending: true })
    .returns<PendingRequestRow[]>();

  // Atalho de UX: só mostra os botões de decisão para quem de fato pode
  // decidir (admin_ti ou gestor direto do solicitante). A autoridade real é
  // a policy access_requests_update_approver — se este cálculo estiver
  // errado, o UPDATE simplesmente falha no banco.
  const decidable = (pending ?? []).filter(
    (request) => isAdmin || request.requester?.manager_id === user.id
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
                  {request.access_catalog?.name ?? request.requested_system_name ?? "Sistema removido"}
                  {!request.access_catalog && request.requested_system_name ? (
                    <span className="ml-2 text-xs font-normal text-amber-600">
                      (fora do catálogo)
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-slate-500">
                  Solicitado por {request.requester?.full_name} ({request.requester?.email})
                </p>
                <p className="mt-2 text-sm text-slate-700">{request.justification}</p>

                <form action={decideAccessRequestAction} className="mt-4 space-y-3">
                  <input type="hidden" name="request_id" value={request.id} />
                  <Field
                    label="Observações"
                    htmlFor={`notes-${request.id}`}
                    hint="Obrigatório em caso de recusa"
                  >
                    <Textarea id={`notes-${request.id}`} name="review_notes" rows={2} />
                  </Field>
                  <div className="flex gap-2">
                    <SubmitButton
                      name="decision"
                      value="aprovado"
                      variant="primary"
                      pendingLabel="Aprovando..."
                    >
                      Aprovar
                    </SubmitButton>
                    <ConfirmSubmitButton
                      name="decision"
                      value="negado"
                      variant="destructive"
                      title="Recusar esta solicitação?"
                      description="O solicitante será notificado e poderá ver o motivo informado no campo de observações."
                      confirmLabel="Recusar solicitação"
                      cancelLabel="Voltar"
                    >
                      Recusar
                    </ConfirmSubmitButton>
                  </div>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
