import { Plus, Wrench } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/session";
import { createHardwareAssetAction } from "./actions";
import { CATEGORY_LABELS, STATUS_LABELS } from "./labels";
import type { AssetRow, ContractRow } from "./types";
import { AssetList } from "./asset-list";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Section } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button, LinkButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";

export default async function HardwareAdminPage({
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
        description="Ativos cadastrados, seus responsáveis e status de uso."
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
        <AssetList
          assets={(assets ?? []).map((asset) => {
            const contract = latestContractByAsset.get(asset.id) ?? null;
            return {
              ...asset,
              contract,
              contractSignedUrl: contract ? signedUrlByContractId.get(contract.id) ?? null : null,
            };
          })}
          profiles={profiles ?? []}
        />
      </Section>
    </>
  );
}
