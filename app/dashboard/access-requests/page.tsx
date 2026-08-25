import { KeySquare, Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAccessRequestAction, cancelAccessRequestAction } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Section, Card } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Alert } from "@/components/ui/alert";
import { RequestAccessForm } from "@/components/access/request-access-form";

const STATUS_LABELS = {
  pendente: "Pendente",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  negado: "Negado",
  cancelado: "Cancelado",
  revogado: "Revogado",
} as const;

const STATUS_TONE = {
  pendente: "warning",
  em_analise: "info",
  aprovado: "success",
  negado: "danger",
  cancelado: "neutral",
  revogado: "danger",
} as const;

type AccessRequestRow = {
  id: string;
  justification: string;
  status: keyof typeof STATUS_LABELS;
  review_notes: string | null;
  revoke_reason: string | null;
  decision_at: string | null;
  created_at: string;
  access_catalog: { name: string } | null;
  requested_system_name: string | null;
};

export default async function AccessRequestsPage({
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

  const [{ data: catalog }, { data: requests }] = await Promise.all([
    supabase
      .from("access_catalog")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("access_requests")
      .select(
        "id, justification, status, review_notes, revoke_reason, decision_at, created_at, requested_system_name, access_catalog(name)"
      )
      .eq("requester_id", user.id)
      .order("created_at", { ascending: false })
      .returns<AccessRequestRow[]>(),
  ]);

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Minhas solicitações de acesso"
        description="Peça acesso a sistemas e acompanhe o status das suas solicitações."
        actions={
          <>
            <LinkButton href="/dashboard/meus-acessos" variant="outline">
              Ver meus acessos ativos
            </LinkButton>
            <Modal
              title="Nova solicitação de acesso"
              trigger={
                <Button variant="primary">
                  <Plus className="h-4 w-4" aria-hidden />
                  Nova solicitação
                </Button>
              }
            >
              <RequestAccessForm
                action={createAccessRequestAction.bind(null, "/dashboard/access-requests")}
                catalog={catalog ?? []}
              />
            </Modal>
          </>
        }
      />

      <Section title="Histórico">
        {!requests || requests.length === 0 ? (
          <EmptyState
            icon={KeySquare}
            title="Nenhuma solicitação registrada"
            description="Suas solicitações de acesso vão aparecer aqui assim que você criar a primeira."
          />
        ) : (
          <ul className="space-y-3">
            {requests.map((request) => (
              <li key={request.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {request.access_catalog?.name ??
                          request.requested_system_name ??
                          "Sistema removido"}
                        {!request.access_catalog && request.requested_system_name ? (
                          <span className="ml-2 text-xs font-normal text-slate-600">
                            (fora do catálogo)
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{request.justification}</p>
                    </div>
                    <Badge tone={STATUS_TONE[request.status]}>{STATUS_LABELS[request.status]}</Badge>
                  </div>

                  {request.review_notes ? (
                    <Alert tone={request.status === "negado" ? "danger" : "info"} className="mt-3">
                      {request.status === "negado" ? "Motivo da recusa: " : "Observação: "}
                      {request.review_notes}
                    </Alert>
                  ) : null}

                  {request.status === "revogado" ? (
                    <Alert tone="danger" className="mt-3">
                      Acesso revogado.
                      {request.revoke_reason ? ` Motivo: ${request.revoke_reason}` : ""}
                    </Alert>
                  ) : null}

                  {request.status === "pendente" ? (
                    <form action={cancelAccessRequestAction} className="mt-3">
                      <input type="hidden" name="request_id" value={request.id} />
                      <ConfirmSubmitButton
                        variant="outline"
                        size="sm"
                        title="Cancelar esta solicitação?"
                        description="Você poderá criar uma nova solicitação para o mesmo sistema depois, se precisar."
                        confirmLabel="Cancelar solicitação"
                        cancelLabel="Voltar"
                      >
                        Cancelar solicitação
                      </ConfirmSubmitButton>
                    </form>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
