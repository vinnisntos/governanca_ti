import { Plus } from "lucide-react";
import { pool } from "@/lib/db/client";
import { grantAccessAction } from "./actions";
import { GrantedAccessList } from "./granted-access-list";
import { GrantAccessForm } from "@/components/access/grant-access-form";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export type GrantedAccessRow = {
  id: string;
  decision_at: string | null;
  requested_system_name: string | null;
  access_catalog: { name: string } | null;
  requester: { full_name: string; email: string } | null;
};

type GrantedAccessQueryRow = {
  id: string;
  decision_at: string | null;
  requested_system_name: string | null;
  catalog_name: string | null;
  requester_full_name: string;
  requester_email: string;
};

export default async function GrantedAccessAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error: errorMessage, success: successMessage } = await searchParams;

  // app/dashboard/admin/layout.tsx já garante admin_ti — sem RLS, esta
  // página vê todas as solicitações aprovadas, de qualquer solicitante.
  const [{ rows }, { rows: profiles }, { rows: catalog }] = await Promise.all([
    pool.query<GrantedAccessQueryRow>(
      `select ar.id, ar.decision_at, ar.requested_system_name, cat.name as catalog_name,
              req.full_name as requester_full_name, req.email as requester_email
       from access_requests ar
       left join access_catalog cat on cat.id = ar.system_id
       join profiles req on req.id = ar.requester_id
       where ar.status = 'aprovado'
       order by ar.decision_at desc`
    ),
    pool.query<{ id: string; full_name: string; email: string }>(
      "select id, full_name, email from profiles where is_active = true order by full_name"
    ),
    pool.query<{ id: string; name: string }>(
      "select id, name from access_catalog where is_active = true order by name"
    ),
  ]);

  const grants: GrantedAccessRow[] = rows.map((row) => ({
    id: row.id,
    decision_at: row.decision_at,
    requested_system_name: row.requested_system_name,
    access_catalog: row.catalog_name ? { name: row.catalog_name } : null,
    requester: { full_name: row.requester_full_name, email: row.requester_email },
  }));

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Acessos concedidos"
        description="Quem tem acesso a cada sistema hoje, e a opção de revogar quando necessário."
        actions={
          <Modal
            title="Conceder acesso"
            description="Registra que o colaborador já tem acesso a um sistema, sem passar pelo fluxo de solicitação e aprovação."
            trigger={
              <Button variant="primary">
                <Plus className="h-4 w-4" aria-hidden />
                Conceder acesso
              </Button>
            }
          >
            <GrantAccessForm action={grantAccessAction} profiles={profiles} catalog={catalog} />
          </Modal>
        }
      />

      <GrantedAccessList grants={grants} />
    </>
  );
}
