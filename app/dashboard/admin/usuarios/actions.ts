"use server";

import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/auth/require-role";
import { createUserSchema, updateUserSchema } from "@/lib/validations/users";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";
import { withRequestContext } from "@/lib/db/context";
import { hashPassword } from "@/lib/auth/password";
import { generateTempPassword } from "@/lib/utils/generate-temp-password";
import { setTempPasswordFlash } from "@/lib/utils/temp-password-flash";
import { getClientIp } from "@/lib/utils/client-ip";
import { destroyAllSessionsForUser } from "@/lib/auth/session";

// Sem RLS no banco: requireRole(["admin_ti"]) + o layout em
// app/dashboard/admin/layout.tsx são a autoridade real de acesso a esta
// tela. fn_protect_profile_fields (db/migrations/0001_init.sql) segue
// bloqueando qualquer UPDATE de role/department_id/manager_id/is_active
// vinda de fora deste caminho, como defesa em profundidade.

const PATH = "/dashboard/admin/usuarios";

export async function updateUserAction(formData: FormData) {
  await assertTrustedOrigin();

  const id = formData.get("id");

  if (!z.string().uuid().safeParse(id).success) {
    redirectWithError(PATH, "Usuário inválido.");
  }

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  // Impede que o admin altere o próprio papel/situação por esta tela e cause
  // um auto-rebaixamento/desativação acidental (é uma defesa de UX, não de
  // segurança — nada no backend impede um admin de editar o próprio registro).
  if (session!.id === id) {
    redirectWithError(PATH, "Você não pode editar o próprio usuário por aqui.");
  }

  const departmentRaw = formData.get("department_id");
  const managerRaw = formData.get("manager_id");

  const parsed = updateUserSchema.safeParse({
    role: formData.get("role"),
    department_id: departmentRaw ? departmentRaw : null,
    manager_id: managerRaw ? managerRaw : null,
    is_active: formData.get("is_active") === "true",
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Dados inválidos.");
  }

  if (parsed.data.manager_id && parsed.data.manager_id === id) {
    redirectWithError(PATH, "Um usuário não pode ser gestor de si mesmo.");
  }

  const clientIp = await getClientIp();
  const { rowCount } = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
    client.query(
      `update profiles
       set role = $2, department_id = $3, manager_id = $4, is_active = $5
       where id = $1
       returning id`,
      [id, parsed.data.role, parsed.data.department_id ?? null, parsed.data.manager_id ?? null, parsed.data.is_active]
    )
  ).catch((error: unknown) => {
    console.error("[users] update failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(PATH, "Usuário não encontrado ou não foi possível salvar as alterações.");
  }

  redirectWithSuccess(PATH, "Usuário atualizado.");
}

export async function createUserAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const departmentRaw = formData.get("department_id");
  const managerRaw = formData.get("manager_id");

  const parsed = createUserSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    role: formData.get("role"),
    department_id: departmentRaw ? departmentRaw : null,
    manager_id: managerRaw ? managerRaw : null,
  });

  if (!parsed.success) {
    redirectWithError(PATH, parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const clientIp = await getClientIp();

  try {
    await withRequestContext({ userId: session!.id, clientIp }, (client) =>
      client.query(
        `insert into profiles
           (full_name, email, password_hash, role, department_id, manager_id, must_change_password)
         values ($1, $2, $3, $4, $5, $6, true)`,
        [
          parsed.data.full_name,
          parsed.data.email,
          passwordHash,
          parsed.data.role,
          parsed.data.department_id ?? null,
          parsed.data.manager_id ?? null,
        ]
      )
    );
  } catch (error) {
    const pgError = error as { code?: string; message?: string };
    console.error("[users] create failed", { message: pgError.message });
    const message =
      pgError.code === "23505" ? "Já existe um usuário com este e-mail." : "Não foi possível criar o usuário.";
    redirectWithError(PATH, message);
  }

  await setTempPasswordFlash({ email: parsed.data.email, password: tempPassword });
  redirectWithSuccess(PATH, `Usuário ${parsed.data.full_name} criado.`);
}

export async function resetUserPasswordAction(formData: FormData) {
  await assertTrustedOrigin();

  const id = formData.get("id");

  if (!z.string().uuid().safeParse(id).success) {
    redirectWithError(PATH, "Usuário inválido.");
  }

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  if (session!.id === id) {
    redirectWithError(PATH, "Você não pode redefinir a própria senha por aqui.");
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const clientIp = await getClientIp();

  const { rows } = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
    client.query<{ email: string }>(
      `update profiles
       set password_hash = $2, must_change_password = true
       where id = $1
       returning email`,
      [id, passwordHash]
    )
  ).catch((error: unknown) => {
    console.error("[users] reset password failed", { message: (error as Error).message });
    return { rows: [] as { email: string }[] };
  });

  const email = rows[0]?.email;
  if (!email) {
    redirectWithError(PATH, "Usuário não encontrado.");
  }

  // Derruba qualquer sessão ativa do usuário — equivalente ao efeito
  // implícito de trocar a senha no Supabase Auth de antes.
  await destroyAllSessionsForUser(id as string);

  await setTempPasswordFlash({ email: email!, password: tempPassword });
  redirectWithSuccess(PATH, "Senha redefinida.");
}
