"use client";

import * as React from "react";
import { Phone } from "lucide-react";
import { updateMobileLineAction } from "./actions";
import { LINE_TYPE_LABELS, STATUS_LABELS, STATUS_TONE } from "./labels";
import type { MobileLineRow } from "./page";
import { matchesSearch } from "@/lib/utils/normalize-text";
import { SearchInput } from "@/components/ui/search-input";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

type Profile = { id: string; full_name: string; email: string };
type Department = { id: string; name: string };

export function LineList({
  lines,
  profiles,
  departments,
}: {
  lines: MobileLineRow[];
  profiles: Profile[];
  departments: Department[];
}) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(
    () =>
      lines.filter((line) =>
        matchesSearch(
          query,
          line.phone_number,
          line.carrier,
          line.plan_name,
          line.profiles?.full_name,
          line.departments?.name
        )
      ),
    [lines, query]
  );

  if (lines.length === 0) {
    return <EmptyState icon={Phone} title="Nenhuma linha cadastrada ainda" />;
  }

  return (
    <div className="space-y-4">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscar por número, operadora, plano, responsável ou setor..."
        aria-label="Buscar linha"
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <EmptyState icon={Phone} title={`Nenhuma linha encontrada para "${query}"`} />
      ) : (
        <ul className="space-y-4">
          {filtered.map((line) => (
            <li key={line.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {line.phone_number} — {LINE_TYPE_LABELS[line.line_type] ?? line.line_type}
                    </p>
                    <p className="text-sm text-slate-600">
                      {line.profiles
                        ? `Com: ${line.profiles.full_name} (${line.profiles.email})`
                        : line.departments
                          ? `Setor: ${line.departments.name}`
                          : "Sem responsável"}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[line.status]}>{STATUS_LABELS[line.status]}</Badge>
                </div>

                <form
                  action={updateMobileLineAction}
                  className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4"
                >
                  <input type="hidden" name="id" value={line.id} />
                  <Field label="Operadora" htmlFor={`carrier-${line.id}`}>
                    <Input id={`carrier-${line.id}`} name="carrier" defaultValue={line.carrier} />
                  </Field>
                  <Field label="Plano" htmlFor={`plan-${line.id}`}>
                    <Input id={`plan-${line.id}`} name="plan_name" defaultValue={line.plan_name} />
                  </Field>
                  <Field label="Custo (R$)" htmlFor={`cost-${line.id}`} hint="Use ponto para casas decimais, ex.: 49.90">
                    <Input
                      id={`cost-${line.id}`}
                      name="monthly_cost"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={line.monthly_cost}
                    />
                  </Field>
                  <Field label="Tipo" htmlFor={`type-${line.id}`}>
                    <Select id={`type-${line.id}`} name="line_type" defaultValue={line.line_type}>
                      {Object.entries(LINE_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Status" htmlFor={`status-${line.id}`}>
                    <Select id={`status-${line.id}`} name="status" defaultValue={line.status}>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Responsável" htmlFor={`assigned-${line.id}`}>
                    <Select id={`assigned-${line.id}`} name="assigned_to" defaultValue={line.assigned_to ?? ""}>
                      <option value="">Nenhum</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Setor" htmlFor={`dept-${line.id}`}>
                    <Select id={`dept-${line.id}`} name="department_id" defaultValue={line.department_id ?? ""}>
                      <option value="">Nenhum</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="flex items-end">
                    <SubmitButton variant="outline" pendingLabel="Atualizando...">
                      Atualizar
                    </SubmitButton>
                  </div>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
