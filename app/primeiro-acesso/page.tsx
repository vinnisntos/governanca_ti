import { SetPasswordForm } from "./set-password-form";

// force-dynamic pelo mesmo motivo de app/login/page.tsx: a CSP exige um
// nonce por requisição para os <script> que o Next injeta, e uma página
// estática não teria acesso a esse nonce (ver middleware.ts).
export const dynamic = "force-dynamic";

export default function PrimeiroAcessoPage() {
  return <SetPasswordForm />;
}
