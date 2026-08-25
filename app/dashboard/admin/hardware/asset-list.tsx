"use client";

import * as React from "react";
import { Boxes } from "lucide-react";
import { updateHardwareAssetStatusAction, uploadHardwareContractAction } from "./actions";
import { CATEGORY_LABELS, STATUS_LABELS, STATUS_TONE } from "./labels";
import type { AssetWithContract } from "./types";
import { matchesSearch } from "@/lib/utils/normalize-text";
import { SearchInput } from "@/components/ui/search-input";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { FileInput } from "@/components/ui/file-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

type Profile = { id: string; full_name: string; email: string };

export function AssetList({ assets, profiles }: { assets: AssetWithContract[]; profiles: Profile[] }) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(
    () =>
      assets.filter((asset) =>
        matchesSearch(query, asset.asset_tag, asset.model, asset.serial_number, asset.profiles?.full_name)
      ),
    [assets, query]
  );

  if (assets.length === 0) {
    return <EmptyState icon={Boxes} title="Nenhum ativo cadastrado ainda" />;
  }

  return (
    <div className="space-y-4">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscar por patrimônio, modelo, série ou responsável..."
        aria-label="Buscar ativo"
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <EmptyState icon={Boxes} title={`Nenhum ativo encontrado para "${query}"`} />
      ) : (
        <ul className="space-y-4">
          {filtered.map((asset) => (
            <li key={asset.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {asset.asset_tag} — {CATEGORY_LABELS[asset.category] ?? asset.category} {asset.model}
                    </p>
                    <p className="text-sm text-slate-600">N/S: {asset.serial_number}</p>
                    <p className="text-sm text-slate-600">
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
                    <Select id={`assigned-${asset.id}`} name="assigned_to" defaultValue={asset.assigned_to ?? ""}>
                      <option value="">Nenhum</option>
                      {profiles.map((p) => (
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
                  {asset.contract ? (
                    <p className="text-sm text-slate-600">
                      Contrato assinado em{" "}
                      {asset.contract.signed_at ? new Date(asset.contract.signed_at).toLocaleDateString("pt-BR") : "—"}
                      {asset.contractSignedUrl ? (
                        <>
                          {" "}
                          —{" "}
                          <a
                            href={asset.contractSignedUrl}
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
                    <p className="text-sm text-slate-600">Nenhum contrato anexado.</p>
                  )}

                  {asset.assigned_to ? (
                    <form action={uploadHardwareContractAction} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="asset_id" value={asset.id} />
                      <input type="hidden" name="profile_id" value={asset.assigned_to} />
                      <FileInput name="file" accept="application/pdf" required className="max-w-xs" />
                      <SubmitButton variant="outline" size="sm" pendingLabel="Enviando...">
                        Anexar contrato (PDF)
                      </SubmitButton>
                    </form>
                  ) : (
                    <p className="mt-2 text-xs text-slate-600">
                      Atribua um responsável para poder anexar o contrato.
                    </p>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
