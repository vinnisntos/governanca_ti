import { KeySquare, Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAccessRequestAction, cancelAccessRequestAction } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Section, Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Alert } from "@/components/ui/alert";

const STATUS_LABELS = {
  pendente: "Pendente",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  negado: "Negado",
  cancelado: "Cancelado",
} as const;

const STATUS_TONE = {
  pendente: "warning",
  em_analise: "info",
  aprovado: "success",
  negado: "danger",
  cancelado: "neutral",
} as const;

type AccessRequestRow = {
  id: string;
  justification: string;
  status: keyof typeof STATUS_LABELS;
  review_notes: string | null;
  decision_at: string | null;
  created_at: string;
  access_catalog: { name: string } | null;
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
        "id, justification, status, review_notes, decision_at, created_at, access_catalog(name)"
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
          catalog && catalog.length > 0 ? (
            <Modal
              title="Nova solicitação de acesso"
              trigger={
                <Button variant="primary">
                  <Plus className="h-4 w-4" aria-hidden />
                  Nova solicitação
                </Button>
              }
            >
              <form action={createAccessRequestAction} className="space-y-4">
                <Field label="Sistema" htmlFor="system_id" required>
                  <Select id="system_id" name="system_id" required defaultValue="">
                    <option value="" disabled>
                      Selecione...
                    </option>
                    {catalog.map((system) => (
                      <option key={system.id} value={system.id}>
                        {system.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field
                  label="Justificativa"
                  htmlFor="justification"
                  required
                  hint="Explique por que você precisa deste acesso (mínimo 10 caracteres)."
                >
                  <Textarea id="justification" name="justification" required minLength={10} rows={3} />
                </Field>

                <div className="flex justify-end">
                  <SubmitButton variant="primary" pendingLabel="Enviando...">
                    Enviar solicitação
                  </SubmitButton>
                </div>
              </form>
            </Modal>
          ) : undefined
        }
      />

      {!catalog || catalog.length === 0 ? (
        <Alert tone="info" className="mb-6">
          Nenhum sistema disponível no catálogo ainda. Peça ao admin de TI para cadastrar em Catálogo de
          Acessos.
        </Alert>
      ) : null}

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
                        {request.access_catalog?.name ?? "Sistema removido"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{request.justification}</p>
                    </div>
                    <Badge tone={STATUS_TONE[request.status]}>{STATUS_LABELS[request.status]}</Badge>
                  </div>

                  {request.status === "negado" && request.review_notes ? (
                    <Alert tone="danger" className="mt-3">
                      Motivo da recusa: {request.review_notes}
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
