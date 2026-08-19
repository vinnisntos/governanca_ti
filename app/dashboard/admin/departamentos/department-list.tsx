"use client";

import * as React from "react";
import { Building2, Pencil, Trash2 } from "lucide-react";
import { deleteDepartmentAction, updateDepartmentAction } from "./actions";
import type { DepartmentRow } from "./page";
import { matchesSearch } from "@/lib/utils/normalize-text";
import { SearchInput } from "@/components/ui/search-input";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

export function DepartmentList({ departments }: { departments: DepartmentRow[] }) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(
    () => departments.filter((item) => matchesSearch(query, item.name)),
    [departments, query]
  );

  if (departments.length === 0) {
    return <EmptyState icon={Building2} title="Nenhum departamento cadastrado ainda" />;
  }

  return (
    <div className="space-y-4">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscar por nome..."
        aria-label="Buscar departamento"
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <EmptyState icon={Building2} title={`Nenhum departamento encontrado para "${query}"`} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => (
            <li key={item.id}>
              <Card className="flex items-center justify-between gap-3 p-4">
                <p className="font-medium text-slate-900">{item.name}</p>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Modal
                    title="Editar departamento"
                    trigger={
                      <Button variant="ghost" size="icon" aria-label={`Editar ${item.name}`}>
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                    }
                  >
                    <form action={updateDepartmentAction} className="space-y-4">
                      <input type="hidden" name="id" value={item.id} />

                      <Field label="Nome do departamento" htmlFor={`name-${item.id}`} required>
                        <Input id={`name-${item.id}`} name="name" required minLength={2} defaultValue={item.name} />
                      </Field>

                      <div className="flex justify-end">
                        <SubmitButton variant="primary" pendingLabel="Salvando...">
                          Salvar alterações
                        </SubmitButton>
                      </div>
                    </form>
                  </Modal>

                  <form action={deleteDepartmentAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <ConfirmSubmitButton
                      size="icon"
                      aria-label={`Excluir ${item.name}`}
                      title={`Excluir "${item.name}"?`}
                      description="Essa ação não pode ser desfeita. Se houver usuários, sistemas do catálogo ou linhas móveis vinculados a este departamento, a exclusão será bloqueada."
                      confirmLabel="Excluir"
                      cancelLabel="Cancelar"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
