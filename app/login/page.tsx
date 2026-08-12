import { LoginForm } from "./login-form";

// Precisa ser renderizada por requisição (não estática): a CSP exige um
// nonce por requisição para os <script> que o Next injeta, e uma página
// estática não tem acesso a esse nonce (ver middleware.ts). O export
// "dynamic" só é respeitado em Server Components — por isso o formulário
// (client component, com estado local) vive em login-form.tsx.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm />;
}
