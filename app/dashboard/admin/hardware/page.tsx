import { Boxes, Plus, Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createHardwareAssetAction,
  updateHardwareAssetStatusAction,
  uploadHardwareContractAction,
} from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Card, Section } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FileInput } from "@/components/ui/file-input";
import { Button, LinkButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const CATEGORY_LABELS: Record<string, string> = {
  notebook: "Notebook",
  desktop: "Desktop",
  monitor: "Monitor",
  periferico: "Periférico",
  celular: "Celular",
  outro: "Outro",
};

const STATUS_LABELS = {
  em_estoque: "Em estoque",
  em_uso: "Em uso",
  em_manutencao: "Em manutenção",
  baixado: "Baixado",
  extraviado: "Extraviado",
} as const;

const STATUS_TONE = {
  em_estoque: "neutral",
  em_uso: "success",
  em_manutencao: "warning",
  baixado: "neutral",
  extraviado: "danger",
} as const satisfies Record<keyof typeof STATUS_LABELS, BadgeTone>;

type AssetRow = {
  id: string;
  asset_tag: string;
  category: string;
  model: string;
  serial_number: string;
  status: keyof typeof STATUS_LABELS;
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
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Inventário de Hardware"
        actions={
          <>
            <LinkButton href="/dashboard/admin/hardware/checkins" variant="outline">
              <Wrench className="h-4 w-4" aria-hidden />
              Fila de manutenção
            </LinkButton>
            <Modal
              title="Novo ativo"
              size="lg"
              trigger={
                <Button variant="primary">
                  <Plus className="h-4 w-4" aria-hidden />
                  Novo ativo
                </Button>
              }
            >
              <form action={createHardwareAssetAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Patrimônio" htmlFor="asset_tag" required>
                  <Input id="asset_tag" name="asset_tag" required />
                </Field>
                <Field label="Número de série" htmlFor="serial_number" required>
                  <Input id="serial_number" name="serial_number" required />
                </Field>
                <Field label="Categoria" htmlFor="category" required>
                  <Select id="category" name="category" required>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Modelo" htmlFor="model" required>
                  <Input id="model" name="model" required />
                </Field>
                <Field label="Status inicial" htmlFor="status" required>
                  <Select id="status" name="status" defaultValue="em_estoque" required>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Responsável" htmlFor="assigned_to" hint="Opcional">
                  <Select id="assigned_to" name="assigned_to" defaultValue="">
                    <option value="">Nenhum</option>
                    {(profiles ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} ({p.email})
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="flex justify-end sm:col-span-2">
                  <SubmitButton variant="primary" pendingLabel="Cadastrando...">
                    Cadastrar ativo
                  </SubmitButton>
                </div>
              </form>
            </Modal>
          </>
        }
      />

      <Section title="Ativos cadastrados">
        {!assets || assets.length === 0 ? (
          <EmptyState icon={Boxes} title="Nenhum ativo cadastrado ainda" />
        ) : (
          <ul className="space-y-4">
            {assets.map((asset) => {
              const contract = latestContractByAsset.get(asset.id);
              return (
                <li key={asset.id}>
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          {asset.asset_tag} — {CATEGORY_LABELS[asset.category]} {asset.model}
                        </p>
                        <p className="text-sm text-slate-500">N/S: {asset.serial_number}</p>
                        <p className="text-sm text-slate-500">
                          {asset.profiles ? `Com: ${asset.profiles.full_name} (${asset.profiles.email})` : "Sem responsável"}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONE[asset.status]}>{STATUS_LABELS[asset.status]}</Badge>
                    </div>

                    <form
                      action={updateHardwareAssetStatusAction}
                      className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                    >
                      <input type="hidden" name="asset_id" value={asset.id} />
                      <Field label="Status" htmlFor={`status-${asset.id}`}>
                        <Select id={`status-${asset.id}`} name="status" defaultValue={asset.status}>
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Responsável" htmlFor={`assigned-${asset.id}`}>
                        <Select
                          id={`assigned-${asset.id}`}
                          name="assigned_to"
                          defaultValue={asset.assigned_to ?? ""}
                        >
                          <option value="">Nenhum</option>
                          {(profiles ?? []).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.full_name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <SubmitButton variant="outline" size="md" pendingLabel="Atualizando...">
                        Atualizar
                      </SubmitButton>
                    </form>

                    <div className="mt-3 border-t border-slate-100 pt-3">
                      {contract ? (
                        <p className="text-sm text-slate-600">
                          Contrato assinado em{" "}
                          {contract.signed_at ? new Date(contract.signed_at).toLocaleDateString("pt-BR") : "—"}
                          {signedUrlByContractId.has(contract.id) ? (
                            <>
                              {" "}
                              —{" "}
                              <a
                                href={signedUrlByContractId.get(contract.id)}
                                target="_blank"
                                rel="noreferrer"
                                className="underline-offset-2 hover:underline"
                              >
                                ver PDF
                              </a>
                            </>
                          ) : null}
                        </p>
                      ) : (
                        <p className="text-sm text-slate-500">Nenhum contrato anexado.</p>
                      )}

                      {asset.assigned_to ? (
                        <form
                          action={uploadHardwareContractAction}
                          className="mt-2 flex flex-wrap items-center gap-2"
                        >
                          <input type="hidden" name="asset_id" value={asset.id} />
                          <input type="hidden" name="profile_id" value={asset.assigned_to} />
                          <FileInput name="file" accept="application/pdf" required className="max-w-xs" />
                          <SubmitButton variant="outline" size="sm" pendingLabel="Enviando...">
                            Anexar contrato (PDF)
                          </SubmitButton>
                        </form>
                      ) : (
                        <p className="mt-2 text-xs text-slate-400">
                          Atribua um responsável para poder anexar o contrato.
                        </p>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
