import { Plus, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/session";
import { createAccessRequestAction } from "../access-requests/actions";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Section, Card } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { RequestAccessForm } from "@/components/access/request-access-form";

const PATH = "/dashboard/meus-acessos";

type ApprovedAccessRow = {
  access_catalog: { name: string } | null;
  requested_system_name: string | null;
};

export default async function MyAccessPage({
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

  const [{ data: catalog }, { data: approved }] = await Promise.all([
    supabase
      .from("access_catalog")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("access_requests")
      .select("access_catalog(name), requested_system_name")
      .eq("requester_id", user.id)
      .eq("status", "aprovado")
      .returns<ApprovedAccessRow[]>(),
  ]);

  // Um mesmo sistema pode ter mais de uma solicitação aprovada ao longo do
  // tempo — exibimos cada ferramenta uma única vez, cadastrada no catálogo ou
  // pedida como "Outro".
  const myAccess = Array.from(
    new Set(
      (approved ?? [])
        .map((row) => row.access_catalog?.name ?? row.requested_system_name)
        .filter((name): name is string => Boolean(name))
    )
  );

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Meus acessos"
        description="Ferramentas e sistemas que você tem acesso hoje."
        actions={
          <>
            <LinkButton href="/dashboard/access-requests" variant="outline">
              Ver minhas solicitações
            </LinkButton>
            <Modal
              title="Solicitar acesso"
              trigger={
                <Button variant="primary">
                  <Plus className="h-4 w-4" aria-hidden />
                  Solicitar acesso
                </Button>
              }
            >
              <RequestAccessForm action={createAccessRequestAction.bind(null, PATH)} catalog={catalog ?? []} />
            </Modal>
          </>
        }
      />

      <Section title="Acessos ativos">
        {myAccess.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nenhum acesso concedido ainda"
            description="Assim que uma solicitação sua for aprovada, a ferramenta aparece aqui."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myAccess.map((name) => (
              <li key={name}>
                <Card className="flex items-center gap-3 p-4">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                  <p className="font-medium text-slate-900">{name}</p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
