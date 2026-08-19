"use client";

import * as React from "react";
import { ListChecks, Pencil, Trash2 } from "lucide-react";
import {
  deleteCatalogItemAction,
  toggleCatalogItemActiveAction,
  updateCatalogItemAction,
} from "./actions";
import type { CatalogRow } from "./page";
import { matchesSearch } from "@/lib/utils/normalize-text";
import { SearchInput } from "@/components/ui/search-input";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { badgeClassName } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

type Department = { id: string; name: string };

export function CatalogList({ catalog, departments }: { catalog: CatalogRow[]; departments: Department[] }) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(
    () => catalog.filter((item) => matchesSearch(query, item.name, item.description)),
    [catalog, query]
  );

  if (catalog.length === 0) {
    return <EmptyState icon={ListChecks} title="Nenhum sistema cadastrado ainda" />;
  }

  return (
    <div className="space-y-4">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscar por nome ou descrição..."
        aria-label="Buscar sistema"
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <EmptyState icon={ListChecks} title={`Nenhum sistema encontrado para "${query}"`} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => (
            <li key={item.id}>
              <Card className="flex items-start justify-between gap-3 p-4">
                <div>
                  <p className="font-medium text-slate-900">{item.name}</p>
                  {item.description ? <p className="text-sm text-slate-600">{item.description}</p> : null}
                  {item.departments?.name ? (
                    <p className="text-xs text-slate-400">Depto.: {item.departments.name}</p>
                  ) : null}
                  {item.monthly_cost != null ? (
                    <p className="text-xs text-slate-400">
                      Custo:{" "}
                      {Number(item.monthly_cost).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                      /mês
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <form action={toggleCatalogItemActiveAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="next_active" value={(!item.is_active).toString()} />
                    <button type="submit" className={badgeClassName(item.is_active ? "success" : "neutral")}>
                      {item.is_active ? "Ativo" : "Inativo"}
                    </button>
                  </form>

                  <div className="flex items-center gap-1.5">
                    <Modal
                      title="Editar sistema"
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={`Editar ${item.name}`}>
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                      }
                    >
                      <form action={updateCatalogItemAction} className="space-y-4">
                        <input type="hidden" name="id" value={item.id} />

                        <Field label="Nome do sistema" htmlFor={`name-${item.id}`} required>
                          <Input id={`name-${item.id}`} name="name" required minLength={2} defaultValue={item.name} />
                        </Field>

                        <Field label="Descrição" htmlFor={`description-${item.id}`} hint="Opcional">
                          <Textarea
                            id={`description-${item.id}`}
                            name="description"
                            rows={2}
                            defaultValue={item.description ?? ""}
                          />
                        </Field>

                        <Field
                          label="Custo mensal da licença (R$)"
                          htmlFor={`monthly_cost-${item.id}`}
                          hint="Opcional"
                        >
                          <Input
                            id={`monthly_cost-${item.id}`}
                            name="monthly_cost"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={item.monthly_cost ?? ""}
                          />
                        </Field>

                        <Field
                          label="Departamento responsável"
                          htmlFor={`owner_department_id-${item.id}`}
                          hint="Opcional"
                        >
                          <Select
                            id={`owner_department_id-${item.id}`}
                            name="owner_department_id"
                            defaultValue={item.owner_department_id ?? ""}
                          >
                            <option value="">Nenhum</option>
                            {departments.map((department) => (
                              <option key={department.id} value={department.id}>
                                {department.name}
                              </option>
                            ))}
                          </Select>
                        </Field>

                        <div className="flex justify-end">
                          <SubmitButton variant="primary" pendingLabel="Salvando...">
                            Salvar alterações
                          </SubmitButton>
                        </div>
                      </form>
                    </Modal>

                    <form action={deleteCatalogItemAction}>
                      <input type="hidden" name="id" value={item.id} />
                      <ConfirmSubmitButton
                        size="icon"
                        aria-label={`Excluir ${item.name}`}
                        title={`Excluir "${item.name}"?`}
                        description="Essa ação não pode ser desfeita. Se houver solicitações de acesso vinculadas a este sistema, a exclusão será bloqueada — desative-o nesse caso."
                        confirmLabel="Excluir"
                        cancelLabel="Cancelar"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
