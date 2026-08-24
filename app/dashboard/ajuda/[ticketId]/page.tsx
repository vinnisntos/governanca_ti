import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateTicketStatusAction, closeOwnTicketAction } from "../actions";
import { CATEGORY_LABELS, STATUS_LABELS, STATUS_TONE } from "../labels";
import { ReplyForm } from "./reply-form";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Card, Section } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Alert } from "@/components/ui/alert";

type TicketRow = {
  id: string;
  requester_id: string;
  category: keyof typeof CATEGORY_LABELS;
  subject: string;
  status: keyof typeof STATUS_LABELS;
  created_at: string;
  requester: { full_name: string; email: string } | null;
};

type MessageRow = {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
  sender: { full_name: string; role: string } | null;
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
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin_ti";

  // Se o chamado for de outro usuário e quem está olhando não for admin_ti,
  // a policy support_tickets_select simplesmente não retorna a linha — mesmo
  // tratamento de "não existe" usado na wiki (evita vazar a existência do
  // chamado de outra pessoa).
  const { data: ticket } = await supabase
    .from("support_tickets")
    .select(
      "id, requester_id, category, subject, status, created_at, requester:profiles!support_tickets_requester_id_fkey(full_name, email)"
    )
    .eq("id", ticketId)
    .maybeSingle<TicketRow>();

  if (!ticket) {
    notFound();
  }

  const { data: messages } = await supabase
    .from("support_ticket_messages")
    .select(
      "id, sender_id, message, created_at, sender:profiles!support_ticket_messages_sender_id_fkey(full_name, role)"
    )
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .returns<MessageRow[]>();

  const isOwner = ticket.requester_id === user.id;
  const canReply = ticket.status !== "fechado" && (isOwner || isAdmin);

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title={ticket.subject}
        back={{ href: "/dashboard/ajuda", label: "Central de Ajuda" }}
        description={
          isAdmin && ticket.requester
            ? `Aberto por ${ticket.requester.full_name} (${ticket.requester.email})`
            : undefined
        }
        actions={<Badge tone={STATUS_TONE[ticket.status]}>{STATUS_LABELS[ticket.status]}</Badge>}
      />

      <p className="mb-4 text-xs text-slate-600">
        {CATEGORY_LABELS[ticket.category]} · aberto em{" "}
        {new Date(ticket.created_at).toLocaleString("pt-BR")}
      </p>

      <Section title="Conversa">
        <ul className="space-y-3">
          {(messages ?? []).map((message) => {
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
      ) : (
        <Alert tone="info" className="mt-4">
          Este chamado está fechado. Abra um novo chamado se precisar de ajuda novamente.
        </Alert>
      )}

      {isAdmin ? (
        <Section title="Gerenciar chamado" className="mt-8">
          <Card>
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
              <SubmitButton variant="outline" pendingLabel="Atualizando...">
                Atualizar status
              </SubmitButton>
            </form>
          </Card>
        </Section>
      ) : isOwner && ticket.status !== "fechado" ? (
        <div className="mt-4">
          <form action={closeOwnTicketAction}>
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <ConfirmSubmitButton
              variant="outline"
              size="sm"
              title="Encerrar este chamado?"
              description="Encerre só se o seu problema já foi resolvido. Você pode abrir um novo chamado depois, se precisar."
              confirmLabel="Encerrar chamado"
              cancelLabel="Voltar"
            >
              Encerrar chamado
            </ConfirmSubmitButton>
          </form>
        </div>
      ) : null}
    </>
  );
}
