import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveMaintenanceAction } from "./actions";

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
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Fila de manutenção</h1>
        <Link href="/dashboard/admin/hardware" className="text-sm text-slate-500 underline">
          Voltar ao inventário
        </Link>
      </div>

      {errorMessage ? (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
      {successMessage ? (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {successMessage}
        </p>
      ) : null}

      {!checkins || checkins.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma solicitação de manutenção registrada.</p>
      ) : (
        <ul className="space-y-4">
          {checkins.map((checkin) => (
            <li key={checkin.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {checkin.hardware_assets?.asset_tag} — {checkin.hardware_assets?.model}
                  </p>
                  <p className="text-sm text-slate-500">
                    {checkin.profiles?.full_name} ({checkin.profiles?.email})
                  </p>
                  <p className="text-sm text-slate-500">
                    Estado reportado: {CONDITION_LABELS[checkin.physical_condition]}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    checkin.maintenance_resolved
                      ? "bg-green-100 text-green-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {checkin.maintenance_resolved ? "Resolvido" : "Pendente"}
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-700">{checkin.maintenance_details}</p>
              {checkin.condition_notes ? (
                <p className="mt-1 text-sm text-slate-500">Obs.: {checkin.condition_notes}</p>
              ) : null}

              {photoUrlById.has(checkin.id) ? (
                <a
                  href={photoUrlById.get(checkin.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm underline"
                >
                  Ver foto do check-in
                </a>
              ) : null}

              {checkin.maintenance_resolved ? (
                checkin.admin_notes ? (
                  <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    Nota do admin: {checkin.admin_notes}
                  </p>
                ) : null
              ) : (
                <form action={resolveMaintenanceAction} className="mt-3 space-y-2">
                  <input type="hidden" name="checkin_id" value={checkin.id} />
                  <textarea
                    name="admin_notes"
                    rows={2}
                    placeholder="Nota sobre a resolução (opcional)"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">
                    Marcar como resolvido
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
