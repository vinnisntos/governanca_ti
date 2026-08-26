import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/session";
import { GrantedAccessList } from "./granted-access-list";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";

export type GrantedAccessRow = {
  id: string;
  decision_at: string | null;
  requested_system_name: string | null;
  access_catalog: { name: string } | null;
  requester: { full_name: string; email: string } | null;
};

export default async function GrantedAccessAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error: errorMessage, success: successMessage } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  // O middleware já bloqueia quem não é admin_ti de chegar nesta página; a
  // autoridade real continua sendo a policy access_requests_select
  // (is_admin() enxerga todas as solicitações, de qualquer solicitante).
  const { data: grants } = await supabase
    .from("access_requests")
    .select(
      "id, decision_at, requested_system_name, access_catalog(name), requester:profiles!access_requests_requester_id_fkey(full_name, email)"
    )
    .eq("status", "aprovado")
    .order("decision_at", { ascending: false })
    .returns<GrantedAccessRow[]>();

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Acessos concedidos"
        description="Quem tem acesso a cada sistema hoje, e a opção de revogar quando necessário."
      />

      <GrantedAccessList grants={grants ?? []} />
    </>
  );
}
