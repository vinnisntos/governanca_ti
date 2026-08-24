"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/utils/require-role";
import {
  createSupportTicketSchema,
  addTicketMessageSchema,
  updateTicketStatusSchema,
  closeOwnTicketSchema,
} from "@/lib/validations/support-tickets";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Arquitetura alinhada com as diretrizes do ADR Master.
//
// status nunca é enviado no INSERT do ticket: o valor default 'aberto' é
// aplicado pelo Postgres antes da policy support_tickets_insert avaliar o
// with check, e reviewed_by/assigned_to não existem no payload do client.

const PATH = "/dashboard/ajuda";

export async function createSupportTicketAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = createSupportTicketSchema.safeParse({
    category: formData.get("category"),
    subject: formData.get("subject"),
    message: formData.get("message"),
  });

  if (!parsed.success) {
    redirectWithError(PATH, parsed.error.issues[0]?.message ?? "Dados inválidos para o chamado.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .insert({
      requester_id: user.id,
      category: parsed.data.category,
      subject: parsed.data.subject,
    })
    .select("id")
    .single();

  if (error || !ticket) {
    console.error("[ajuda] create ticket failed", { message: error?.message });
    redirectWithError(PATH, "Não foi possível abrir o chamado.");
  }

  const { error: messageError } = await supabase.from("support_ticket_messages").insert({
    ticket_id: ticket.id,
    sender_id: user.id,
    message: parsed.data.message,
  });

  if (messageError) {
    console.error("[ajuda] create first message failed", { message: messageError.message });
    redirectWithError(
      PATH,
      "O chamado não foi registrado corretamente. Tente novamente ou contate o TI."
    );
  }

  redirectWithSuccess(`${PATH}/${ticket.id}`, "Chamado aberto. O time de TI vai responder por aqui.");
}

export async function addTicketMessageAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = addTicketMessageSchema.safeParse({
    ticket_id: formData.get("ticket_id"),
    message: formData.get("message"),
  });

  if (!parsed.success) {
    redirectWithError(PATH, parsed.error.issues[0]?.message ?? "Mensagem inválida.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const detailPath = `${PATH}/${parsed.data.ticket_id}`;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin_ti";

  // Sem .select() aqui: a policy support_ticket_messages_insert (RLS) já
  // recusa a escrita se o chamado estiver fechado ou o usuário não participar
  // dele — um INSERT bloqueado devolve erro (diferente do padrão de UPDATE
  // sem .select() usado nas outras actions, que precisa de checagem
  // explícita porque UPDATE bloqueado por RLS afeta 0 linhas sem erro).
  const { error } = await supabase.from("support_ticket_messages").insert({
    ticket_id: parsed.data.ticket_id,
    sender_id: user.id,
    message: parsed.data.message,
  });

  if (error) {
    console.error("[ajuda] add message failed", { message: error.message });
    redirectWithError(detailPath, "Não foi possível enviar a mensagem.");
  }

  // Sinaliza pro solicitante que alguém do TI já está olhando o chamado.
  // Efeito colateral de UX, não uma transição de segurança — por isso não
  // precisa de trigger no banco, e falhar aqui não invalida a mensagem já
  // enviada com sucesso.
  if (isAdmin) {
    await supabase
      .from("support_tickets")
      .update({ status: "em_andamento", assigned_to: user.id })
      .eq("id", parsed.data.ticket_id)
      .eq("status", "aberto");
  }

  redirectWithSuccess(detailPath, "Mensagem enviada.");
}

export async function updateTicketStatusAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = updateTicketStatusSchema.safeParse({
    ticket_id: formData.get("ticket_id"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Dados inválidos.");
  }

  const detailPath = `${PATH}/${parsed.data.ticket_id}`;

  // Autorização real é a policy support_tickets_update_admin (RLS);
  // requireRole() só evita gastar uma chamada ao banco para descobrir isso.
  const { authorized, supabase } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para alterar o status deste chamado.");
  }

  const { data: updated, error } = await supabase
    .from("support_tickets")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.ticket_id)
    .select("id");

  if (error) {
    console.error("[ajuda] update status failed", { message: error.message });
    redirectWithError(detailPath, "Não foi possível atualizar o status.");
  }

  if (!updated || updated.length === 0) {
    redirectWithError(PATH, "Chamado não encontrado.");
  }

  redirectWithSuccess(detailPath, "Status atualizado.");
}

export async function closeOwnTicketAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = closeOwnTicketSchema.safeParse({ ticket_id: formData.get("ticket_id") });

  if (!parsed.success) {
    redirectWithError(PATH, "Chamado inválido.");
  }

  const supabase = await createSupabaseServerClient();

  // A policy support_tickets_update_requester só permite esta operação para
  // o próprio solicitante — sem .select(), um UPDATE bloqueado pelo RLS
  // afeta 0 linhas e devolve { error: null }, não um erro, por isso checamos
  // explicitamente se algo foi de fato alterado.
  const { data: updated, error } = await supabase
    .from("support_tickets")
    .update({ status: "fechado" })
    .eq("id", parsed.data.ticket_id)
    .select("id");

  if (error) {
    console.error("[ajuda] close ticket failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível encerrar o chamado.");
  }

  if (!updated || updated.length === 0) {
    redirectWithError(PATH, "Chamado não encontrado ou você não tem permissão para encerrá-lo.");
  }

  redirectWithSuccess(PATH, "Chamado encerrado.");
}
