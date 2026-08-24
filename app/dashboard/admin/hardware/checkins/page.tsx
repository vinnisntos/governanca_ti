import { Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

export default async function HardwareMaintenanceQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error: errorMessage, success: successMessage } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // O middleware já bloqueia quem não é admin_ti; a autoridade real é a
  // policy hardware_checkins_update_admin (RLS).
  const { data: checkins } = await supabase
    .from("hardware_checkins")
    .select(
      "id, physical_condition, condition_notes, maintenance_details, maintenance_resolved, admin_notes, photo_storage_path, created_at, hardware_assets(asset_tag, model), profiles(full_name, email)"
    )
    .eq("maintenance_requested", true)
    .order("maintenance_resolved", { ascending: true })
    .order("created_at", { ascending: false })
    .returns<MaintenanceRow[]>();

  const photoUrlById = new Map<string, string>();
  for (const checkin of checkins ?? []) {
    const { data } = await supabase.storage
      .from("hardware-checkin-photos")
      .createSignedUrl(checkin.photo_storage_path, 60 * 10);
    if (data?.signedUrl) photoUrlById.set(checkin.id, data.signedUrl);
  }

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Fila de manutenção"
        back={{ href: "/dashboard/admin/hardware", label: "Inventário de hardware" }}
      />

      <Section>
        {!checkins || checkins.length === 0 ? (
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

                  {photoUrlById.has(checkin.id) ? (
                    <a
                      href={photoUrlById.get(checkin.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-sm text-primary-700 underline-offset-2 hover:underline"
                    >
                      Ver foto do check-in
                    </a>
                  ) : null}

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
