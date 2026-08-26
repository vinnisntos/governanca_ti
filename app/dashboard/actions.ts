"use server";

import { redirect } from "next/navigation";
import { destroySession } from "@/lib/auth/session";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";

// assertTrustedOrigin() como primeira linha, igual às demais Server Actions
// de mutação — sem isso, um site de terceiros poderia forçar o logout de um
// usuário autenticado via um <form>/fetch cross-site (CSRF).
export async function signOutAction() {
  await assertTrustedOrigin();

  await destroySession();
  redirect("/login");
}
