import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { currentReferenceMonth } from "@/lib/utils/reference-month";
import { submitCheckinAction } from "./actions";

const CATEGORY_LABELS: Record<string, string> = {
  notebook: "Notebook",
  desktop: "Desktop",
  monitor: "Monitor",
  periferico: "Periférico",
  celular: "Celular",
  outro: "Outro",
};

const CONDITION_LABELS: Record<string, string> = {
  otimo: "Ótimo",
  bom: "Bom",
  regular: "Regular",
  com_defeito: "Com defeito",
};

type AssetRow = {
  id: string;
  asset_tag: string;
  category: string;
  model: string;
  status: string;
};

type CheckinRow = {
  id: string;
  asset_id: string;
  reference_month: string;
  physical_condition: string;
  maintenance_requested: boolean;
  maintenance_resolved: boolean;
  created_at: string;
};

type ContractRow = {
  id: string;
  storage_path: string;
  signed_at: string | null;
};

export default async function HardwarePage({
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

  const [{ data: assets }, { data: checkins }, { data: contracts }] = await Promise.all([
    supabase
      .from("hardware_assets")
      .select("id, asset_tag, category, model, status")
      .eq("assigned_to", user.id)
      .returns<AssetRow[]>(),
    supabase
      .from("hardware_checkins")
      .select("id, asset_id, reference_month, physical_condition, maintenance_requested, maintenance_resolved, created_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .returns<CheckinRow[]>(),
    supabase
      .from("hardware_contracts")
      .select("id, storage_path, signed_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .returns<ContractRow[]>(),
  ]);

  const referenceMonth = currentReferenceMonth();
  const checkinsThisMonth = new Set(
    (checkins ?? []).filter((c) => c.reference_month === referenceMonth).map((c) => c.asset_id)
  );

  const latestContract = contracts?.[0];
  let contractUrl: string | null = null;
  if (latestContract) {
    const { data } = await supabase.storage
      .from("hardware-contracts")
      .createSignedUrl(latestContract.storage_path, 60 * 10);
    contractUrl = data?.signedUrl ?? null;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Meu(s) equipamento(s)</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 underline">
          Voltar
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

      {latestContract ? (
        <p className="mb-6 text-sm text-slate-600">
          Termo de responsabilidade assinado em{" "}
          {latestContract.signed_at ? new Date(latestContract.signed_at).toLocaleDateString("pt-BR") : "—"}
          {contractUrl ? (
            <>
              {" "}
              —{" "}
              <a href={contractUrl} target="_blank" rel="noreferrer" className="underline">
                ver PDF
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      {!assets || assets.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nenhum equipamento vinculado ao seu usuário no momento.
        </p>
      ) : (
        <ul className="space-y-6">
          {assets.map((asset) => {
            const alreadyDone = checkinsThisMonth.has(asset.id);
            const history = (checkins ?? []).filter((c) => c.asset_id === asset.id);

            return (
              <li key={asset.id} className="rounded-lg border border-slate-200 bg-white p-5">
                <p className="font-medium">
                  {asset.asset_tag} — {CATEGORY_LABELS[asset.category]} {asset.model}
                </p>

                {alreadyDone ? (
                  <p className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                    Check-in deste mês já enviado. Obrigado!
                  </p>
                ) : (
                  <form action={submitCheckinAction} className="mt-3 space-y-3" encType="multipart/form-data">
                    <input type="hidden" name="asset_id" value={asset.id} />

                    <div className="space-y-1">
                      <label htmlFor={`photo-${asset.id}`} className="text-sm font-medium">
                        Foto atual do equipamento
                      </label>
                      <input
                        id={`photo-${asset.id}`}
                        name="photo"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        required
                        className="block w-full text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor={`condition-${asset.id}`} className="text-sm font-medium">
                        Estado físico
                      </label>
                      <select
                        id={`condition-${asset.id}`}
                        name="physical_condition"
                        required
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      >
                        {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label htmlFor={`notes-${asset.id}`} className="text-sm font-medium">
                        Observações (opcional)
                      </label>
                      <textarea
                        id={`notes-${asset.id}`}
                        name="condition_notes"
                        rows={2}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="maintenance_requested" />
                        Solicitar manutenção/revisão
                      </label>
                      <textarea
                        name="maintenance_details"
                        rows={2}
                        placeholder="Descreva o problema, se marcou a opção acima"
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>

                    <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                      Enviar check-in
                    </button>
                  </form>
                )}

                {history.length > 0 ? (
                  <details className="mt-3 text-sm text-slate-500">
                    <summary className="cursor-pointer">Histórico de check-ins</summary>
                    <ul className="mt-2 space-y-1">
                      {history.map((c) => (
                        <li key={c.id}>
                          {new Date(c.created_at).toLocaleDateString("pt-BR")} — {CONDITION_LABELS[c.physical_condition]}
                          {c.maintenance_requested
                            ? c.maintenance_resolved
                              ? " — manutenção resolvida"
                              : " — manutenção pendente"
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
