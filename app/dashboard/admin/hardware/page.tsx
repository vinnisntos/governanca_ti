import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createHardwareAssetAction,
  updateHardwareAssetStatusAction,
  uploadHardwareContractAction,
} from "./actions";

const CATEGORY_LABELS: Record<string, string> = {
  notebook: "Notebook",
  desktop: "Desktop",
  monitor: "Monitor",
  periferico: "Periférico",
  celular: "Celular",
  outro: "Outro",
};

const STATUS_LABELS: Record<string, string> = {
  em_estoque: "Em estoque",
  em_uso: "Em uso",
  em_manutencao: "Em manutenção",
  baixado: "Baixado",
  extraviado: "Extraviado",
};

type AssetRow = {
  id: string;
  asset_tag: string;
  category: string;
  model: string;
  serial_number: string;
  status: string;
  assigned_to: string | null;
  profiles: { full_name: string; email: string } | null;
};

type ContractRow = {
  id: string;
  asset_id: string;
  signed_at: string | null;
  storage_path: string;
};

export default async function HardwareAdminPage({
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

  const [{ data: assets }, { data: profiles }, { data: contracts }] = await Promise.all([
    supabase
      .from("hardware_assets")
      .select("id, asset_tag, category, model, serial_number, status, assigned_to, profiles(full_name, email)")
      .order("asset_tag")
      .returns<AssetRow[]>(),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("is_active", true)
      .order("full_name"),
    supabase
      .from("hardware_contracts")
      .select("id, asset_id, signed_at, storage_path")
      .order("created_at", { ascending: false })
      .returns<ContractRow[]>(),
  ]);

  // Contrato mais recente por ativo, com link assinado de curta duração
  // (o bucket é privado — não existe URL pública para um contrato).
  const latestContractByAsset = new Map<string, ContractRow>();
  for (const contract of contracts ?? []) {
    if (!latestContractByAsset.has(contract.asset_id)) {
      latestContractByAsset.set(contract.asset_id, contract);
    }
  }

  const signedUrlByContractId = new Map<string, string>();
  for (const contract of latestContractByAsset.values()) {
    const { data } = await supabase.storage
      .from("hardware-contracts")
      .createSignedUrl(contract.storage_path, 60 * 10);
    if (data?.signedUrl) signedUrlByContractId.set(contract.id, data.signedUrl);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inventário de Hardware</h1>
        <div className="flex items-center gap-4">
          <Link href="/dashboard/admin/hardware/checkins" className="text-sm text-slate-500 underline">
            Fila de manutenção
          </Link>
          <Link href="/dashboard" className="text-sm text-slate-500 underline">
            Voltar
          </Link>
        </div>
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

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Novo ativo</h2>
        <form action={createHardwareAssetAction} className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="asset_tag" className="text-sm font-medium">Patrimônio</label>
            <input id="asset_tag" name="asset_tag" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label htmlFor="serial_number" className="text-sm font-medium">Número de série</label>
            <input id="serial_number" name="serial_number" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label htmlFor="category" className="text-sm font-medium">Categoria</label>
            <select id="category" name="category" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="model" className="text-sm font-medium">Modelo</label>
            <input id="model" name="model" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label htmlFor="status" className="text-sm font-medium">Status inicial</label>
            <select id="status" name="status" defaultValue="em_estoque" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="assigned_to" className="text-sm font-medium">Responsável (opcional)</label>
            <select id="assigned_to" name="assigned_to" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">Nenhum</option>
              {(profiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Cadastrar ativo
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Ativos cadastrados</h2>
        {!assets || assets.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum ativo cadastrado ainda.</p>
        ) : (
          <ul className="space-y-4">
            {assets.map((asset) => {
              const contract = latestContractByAsset.get(asset.id);
              return (
                <li key={asset.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {asset.asset_tag} — {CATEGORY_LABELS[asset.category]} {asset.model}
                      </p>
                      <p className="text-sm text-slate-500">N/S: {asset.serial_number}</p>
                      <p className="text-sm text-slate-500">
                        {asset.profiles ? `Com: ${asset.profiles.full_name} (${asset.profiles.email})` : "Sem responsável"}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                      {STATUS_LABELS[asset.status]}
                    </span>
                  </div>

                  <form action={updateHardwareAssetStatusAction} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="asset_id" value={asset.id} />
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500">Status</label>
                      <select name="status" defaultValue={asset.status} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500">Responsável</label>
                      <select name="assigned_to" defaultValue={asset.assigned_to ?? ""} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                        <option value="">Nenhum</option>
                        {(profiles ?? []).map((p) => (
                          <option key={p.id} value={p.id}>{p.full_name}</option>
                        ))}
                      </select>
                    </div>
                    <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
                      Atualizar
                    </button>
                  </form>

                  <div className="mt-3 border-t border-slate-100 pt-3">
                    {contract ? (
                      <p className="text-sm text-slate-600">
                        Contrato assinado em {contract.signed_at ? new Date(contract.signed_at).toLocaleDateString("pt-BR") : "—"}
                        {signedUrlByContractId.has(contract.id) ? (
                          <>
                            {" "}
                            —{" "}
                            <a href={signedUrlByContractId.get(contract.id)} target="_blank" rel="noreferrer" className="underline">
                              ver PDF
                            </a>
                          </>
                        ) : null}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-500">Nenhum contrato anexado.</p>
                    )}

                    {asset.assigned_to ? (
                      <form action={uploadHardwareContractAction} className="mt-2 flex items-center gap-2">
                        <input type="hidden" name="asset_id" value={asset.id} />
                        <input type="hidden" name="profile_id" value={asset.assigned_to} />
                        <input type="file" name="file" accept="application/pdf" required className="text-sm" />
                        <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
                          Anexar contrato (PDF)
                        </button>
                      </form>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400">
                        Atribua um responsável para poder anexar o contrato.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
