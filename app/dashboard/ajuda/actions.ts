"use server";

import { redirect } from "next/navigation";
import { pool } from "@/lib/db/client";
import { withRequestContext } from "@/lib/db/context";
import { getSession } from "@/lib/auth/session";
import { requireRole } from "@/lib/auth/require-role";
import { getClientIp } from "@/lib/utils/client-ip";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
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

// Sem RLS no banco: cada Server Action abaixo replica explicitamente, no
// WHERE (ou via requireRole), a mesma regra que antes vivia nas policies
// support_tickets_*/support_ticket_messages_* (ver
// db/migrations/0001_init.sql e o mapeamento em
// C:\Users\vinni\.claude\plans\dapper-launching-liskov.md). A máquina de
// estados (cancelado é final, chamado mesclado congela, só admin mescla ou
// reatribui) continua garantida pela trigger fn_protect_support_ticket_fields.

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

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const clientIp = await getClientIp();

  let ticketId: string;
  try {
    ticketId = await withRequestContext({ userId: session.id, clientIp }, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into support_tickets (requester_id, category, subject)
         values ($1, $2, $3)
         returning id`,
        [session.id, parsed.data.category, parsed.data.subject]
      );
      const ticket = rows[0]!;
      await client.query(
        "insert into support_ticket_messages (ticket_id, sender_id, message) values ($1, $2, $3)",
        [ticket.id, session.id, parsed.data.message]
      );
      return ticket.id;
    });
  } catch (error) {
    console.error("[ajuda] create ticket failed", { message: (error as Error).message });
    redirectWithError(PATH, "Não foi possível abrir o chamado.");
  }

  redirectWithSuccess(`${PATH}/${ticketId}`, "Chamado aberto. O time de TI vai responder por aqui.");
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

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const detailPath = `${PATH}/${parsed.data.ticket_id}`;
  const isAdmin = session.role === "admin_ti";
  const clientIp = await getClientIp();

  // Guarda atômica (substitui a antiga policy support_ticket_messages_insert):
  // sender_id é sempre o próprio usuário; o chamado precisa existir, não
  // estar fechado/cancelado/mesclado, e quem escreve precisa participar dele
  // (dono ou admin).
  const { rowCount } = await withRequestContext({ userId: session.id, clientIp }, (client) =>
    client.query(
      `insert into support_ticket_messages (ticket_id, sender_id, message)
       select $1, $2, $3
       where exists (
         select 1 from support_tickets t
         where t.id = $1
           and t.status not in ('fechado', 'cancelado')
           and t.merged_into_id is null
           and (t.requester_id = $2 or $4)
       )`,
      [parsed.data.ticket_id, session.id, parsed.data.message, isAdmin]
    )
  ).catch((error: unknown) => {
    console.error("[ajuda] add message failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(detailPath, "Não foi possível enviar a mensagem.");
  }

  // Sinaliza pro solicitante que alguém do TI já está olhando o chamado.
  // Efeito colateral de UX, não uma transição de segurança — falhar aqui não
  // invalida a mensagem já enviada com sucesso.
  if (isAdmin) {
    await withRequestContext({ userId: session.id, clientIp }, (client) =>
      client.query(
        `update support_tickets set status = 'em_andamento', assigned_to = $2
         where id = $1 and status = 'aberto'`,
        [parsed.data.ticket_id, session.id]
      )
    ).catch((error: unknown) => {
      console.error("[ajuda] auto-assign on reply failed", { message: (error as Error).message });
    });
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

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para alterar o status deste chamado.");
  }

  const { rows: currentRows } = await pool.query<{ status: string }>(
    "select status from support_tickets where id = $1",
    [parsed.data.ticket_id]
  );
  const current = currentRows[0];

  if (!current) {
    // detailPath, não PATH: quem chega aqui é sempre admin_ti (checado acima),
    // então mandar pra própria Central de Ajuda (PATH) faria o chamado
    // "sumir" da tela.
    redirectWithError(detailPath, "Chamado não encontrado.");
  }

  const { ticket_id: targetTicketId, status: nextStatus, note } = parsed.data;
  const adminId = session!.id;
  const clientIp = await getClientIp();
  const enteringBlockingState = BLOCKING_STATUSES.has(nextStatus);
  const leavingBlockingState = BLOCKING_STATUSES.has(current!.status) && !enteringBlockingState;

  // A guarda de inserção de mensagem bloqueia chamados 'fechado'/'cancelado'
  // — por isso a nota precisa ser inserida ANTES de entrar num desses
  // estados, e só DEPOIS de sair deles (reabertura via este mesmo formulário).
  async function insertNote() {
    if (!note) return;
    await withRequestContext({ userId: adminId, clientIp }, (client) =>
      client.query(
        "insert into support_ticket_messages (ticket_id, sender_id, message) values ($1, $2, $3)",
        [targetTicketId, adminId, note]
      )
    ).catch((error: unknown) => {
      console.error("[ajuda] status change note failed", { message: (error as Error).message });
    });
  }

  if (enteringBlockingState) {
    await insertNote();
  }

  const { rowCount } = await withRequestContext({ userId: adminId, clientIp }, (client) =>
    client.query("update support_tickets set status = $2 where id = $1", [targetTicketId, nextStatus])
  ).catch((error: unknown) => {
    console.error("[ajuda] update status failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(detailPath, "Não foi possível atualizar o status.");
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

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const detailPath = `${PATH}/${parsed.data.ticket_id}`;
  const clientIp = await getClientIp();

  // Substitui a antiga policy support_tickets_reopen_requester: só permite
  // esta transição a partir de 'resolvido'/'fechado' e chamado não mesclado.
  const { rowCount } = await withRequestContext({ userId: session.id, clientIp }, (client) =>
    client.query(
      `update support_tickets set status = 'aberto'
       where id = $1 and requester_id = $2 and status in ('resolvido', 'fechado') and merged_into_id is null`,
      [parsed.data.ticket_id, session.id]
    )
  ).catch((error: unknown) => {
    console.error("[ajuda] reopen ticket failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(
      PATH,
      "Chamado não encontrado ou não pode ser reaberto (só chamados resolvidos/fechados e não mesclados podem ser reabertos)."
    );
  }

  // Só depois da transição: enquanto o chamado estava 'fechado', a guarda de
  // inserção de mensagem bloquearia isso.
  await withRequestContext({ userId: session.id, clientIp }, (client) =>
    client.query(
      "insert into support_ticket_messages (ticket_id, sender_id, message) values ($1, $2, $3)",
      [parsed.data.ticket_id, session.id, `Chamado reaberto pelo solicitante. Motivo: ${parsed.data.reason}`]
    )
  ).catch((error: unknown) => {
    console.error("[ajuda] reopen ticket note failed", { message: (error as Error).message });
  });

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

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const clientIp = await getClientIp();

  // A nota precisa ser inserida ANTES da transição: depois de 'cancelado' a
  // guarda de inserção de mensagem já bloqueia novas mensagens.
  if (parsed.data.reason) {
    await withRequestContext({ userId: session.id, clientIp }, (client) =>
      client.query(
        "insert into support_ticket_messages (ticket_id, sender_id, message) values ($1, $2, $3)",
        [parsed.data.ticket_id, session.id, `Chamado cancelado pelo solicitante. Motivo: ${parsed.data.reason}`]
      )
    ).catch((error: unknown) => {
      console.error("[ajuda] cancel ticket note failed", { message: (error as Error).message });
    });
  }

  // Substitui a antiga policy support_tickets_cancel_requester: só permite
  // esta operação a partir de 'aberto'.
  const { rowCount } = await withRequestContext({ userId: session.id, clientIp }, (client) =>
    client.query(
      "update support_tickets set status = 'cancelado' where id = $1 and requester_id = $2 and status = 'aberto'",
      [parsed.data.ticket_id, session.id]
    )
  ).catch((error: unknown) => {
    console.error("[ajuda] cancel ticket failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
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

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para mesclar chamados.");
  }

  const { rows: sourceRows } = await pool.query<{
    id: string;
    ticket_number: number;
    requester_id: string;
    status: string;
    merged_into_id: string | null;
  }>(
    "select id, ticket_number, requester_id, status, merged_into_id from support_tickets where id = $1",
    [parsed.data.ticket_id]
  );
  const source = sourceRows[0];

  if (!source) {
    // detailPath, não PATH — mesmo motivo do updateTicketStatusAction.
    redirectWithError(detailPath, "Chamado de origem não encontrado.");
  }

  if (source!.merged_into_id) {
    redirectWithError(detailPath, "Este chamado já foi mesclado com outro.");
  }

  if (source!.status === "cancelado") {
    redirectWithError(detailPath, "Um chamado cancelado não pode ser mesclado.");
  }

  const { rows: targetRows } = await pool.query<{
    id: string;
    ticket_number: number;
    requester_id: string;
    merged_into_id: string | null;
  }>(
    "select id, ticket_number, requester_id, merged_into_id from support_tickets where ticket_number = $1",
    [parsed.data.target_ticket_number]
  );
  const target = targetRows[0];

  if (!target) {
    redirectWithError(detailPath, "Chamado de destino não encontrado.");
  }

  if (target!.id === source!.id) {
    redirectWithError(detailPath, "Selecione um chamado de destino diferente do atual.");
  }

  if (target!.merged_into_id) {
    redirectWithError(detailPath, "O chamado de destino já foi mesclado com outro — escolha o chamado original.");
  }

  if (target!.requester_id !== source!.requester_id) {
    redirectWithError(detailPath, "Só é possível mesclar chamados do mesmo solicitante.");
  }

  const sourceNumber = formatTicketNumber(source!.ticket_number);
  const targetNumber = formatTicketNumber(target!.ticket_number);
  const adminId = session!.id;
  const clientIp = await getClientIp();

  // Notas ANTES da transição: depois que o chamado de origem virar 'fechado'
  // + merged_into_id, a guarda de mensagens já bloqueia novas mensagens nele.
  await withRequestContext({ userId: adminId, clientIp }, (client) =>
    client.query(
      `insert into support_ticket_messages (ticket_id, sender_id, message)
       values ($1, $2, $3), ($4, $2, $5)`,
      [
        source!.id,
        adminId,
        `Chamado mesclado com o chamado ${targetNumber}.`,
        target!.id,
        `O chamado ${sourceNumber}, do mesmo solicitante, foi mesclado a este chamado.`,
      ]
    )
  ).catch((error: unknown) => {
    console.error("[ajuda] merge tickets note failed", { message: (error as Error).message });
  });

  const { rowCount } = await withRequestContext({ userId: adminId, clientIp }, (client) =>
    client.query("update support_tickets set status = 'fechado', merged_into_id = $2 where id = $1", [
      source!.id,
      target!.id,
    ])
  ).catch((error: unknown) => {
    console.error("[ajuda] merge tickets failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(detailPath, "Não foi possível mesclar os chamados.");
  }

  redirectWithSuccess(`${PATH}/${target!.id}`, `Chamado mesclado com ${targetNumber}.`);
}

export async function closeOwnTicketAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = closeOwnTicketSchema.safeParse({ ticket_id: formData.get("ticket_id") });

  if (!parsed.success) {
    redirectWithError(PATH, "Chamado inválido.");
  }

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const clientIp = await getClientIp();

  // Substitui a antiga policy support_tickets_close_requester: só o próprio
  // solicitante, a partir de aberto/em_andamento/resolvido.
  const { rowCount } = await withRequestContext({ userId: session.id, clientIp }, (client) =>
    client.query(
      `update support_tickets set status = 'fechado'
       where id = $1 and requester_id = $2 and status in ('aberto', 'em_andamento', 'resolvido')`,
      [parsed.data.ticket_id, session.id]
    )
  ).catch((error: unknown) => {
    console.error("[ajuda] close ticket failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(PATH, "Chamado não encontrado ou você não tem permissão para encerrá-lo.");
  }

  redirectWithSuccess(PATH, "Chamado encerrado.");
}
