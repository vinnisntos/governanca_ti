"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";

// Arquitetura alinhada com as diretrizes do ADR Master.
// assertTrustedOrigin() como primeira linha, igual às demais Server Actions
// de mutação — sem isso, um site de terceiros poderia forçar o logout de um
// usuário autenticado via um <form>/fetch cross-site (CSRF).
export async function signOutAction() {
  await assertTrustedOrigin();

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
