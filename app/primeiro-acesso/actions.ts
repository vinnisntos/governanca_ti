"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { withRequestContext } from "@/lib/db/context";
import { hashPassword } from "@/lib/auth/password";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { setPasswordSchema } from "@/lib/validations/auth";
import { getClientIp } from "@/lib/utils/client-ip";

export type SetPasswordActionState = { error: string | null };

export async function setInitialPasswordAction(
  _prevState: SetPasswordActionState,
  formData: FormData
): Promise<SetPasswordActionState> {
  try {
    await assertTrustedOrigin();
  } catch {
    return { error: "Não foi possível processar a solicitação." };
  }

  const parsed = setPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm_password: formData.get("confirm_password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const clientIp = await getClientIp();

  // fn_protect_profile_fields (db/migrations/0001_init.sql) libera
  // explicitamente esta UPDATE: o próprio usuário pode limpar
  // must_change_password (true -> false) contanto que nenhum outro campo
  // protegido mude na mesma escrita — não precisa mais de um cliente
  // "service role" pra isso.
  await withRequestContext({ userId: session.id, clientIp }, (client) =>
    client.query(
      "update profiles set password_hash = $2, must_change_password = false where id = $1",
      [session.id, passwordHash]
    )
  );

  redirect("/dashboard");
}
