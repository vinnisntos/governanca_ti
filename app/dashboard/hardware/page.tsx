import { CheckCircle2, ClipboardEdit, Laptop2 } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { currentReferenceMonth } from "@/lib/utils/reference-month";
import { submitCheckinAction } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { FileInput } from "@/components/ui/file-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button, LinkButton } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

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
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Meu(s) equipamento(s)"
        description="Envie o check-in mensal e acompanhe o histórico dos seus equipamentos."
      />

      {latestContract ? (
        <Card className="mb-6 flex items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Termo de responsabilidade assinado em{" "}
            {latestContract.signed_at ? new Date(latestContract.signed_at).toLocaleDateString("pt-BR") : "—"}
          </p>
          {contractUrl ? (
            <LinkButton href={contractUrl} target="_blank" rel="noreferrer" variant="outline" size="sm">
              Ver PDF
            </LinkButton>
          ) : null}
        </Card>
      ) : null}

      {!assets || assets.length === 0 ? (
        <EmptyState
          icon={Laptop2}
          title="Nenhum equipamento vinculado"
          description="Quando um equipamento for atribuído a você, ele vai aparecer aqui para o check-in mensal."
        />
      ) : (
        <ul className="space-y-4">
          {assets.map((asset) => {
            const alreadyDone = checkinsThisMonth.has(asset.id);
            const history = (checkins ?? []).filter((c) => c.asset_id === asset.id);

            return (
              <li key={asset.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <Laptop2 className="h-4 w-4" aria-hidden />
                      </div>
                      <p className="font-medium text-slate-900">
                        {asset.asset_tag} — {CATEGORY_LABELS[asset.category]} {asset.model}
                      </p>
                    </div>

                    {alreadyDone ? (
                      <Badge tone="success">
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                        Check-in enviado
                      </Badge>
                    ) : (
                      <Modal
                        title="Check-in mensal"
                        description={`${asset.asset_tag} — ${CATEGORY_LABELS[asset.category]} ${asset.model}`}
                        trigger={
                          <Button variant="primary" size="sm">
                            <ClipboardEdit className="h-4 w-4" aria-hidden />
                            Fazer check-in deste mês
                          </Button>
                        }
                      >
                        <form
                          action={submitCheckinAction}
                          className="space-y-4"
                          encType="multipart/form-data"
                        >
                          <input type="hidden" name="asset_id" value={asset.id} />

                          <Field label="Foto atual do equipamento" htmlFor={`photo-${asset.id}`} required>
                            <FileInput
                              id={`photo-${asset.id}`}
                              name="photo"
                              accept="image/jpeg,image/png,image/webp"
                              required
                            />
                          </Field>

                          <Field label="Estado físico" htmlFor={`condition-${asset.id}`} required>
                            <Select id={`condition-${asset.id}`} name="physical_condition" required>
                              {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </Select>
                          </Field>

                          <Field label="Observações" htmlFor={`notes-${asset.id}`} hint="Opcional">
                            <Textarea id={`notes-${asset.id}`} name="condition_notes" rows={2} />
                          </Field>

                          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                              <Checkbox name="maintenance_requested" />
                              Solicitar manutenção/revisão
                            </label>
                            <Textarea
                              name="maintenance_details"
                              rows={2}
                              placeholder="Descreva o problema, se marcou a opção acima"
                            />
                          </div>

                          <div className="flex justify-end">
                            <SubmitButton variant="primary" pendingLabel="Enviando...">
                              Enviar check-in
                            </SubmitButton>
                          </div>
                        </form>
                      </Modal>
                    )}
                  </div>

                  {history.length > 0 ? (
                    <details className="mt-3 text-sm text-slate-500">
                      <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-800">
                        Histórico de check-ins ({history.length})
                      </summary>
                      <ul className="mt-2 space-y-1 border-l border-slate-200 pl-3">
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
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
