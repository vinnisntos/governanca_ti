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
  reopenTicketSchema,
  cancelOwnTicketSchema,
  mergeTicketsSchema,
} from "@/lib/validations/support-tickets";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";
import { formatTicketNumber } from "@/lib/utils/format-ticket-number";

const BLOCKING_STATUSES = new Set(["fechado", "cancelado"]);

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
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Dados inválidos.");
  }

  const detailPath = `${PATH}/${parsed.data.ticket_id}`;

  // Autorização real é a policy support_tickets_update_admin (RLS);
  // requireRole() só evita gastar uma chamada ao banco para descobrir isso.
  const { authorized, supabase, user } = await requireRole(["admin_ti"]);
  if (!authorized || !user) {
    redirectWithError(PATH, "Você não tem permissão para alterar o status deste chamado.");
  }

  const { data: current } = await supabase
    .from("support_tickets")
    .select("status")
    .eq("id", parsed.data.ticket_id)
    .maybeSingle();

  if (!current) {
    redirectWithError(PATH, "Chamado não encontrado.");
  }

  // A policy support_ticket_messages_insert bloqueia mensagens novas em
  // chamados 'fechado'/'cancelado' (ver 0008_support_ticket_lifecycle.sql) —
  // por isso a nota precisa ser inserida ANTES de entrar num desses estados,
  // e só DEPOIS de sair deles (reabertura via este mesmo formulário).
  const { ticket_id: targetTicketId, status: nextStatus, note } = parsed.data;
  const adminId = user.id;
  const enteringBlockingState = BLOCKING_STATUSES.has(nextStatus);
  const leavingBlockingState = BLOCKING_STATUSES.has(current.status) && !enteringBlockingState;

  async function insertNote() {
    if (!note) return;
    const { error: noteError } = await supabase.from("support_ticket_messages").insert({
      ticket_id: targetTicketId,
      sender_id: adminId,
      message: note,
    });
    if (noteError) {
      console.error("[ajuda] status change note failed", { message: noteError.message });
    }
  }

  if (enteringBlockingState) {
    await insertNote();
  }

  const { data: updated, error } = await supabase
    .from("support_tickets")
    .update({ status: nextStatus })
    .eq("id", targetTicketId)
    .select("id");

  if (error) {
    console.error("[ajuda] update status failed", { message: error.message });
    redirectWithError(detailPath, "Não foi possível atualizar o status.");
  }

  if (!updated || updated.length === 0) {
    redirectWithError(PATH, "Chamado não encontrado.");
  }

  if (leavingBlockingState) {
    await insertNote();
  }

  redirectWithSuccess(detailPath, "Status atualizado.");
}

export async function reopenTicketAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = reopenTicketSchema.safeParse({
    ticket_id: formData.get("ticket_id"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    redirectWithError(PATH, parsed.error.issues[0]?.message ?? "Motivo inválido para reabertura.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const detailPath = `${PATH}/${parsed.data.ticket_id}`;

  // A policy support_tickets_reopen_requester só permite esta transição a
  // partir de 'resolvido'/'fechado' e chamado não mesclado — sem .select(),
  // um UPDATE bloqueado pelo RLS afeta 0 linhas e devolve { error: null }.
  const { data: updated, error } = await supabase
    .from("support_tickets")
    .update({ status: "aberto" })
    .eq("id", parsed.data.ticket_id)
    .select("id");

  if (error) {
    console.error("[ajuda] reopen ticket failed", { message: error.message });
    redirectWithError(detailPath, "Não foi possível reabrir o chamado.");
  }

  if (!updated || updated.length === 0) {
    redirectWithError(
      PATH,
      "Chamado não encontrado ou não pode ser reaberto (só chamados resolvidos/fechados e não mesclados podem ser reabertos)."
    );
  }

  // Só depois da transição: enquanto o chamado estava 'fechado', a policy de
  // mensagens bloquearia este insert.
  const { error: messageError } = await supabase.from("support_ticket_messages").insert({
    ticket_id: parsed.data.ticket_id,
    sender_id: user.id,
    message: `Chamado reaberto pelo solicitante. Motivo: ${parsed.data.reason}`,
  });

  if (messageError) {
    console.error("[ajuda] reopen ticket note failed", { message: messageError.message });
  }

  redirectWithSuccess(detailPath, "Chamado reaberto.");
}

export async function cancelOwnTicketAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = cancelOwnTicketSchema.safeParse({
    ticket_id: formData.get("ticket_id"),
    reason: formData.get("reason") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Chamado inválido.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // A nota precisa ser inserida ANTES da transição: depois de 'cancelado' a
  // policy support_ticket_messages_insert já bloqueia novas mensagens.
  if (parsed.data.reason) {
    const { error: messageError } = await supabase.from("support_ticket_messages").insert({
      ticket_id: parsed.data.ticket_id,
      sender_id: user.id,
      message: `Chamado cancelado pelo solicitante. Motivo: ${parsed.data.reason}`,
    });

    if (messageError) {
      console.error("[ajuda] cancel ticket note failed", { message: messageError.message });
    }
  }

  // A policy support_tickets_cancel_requester só permite esta operação a
  // partir de 'aberto' — sem .select(), um UPDATE bloqueado pelo RLS afeta 0
  // linhas e devolve { error: null }.
  const { data: updated, error } = await supabase
    .from("support_tickets")
    .update({ status: "cancelado" })
    .eq("id", parsed.data.ticket_id)
    .select("id");

  if (error) {
    console.error("[ajuda] cancel ticket failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível cancelar o chamado.");
  }

  if (!updated || updated.length === 0) {
    redirectWithError(
      PATH,
      "Chamado não encontrado ou não pode mais ser cancelado (só é possível cancelar enquanto ninguém do TI respondeu)."
    );
  }

  redirectWithSuccess(PATH, "Chamado cancelado.");
}

export async function mergeTicketsAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = mergeTicketsSchema.safeParse({
    ticket_id: formData.get("ticket_id"),
    target_ticket_number: formData.get("target_ticket_number"),
  });

  if (!parsed.success) {
    redirectWithError(PATH, parsed.error.issues[0]?.message ?? "Informe o número do chamado de destino.");
  }

  const detailPath = `${PATH}/${parsed.data.ticket_id}`;

  // Autorização real é a policy support_tickets_update_admin + a trigger
  // fn_protect_support_ticket_fields (RLS); requireRole() só evita gastar uma
  // chamada ao banco para descobrir isso.
  const { authorized, supabase, user } = await requireRole(["admin_ti"]);
  if (!authorized || !user) {
    redirectWithError(PATH, "Você não tem permissão para mesclar chamados.");
  }

  const { data: source } = await supabase
    .from("support_tickets")
    .select("id, ticket_number, requester_id, status, merged_into_id")
    .eq("id", parsed.data.ticket_id)
    .maybeSingle();

  if (!source) {
    redirectWithError(PATH, "Chamado de origem não encontrado.");
  }

  if (source.merged_into_id) {
    redirectWithError(detailPath, "Este chamado já foi mesclado com outro.");
  }

  if (source.status === "cancelado") {
    redirectWithError(detailPath, "Um chamado cancelado não pode ser mesclado.");
  }

  const { data: target } = await supabase
    .from("support_tickets")
    .select("id, ticket_number, requester_id, merged_into_id")
    .eq("ticket_number", parsed.data.target_ticket_number)
    .maybeSingle();

  if (!target) {
    redirectWithError(detailPath, "Chamado de destino não encontrado.");
  }

  if (target.id === source.id) {
    redirectWithError(detailPath, "Selecione um chamado de destino diferente do atual.");
  }

  if (target.merged_into_id) {
    redirectWithError(detailPath, "O chamado de destino já foi mesclado com outro — escolha o chamado original.");
  }

  if (target.requester_id !== source.requester_id) {
    redirectWithError(detailPath, "Só é possível mesclar chamados do mesmo solicitante.");
  }

  const sourceNumber = formatTicketNumber(source.ticket_number);
  const targetNumber = formatTicketNumber(target.ticket_number);

  // Notas ANTES da transição: depois que o chamado de origem virar 'fechado'
  // + merged_into_id, a policy de mensagens já bloqueia novas mensagens nele.
  const { error: noteError } = await supabase.from("support_ticket_messages").insert([
    {
      ticket_id: source.id,
      sender_id: user.id,
      message: `Chamado mesclado com o chamado ${targetNumber}.`,
    },
    {
      ticket_id: target.id,
      sender_id: user.id,
      message: `O chamado ${sourceNumber}, do mesmo solicitante, foi mesclado a este chamado.`,
    },
  ]);

  if (noteError) {
    console.error("[ajuda] merge tickets note failed", { message: noteError.message });
  }

  const { data: updated, error } = await supabase
    .from("support_tickets")
    .update({ status: "fechado", merged_into_id: target.id })
    .eq("id", source.id)
    .select("id");

  if (error) {
    console.error("[ajuda] merge tickets failed", { message: error.message });
    redirectWithError(detailPath, "Não foi possível mesclar os chamados.");
  }

  if (!updated || updated.length === 0) {
    redirectWithError(detailPath, "Não foi possível mesclar os chamados.");
  }

  redirectWithSuccess(`${PATH}/${target.id}`, `Chamado mesclado com ${targetNumber}.`);
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
