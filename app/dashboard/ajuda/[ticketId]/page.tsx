import { redirect } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { pool } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import {
  updateTicketStatusAction,
  closeOwnTicketAction,
  cancelOwnTicketAction,
  mergeTicketsAction,
} from "../actions";
import { CATEGORY_LABELS, STATUS_LABELS, STATUS_TONE } from "../labels";
import { formatTicketNumber } from "@/lib/utils/format-ticket-number";
import { ReplyForm } from "./reply-form";
import { ReopenForm } from "./reopen-form";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Card, Section } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";

// O botão "voltar" e o destino pós-navegação dependem de quem está olhando:
// um admin_ti chega aqui pelo Painel de Chamados (/dashboard/admin/chamados)
// quando o chamado não é dele; o próprio solicitante sempre chega pela
// Central de Ajuda (/dashboard/ajuda). Chamado de outra pessoa só é visível
// pra admin_ti (ver WHERE abaixo), então essa combinação é suficiente pra
// distinguir a origem sem depender de query param.
const ADMIN_BACK = { href: "/dashboard/admin/chamados", label: "Painel de Chamados" };
const USER_BACK = { href: "/dashboard/ajuda", label: "Central de Ajuda" };

type TicketQueryRow = {
  id: string;
  requester_id: string;
  category: keyof typeof CATEGORY_LABELS;
  subject: string;
  status: keyof typeof STATUS_LABELS;
  ticket_number: number;
  merged_into_id: string | null;
  created_at: string;
  requester_full_name: string | null;
  requester_email: string | null;
};

type MessageQueryRow = {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
  sender_full_name: string | null;
  sender_role: string | null;
};

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticketId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { ticketId } = await params;
  const { error: errorMessage, success: successMessage } = await searchParams;

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const isAdmin = session.role === "admin_ti";

  // Sem RLS: o WHERE abaixo substitui a antiga policy support_tickets_select
  // — se o chamado for de outro usuário e quem está olhando não for
  // admin_ti, a query simplesmente não retorna a linha (mesmo tratamento de
  // "não existe" usado na wiki, pra não vazar a existência do chamado de
  // outra pessoa).
  const { rows: ticketRows } = await pool.query<TicketQueryRow>(
    `select t.id, t.requester_id, t.category, t.subject, t.status, t.ticket_number,
            t.merged_into_id, t.created_at, r.full_name as requester_full_name, r.email as requester_email
     from support_tickets t
     left join profiles r on r.id = t.requester_id
     where t.id = $1 and (t.requester_id = $2 or $3)`,
    [ticketId, session.id, isAdmin]
  );
  const ticketRow = ticketRows[0];

  if (!ticketRow) {
    // Mesmo tratamento pra chamado inexistente e chamado de outra pessoa —
    // mas o botão de voltar ainda precisa respeitar de onde quem está vendo
    // normalmente chegaria: admin_ti volta pro Painel de Chamados, o
    // solicitante volta pra própria Central de Ajuda.
    const back = isAdmin ? ADMIN_BACK : USER_BACK;
    return (
      <>
        <FlashToast success={successMessage} error={errorMessage} />
        <PageHeader title="Chamado não encontrado" back={back} />
        <EmptyState
          icon={LifeBuoy}
          title="Este chamado não existe ou não está disponível"
          description={`Ele pode ter sido removido, cancelado ou o link estar incorreto. (ID: ${ticketId})`}
        />
        <div className="mt-4">
          <LinkButton href={back.href} variant="primary">
            Voltar para {back.label}
          </LinkButton>
        </div>
      </>
    );
  }

  const ticket = {
    ...ticketRow,
    requester: ticketRow.requester_full_name
      ? { full_name: ticketRow.requester_full_name, email: ticketRow.requester_email ?? "" }
      : null,
  };

  // Mensagens e (se houver) o número do chamado de destino da mesclagem não
  // dependem uma da outra — buscadas em paralelo.
  const [{ rows: messageRows }, mergedIntoRows] = await Promise.all([
    pool.query<MessageQueryRow>(
      `select m.id, m.sender_id, m.message, m.created_at, p.full_name as sender_full_name, p.role as sender_role
       from support_ticket_messages m
       left join profiles p on p.id = m.sender_id
       where m.ticket_id = $1
       order by m.created_at asc`,
      [ticketId]
    ),
    ticket.merged_into_id
      ? pool.query<{ ticket_number: number }>("select ticket_number from support_tickets where id = $1", [
          ticket.merged_into_id,
        ])
      : Promise.resolve({ rows: [] as { ticket_number: number }[] }),
  ]);
  const messages = messageRows.map((m) => ({
    ...m,
    sender: m.sender_full_name ? { full_name: m.sender_full_name, role: m.sender_role ?? "" } : null,
  }));
  const mergedIntoTicketNumber = mergedIntoRows.rows[0]?.ticket_number ?? null;

  const isOwner = ticket.requester_id === session.id;
  // Chamado de outra pessoa só chega até aqui pra admin_ti: quem está
  // olhando veio do Painel de Chamados, não da própria Central de Ajuda.
  const back = isAdmin && !isOwner ? ADMIN_BACK : USER_BACK;
  const isMerged = ticket.merged_into_id !== null;
  const canReply = !isMerged && ticket.status !== "fechado" && ticket.status !== "cancelado" && (isOwner || isAdmin);
  const canClose = isOwner && !isMerged && ["aberto", "em_andamento", "resolvido"].includes(ticket.status);
  const canCancel = isOwner && !isMerged && ticket.status === "aberto";
  const canReopen = isOwner && !isMerged && (ticket.status === "resolvido" || ticket.status === "fechado");

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title={`Chamado ${formatTicketNumber(ticket.ticket_number)} — ${ticket.subject}`}
        back={back}
        description={
          isAdmin && ticket.requester
            ? `Aberto por ${ticket.requester.full_name} (${ticket.requester.email})`
            : undefined
        }
        actions={
          <>
            <Badge tone={STATUS_TONE[ticket.status]}>{STATUS_LABELS[ticket.status]}</Badge>
            <LinkButton
              href={`/dashboard/ajuda/${ticket.id}/export`}
              variant="outline"
              size="sm"
            >
              Baixar relatório da conversa
            </LinkButton>
          </>
        }
      />

      <p className="mb-4 text-xs text-slate-600">
        {CATEGORY_LABELS[ticket.category]} · aberto em{" "}
        {new Date(ticket.created_at).toLocaleString("pt-BR")}
      </p>

      {isMerged && mergedIntoTicketNumber !== null ? (
        <Alert tone="info" className="mb-4">
          Este chamado foi mesclado com o chamado{" "}
          <a
            href={`/dashboard/ajuda/${ticket.merged_into_id}`}
            className="font-medium underline underline-offset-2"
          >
            {formatTicketNumber(mergedIntoTicketNumber)}
          </a>
          . O atendimento continua por lá.
        </Alert>
      ) : null}

      <Section title="Conversa">
        <ul className="space-y-3">
          {messages.map((message) => {
            const senderIsAdmin = message.sender?.role === "admin_ti";
            return (
              <li key={message.id}>
                <Card className={senderIsAdmin ? "border-primary-200 bg-primary-50" : undefined}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">
                      {message.sender?.full_name ?? "Usuário removido"}
                      {senderIsAdmin ? (
                        <span className="ml-1.5 text-xs font-normal text-primary-700">(TI)</span>
                      ) : null}
                    </p>
                    <p className="shrink-0 text-xs text-slate-600">
                      {new Date(message.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{message.message}</p>
                </Card>
              </li>
            );
          })}
        </ul>
      </Section>

      {canReply ? (
        <div className="mt-4">
          <ReplyForm ticketId={ticket.id} />
        </div>
      ) : !isMerged ? (
        <Alert tone="info" className="mt-4">
          <p>
            {ticket.status === "cancelado"
              ? "Este chamado foi cancelado. Abra um novo chamado se ainda precisar de ajuda."
              : "Este chamado está fechado. Abra um novo chamado se precisar de ajuda novamente."}
          </p>
          <LinkButton href="/dashboard/ajuda" variant="outline" size="sm" className="mt-2">
            Abrir novo chamado
          </LinkButton>
        </Alert>
      ) : null}

      {isOwner && ticket.status === "resolvido" ? (
        <Alert tone="info" className="mt-4">
          O TI marcou este chamado como resolvido. Confirme o encerramento se o problema
          acabou, ou reabra explicando o que ainda falta.
        </Alert>
      ) : null}

      {isOwner && !isMerged && (canClose || canCancel || canReopen) ? (
        <div className="mt-4 space-y-4">
          {canClose ? (
            <form action={closeOwnTicketAction} className="inline-block">
              <input type="hidden" name="ticket_id" value={ticket.id} />
              <ConfirmSubmitButton
                variant="outline"
                size="sm"
                title={ticket.status === "resolvido" ? "Confirmar resolução e encerrar?" : "Encerrar este chamado?"}
                description="Encerre só se o seu problema já foi resolvido. Você pode reabrir depois, se precisar."
                confirmLabel={ticket.status === "resolvido" ? "Confirmar e encerrar" : "Encerrar chamado"}
                cancelLabel="Voltar"
              >
                {ticket.status === "resolvido" ? "Confirmar resolução e encerrar" : "Encerrar chamado"}
              </ConfirmSubmitButton>
            </form>
          ) : null}

          {canCancel ? (
            <form action={cancelOwnTicketAction} className="ml-2 inline-block">
              <input type="hidden" name="ticket_id" value={ticket.id} />
              <ConfirmSubmitButton
                variant="destructive"
                size="sm"
                title="Cancelar este chamado?"
                description="Cancele se abriu por engano ou não precisa mais de ajuda. Essa ação não pode ser desfeita."
                confirmLabel="Cancelar chamado"
                cancelLabel="Voltar"
              >
                Cancelar chamado
              </ConfirmSubmitButton>
            </form>
          ) : null}

          {canReopen ? (
            <div className="max-w-md">
              <p className="mb-1.5 text-sm font-medium text-slate-700">Problema não resolvido?</p>
              <ReopenForm ticketId={ticket.id} />
            </div>
          ) : null}
        </div>
      ) : null}

      {isAdmin ? (
        <Section title="Gerenciar chamado" className="mt-8">
          <Card>
            {isMerged ? (
              <p className="text-sm text-slate-600">
                Este chamado foi mesclado e está congelado — o atendimento continua no chamado de
                destino linkado acima.
              </p>
            ) : (
              <>
                <form action={updateTicketStatusAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="ticket_id" value={ticket.id} />
                  <div className="min-w-[180px]">
                    <label htmlFor="status" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Status
                    </label>
                    <Select id="status" name="status" defaultValue={ticket.status}>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="min-w-[220px] flex-1">
                    <label htmlFor="note" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Nota (opcional)
                    </label>
                    <Input id="note" name="note" maxLength={2000} placeholder="Registra como mensagem no chamado" />
                  </div>
                  <SubmitButton variant="outline" pendingLabel="Atualizando...">
                    Atualizar status
                  </SubmitButton>
                </form>

                <form action={mergeTicketsAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4">
                  <input type="hidden" name="ticket_id" value={ticket.id} />
                  <div className="min-w-[180px]">
                    <label htmlFor="target_ticket_number" className="mb-1.5 block text-sm font-medium text-slate-700">
                      Mesclar com o chamado nº
                    </label>
                    <Input
                      id="target_ticket_number"
                      name="target_ticket_number"
                      type="number"
                      min={1}
                      placeholder="Ex.: 42"
                      required
                    />
                  </div>
                  <SubmitButton variant="outline" pendingLabel="Mesclando...">
                    Mesclar chamados
                  </SubmitButton>
                  <p className="w-full text-xs text-slate-600">
                    Só é possível mesclar chamados do mesmo solicitante. Este chamado será fechado e
                    passará a apontar para o chamado de destino.
                  </p>
                </form>
              </>
            )}
          </Card>
        </Section>
      ) : null}
    </>
  );
}
