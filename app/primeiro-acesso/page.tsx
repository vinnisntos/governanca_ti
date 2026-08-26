import { redirect } from "next/navigation";
import { getSession, destroySession } from "@/lib/auth/session";
import { SetPasswordForm } from "./set-password-form";

// force-dynamic pelo mesmo motivo de app/login/page.tsx: a CSP exige um
// nonce por requisição para os <script> que o Next injeta, e uma página
// estática não teria acesso a esse nonce (ver middleware.ts).
export const dynamic = "force-dynamic";

// O middleware só sabe se existe UM cookie de sessão (não tem acesso ao
// banco no runtime Edge — ver middleware.ts); a checagem autoritativa de
// sessão válida / is_active / must_change_password é feita aqui, igual ao
// que app/dashboard/layout.tsx faz para o restante do portal.
export default async function PrimeiroAcessoPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (!session.is_active) {
    await destroySession();
    redirect("/login?reason=inactive");
  }

  if (!session.must_change_password) {
    redirect("/dashboard");
  }

  return <SetPasswordForm />;
}
