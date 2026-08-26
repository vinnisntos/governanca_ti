"use client";

import * as React from "react";
import { ShieldOff, ShieldX } from "lucide-react";
import { revokeAccessAction } from "./actions";
import type { GrantedAccessRow } from "./page";
import { formatDateBR } from "@/lib/utils/format-datetime";
import { matchesSearch } from "@/lib/utils/normalize-text";
import { SearchInput } from "@/components/ui/search-input";
import { Card, Section } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

function systemName(row: GrantedAccessRow) {
  return row.access_catalog?.name ?? row.requested_system_name ?? "Sistema removido";
}

export function GrantedAccessList({ grants }: { grants: GrantedAccessRow[] }) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(
    () =>
      grants.filter((row) =>
        matchesSearch(query, systemName(row), row.requester?.full_name, row.requester?.email)
      ),
    [grants, query]
  );

  const grouped = React.useMemo(() => {
    const map = new Map<string, GrantedAccessRow[]>();
    for (const row of filtered) {
      const key = systemName(row);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [filtered]);

  if (grants.length === 0) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="Nenhum acesso concedido no momento"
        description="Assim que uma solicitação for aprovada, ela aparece aqui."
      />
    );
  }

  return (
    <div className="space-y-4">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscar por sistema, nome ou e-mail..."
        aria-label="Buscar acesso concedido"
        className="max-w-sm"
      />

      {grouped.length === 0 ? (
        <EmptyState icon={ShieldOff} title={`Nenhum acesso encontrado para "${query}"`} />
      ) : (
        <div className="space-y-6">
          {grouped.map(([system, rows]) => (
            <Section key={system} title={`${system} · ${rows.length} usuário${rows.length === 1 ? "" : "s"}`}>
              <ul className="space-y-3">
                {rows.map((row) => (
                  <li key={row.id}>
                    <Card className="flex items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-medium text-slate-900">{row.requester?.full_name}</p>
                        <p className="text-sm text-slate-600">{row.requester?.email}</p>
                        {row.decision_at ? (
                          <p className="text-xs text-slate-600">
                            Aprovado em {formatDateBR(row.decision_at)}
                          </p>
                        ) : null}
                      </div>

                      <Modal
                        title="Revogar acesso"
                        description={`${row.requester?.full_name ?? "Este usuário"} vai perder o acesso a ${system}.`}
                        trigger={
                          <Button variant="destructive" size="sm">
                            <ShieldX className="h-4 w-4" aria-hidden />
                            Revogar
                          </Button>
                        }
                      >
                        <form action={revokeAccessAction} className="space-y-4">
                          <input type="hidden" name="request_id" value={row.id} />
                          <Field label="Motivo da revogação" htmlFor={`reason-${row.id}`} required>
                            <Textarea id={`reason-${row.id}`} name="revoke_reason" rows={2} required minLength={10} />
                          </Field>
                          <div className="flex justify-end">
                            <ConfirmSubmitButton
                              variant="destructive"
                              title={`Revogar acesso de ${row.requester?.full_name ?? "este usuário"}?`}
                              description="A ação é imediata e não pode ser desfeita."
                              confirmLabel="Revogar acesso"
                              cancelLabel="Voltar"
                            >
                              Revogar acesso
                            </ConfirmSubmitButton>
                          </div>
                        </form>
                      </Modal>
                    </Card>
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}
    </div>
  );
}
