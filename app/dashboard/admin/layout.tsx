import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/require-role";

// Gate de papel para tudo sob /dashboard/admin. app/dashboard/layout.tsx já
// garantiu sessão válida/ativa/sem senha pendente antes deste layout
// renderizar — aqui só falta o papel. Sem RLS no banco, esta é a
// autoridade real (antes o middleware fazia esta checagem; agora ele só
// sabe se existe um cookie de sessão — ver middleware.ts).
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { authorized } = await requireRole(["admin_ti"]);

  if (!authorized) {
    redirect("/dashboard?denied=admin");
  }

  return <>{children}</>;
}
