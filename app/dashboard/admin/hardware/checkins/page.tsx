import { Wrench } from "lucide-react";
import { pool } from "@/lib/db/client";
import { resolveMaintenanceAction } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Card, Section } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const CONDITION_LABELS: Record<string, string> = {
  otimo: "Ótimo",
  bom: "Bom",
  regular: "Regular",
  com_defeito: "Com defeito",
};

type MaintenanceRow = {
  id: string;
  physical_condition: string;
  condition_notes: string | null;
  maintenance_details: string | null;
  maintenance_resolved: boolean;
  admin_notes: string | null;
  photo_storage_path: string;
  created_at: string;
  hardware_assets: { asset_tag: string; model: string } | null;
  profiles: { full_name: string; email: string } | null;
};

type MaintenanceQueryRow = {
  id: string;
  physical_condition: string;
  condition_notes: string | null;
  maintenance_details: string | null;
  maintenance_resolved: boolean;
  admin_notes: string | null;
  photo_storage_path: string;
  created_at: string;
  asset_tag: string | null;
  asset_model: string | null;
  profile_full_name: string | null;
  profile_email: string | null;
};

export default async function HardwareMaintenanceQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error: errorMessage, success: successMessage } = await searchParams;

  // app/dashboard/admin/layout.tsx já garante admin_ti.
  const { rows: rawCheckins } = await pool.query<MaintenanceQueryRow>(
    `select hc.id, hc.physical_condition, hc.condition_notes, hc.maintenance_details,
            hc.maintenance_resolved, hc.admin_notes, hc.photo_storage_path, hc.created_at,
            ha.asset_tag, ha.model as asset_model, p.full_name as profile_full_name, p.email as profile_email
     from hardware_checkins hc
     left join hardware_assets ha on ha.id = hc.asset_id
     left join profiles p on p.id = hc.profile_id
     where hc.maintenance_requested = true
     order by hc.maintenance_resolved asc, hc.created_at desc`
  );

  const checkins: MaintenanceRow[] = rawCheckins.map((c) => ({
    id: c.id,
    physical_condition: c.physical_condition,
    condition_notes: c.condition_notes,
    maintenance_details: c.maintenance_details,
    maintenance_resolved: c.maintenance_resolved,
    admin_notes: c.admin_notes,
    photo_storage_path: c.photo_storage_path,
    created_at: c.created_at,
    hardware_assets: c.asset_tag ? { asset_tag: c.asset_tag, model: c.asset_model! } : null,
    profiles: c.profile_full_name ? { full_name: c.profile_full_name, email: c.profile_email! } : null,
  }));

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Fila de manutenção"
        back={{ href: "/dashboard/admin/hardware", label: "Inventário de hardware" }}
      />

      <Section>
        {checkins.length === 0 ? (
          <EmptyState icon={Wrench} title="Nenhuma solicitação de manutenção registrada" />
        ) : (
          <ul className="space-y-4">
            {checkins.map((checkin) => (
              <li key={checkin.id}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {checkin.hardware_assets?.asset_tag} — {checkin.hardware_assets?.model}
                      </p>
                      <p className="text-sm text-slate-600">
                        {checkin.profiles?.full_name} ({checkin.profiles?.email})
                      </p>
                      <p className="text-sm text-slate-600">
                        Estado reportado: {CONDITION_LABELS[checkin.physical_condition]}
                      </p>
                    </div>
                    <Badge tone={checkin.maintenance_resolved ? "success" : "warning"}>
                      {checkin.maintenance_resolved ? "Resolvido" : "Pendente"}
                    </Badge>
                  </div>

                  <p className="mt-2 text-sm text-slate-700">{checkin.maintenance_details}</p>
                  {checkin.condition_notes ? (
                    <p className="mt-1 text-sm text-slate-600">Obs.: {checkin.condition_notes}</p>
                  ) : null}

                  <a
                    href={`/dashboard/admin/hardware/checkins/${checkin.id}/foto`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm text-primary-700 underline-offset-2 hover:underline"
                  >
                    Ver foto do check-in
                  </a>

                  {checkin.maintenance_resolved ? (
                    checkin.admin_notes ? (
                      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        Nota do admin: {checkin.admin_notes}
                      </p>
                    ) : null
                  ) : (
                    <form action={resolveMaintenanceAction} className="mt-3 space-y-2">
                      <input type="hidden" name="checkin_id" value={checkin.id} />
                      <Textarea
                        name="admin_notes"
                        rows={2}
                        placeholder="Nota sobre a resolução (opcional)"
                      />
                      <SubmitButton variant="primary" size="sm" pendingLabel="Salvando...">
                        Marcar como resolvido
                      </SubmitButton>
                    </form>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
