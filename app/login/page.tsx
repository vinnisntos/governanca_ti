import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

// Precisa ser renderizada por requisição (não estática): a CSP exige um
// nonce por requisição para os <script> que o Next injeta, e uma página
// estática não tem acesso a esse nonce (ver middleware.ts). O export
// "dynamic" só é respeitado em Server Components — por isso o formulário
// (client component, com estado local) vive em login-form.tsx.
export const dynamic = "force-dynamic";

// O middleware (Edge runtime, sem `pg`) só sabe se existe um cookie de
// sessão, não se ele ainda é válido — por isso não pula mais /login direto
// pro /dashboard sozinho (ver middleware.ts). Essa checagem real, com
// acesso ao banco, é feita aqui: só redireciona quando a sessão de fato
// resolve para um usuário válido; um cookie presente porém inválido
// simplesmente renderiza o formulário normalmente, em vez de entrar em loop
// com o redirect("/login") de app/dashboard/layout.tsx.
export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect("/dashboard");
  }

  return <LoginForm />;
}
