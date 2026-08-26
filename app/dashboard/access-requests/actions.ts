"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { withRequestContext } from "@/lib/db/context";
import { getClientIp } from "@/lib/utils/client-ip";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import {
  createAccessRequestSchema,
  cancelAccessRequestSchema,
  OTHER_SYSTEM_VALUE,
} from "@/lib/validations/access-requests";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// status nunca é enviado no INSERT: o valor default 'pendente' da coluna
// (db/migrations/0001_init.sql) é aplicado pelo Postgres — o client não tem
// como forjar outro status na criação.

const PATH = "/dashboard/access-requests";

// redirectPath vem vinculado via .bind() em cada tela que usa este form
// (access-requests e meus-acessos), pra sempre voltar pra quem o abriu em
// vez de mandar todo mundo de volta pra /dashboard/access-requests.
export async function createAccessRequestAction(redirectPath: string, formData: FormData) {
  await assertTrustedOrigin();

  const parsed = createAccessRequestSchema.safeParse({
    system_id: formData.get("system_id"),
    requested_system_name: formData.get("requested_system_name") || undefined,
    justification: formData.get("justification"),
  });

  if (!parsed.success) {
    redirectWithError(
      redirectPath,
      parsed.error.issues[0]?.message ?? "Dados inválidos para a solicitação."
    );
  }

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const isOtherSystem = parsed.data.system_id === OTHER_SYSTEM_VALUE;
  const clientIp = await getClientIp();

  try {
    await withRequestContext({ userId: session.id, clientIp }, (client) =>
      client.query(
        `insert into access_requests (requester_id, system_id, requested_system_name, justification)
         values ($1, $2, $3, $4)`,
        [
          session.id,
          isOtherSystem ? null : parsed.data.system_id,
          isOtherSystem ? parsed.data.requested_system_name : null,
          parsed.data.justification,
        ]
      )
    );
  } catch (error) {
    // 23505 = violação dos índices únicos parciais que impedem duas
    // solicitações pendentes/em_analise do mesmo usuário para o mesmo
    // sistema (db/migrations/0002_fix_inconsistencias.sql).
    const pgError = error as { code?: string; message?: string };
    console.error("[access-requests] create failed", { message: pgError.message });
    const message =
      pgError.code === "23505"
        ? "Você já tem uma solicitação pendente para este sistema."
        : "Não foi possível registrar a solicitação.";
    redirectWithError(redirectPath, message);
  }

  redirectWithSuccess(redirectPath, "Solicitação enviada.");
}

export async function cancelAccessRequestAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = cancelAccessRequestSchema.safeParse({
    request_id: formData.get("request_id"),
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Solicitação inválida.");
  }

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const clientIp = await getClientIp();

  // Só cancela a própria solicitação, e só enquanto ainda pendente — mesma
  // regra que antes vivia na policy access_requests_update_requester.
  // rowCount === 0 cobre tanto "não existe" quanto "não é sua"/"não está
  // mais pendente" — não distinguimos os casos pro cliente por segurança.
  const { rowCount } = await withRequestContext({ userId: session.id, clientIp }, (client) =>
    client.query(
      `update access_requests
       set status = 'cancelado'
       where id = $1 and requester_id = $2 and status = 'pendente'`,
      [parsed.data.request_id, session.id]
    )
  ).catch((error: unknown) => {
    console.error("[access-requests] cancel failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(
      PATH,
      "Solicitação não encontrada ou você não tem permissão para cancelá-la."
    );
  }

  redirectWithSuccess(PATH, "Solicitação cancelada.");
}
