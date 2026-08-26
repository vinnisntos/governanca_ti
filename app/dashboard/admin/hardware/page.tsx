import { Plus, Wrench } from "lucide-react";
import { pool } from "@/lib/db/client";
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

type AssetQueryRow = {
  id: string;
  asset_tag: string;
  category: string;
  model: string;
  serial_number: string;
  status: string;
  assigned_to: string | null;
  profile_full_name: string | null;
  profile_email: string | null;
};

type ProfileOption = { id: string; full_name: string; email: string };

export default async function HardwareAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error: errorMessage, success: successMessage } = await searchParams;

  const [{ rows: rawAssets }, { rows: profiles }, { rows: contracts }] = await Promise.all([
    pool.query<AssetQueryRow>(
      `select ha.id, ha.asset_tag, ha.category, ha.model, ha.serial_number, ha.status, ha.assigned_to,
              p.full_name as profile_full_name, p.email as profile_email
       from hardware_assets ha
       left join profiles p on p.id = ha.assigned_to
       order by ha.asset_tag`
    ),
    pool.query<ProfileOption>(
      "select id, full_name, email from profiles where is_active = true order by full_name"
    ),
    pool.query<ContractRow>(
      "select id, asset_id, signed_at, storage_path from hardware_contracts order by created_at desc"
    ),
  ]);

  const assets: AssetRow[] = rawAssets.map((a) => ({
    id: a.id,
    asset_tag: a.asset_tag,
    category: a.category as AssetRow["category"],
    model: a.model,
    serial_number: a.serial_number,
    status: a.status as AssetRow["status"],
    assigned_to: a.assigned_to,
    profiles: a.profile_full_name ? { full_name: a.profile_full_name, email: a.profile_email! } : null,
  }));

  // Contrato mais recente por ativo. O link de download passa por uma
  // Route Handler autenticada (app/dashboard/hardware/contratos/[contractId])
  // que confere posse/papel a cada requisição — não existe mais URL
  // assinada de curta duração porque não existe mais bucket privado do
  // Supabase Storage.
  const latestContractByAsset = new Map<string, ContractRow>();
  for (const contract of contracts) {
    if (!latestContractByAsset.has(contract.asset_id)) {
      latestContractByAsset.set(contract.asset_id, contract);
    }
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
                    {profiles.map((p) => (
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
          assets={assets.map((asset) => {
            const contract = latestContractByAsset.get(asset.id) ?? null;
            return {
              ...asset,
              contract,
              contractSignedUrl: contract ? `/dashboard/hardware/contratos/${contract.id}` : null,
            };
          })}
          profiles={profiles}
        />
      </Section>
    </>
  );
}
