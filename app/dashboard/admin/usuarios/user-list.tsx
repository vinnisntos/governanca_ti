"use client";

import * as React from "react";
import { KeyRound, Pencil, Users as UsersIcon } from "lucide-react";
import { resetUserPasswordAction, updateUserAction } from "./actions";
import type { UserRole, UserRow } from "./page";
import { matchesSearch } from "@/lib/utils/normalize-text";
import { SearchInput } from "@/components/ui/search-input";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { badgeClassName } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

type Department = { id: string; name: string };
type ManagerOption = { id: string; full_name: string; role: UserRole };

const ROLE_LABELS: Record<UserRole, string> = {
  colaborador: "Colaborador",
  gestor: "Gestor",
  rh: "RH",
  admin_ti: "Admin TI",
};

export function UserList({
  users,
  departments,
  managers,
  currentUserId,
}: {
  users: UserRow[];
  departments: Department[];
  managers: ManagerOption[];
  currentUserId: string;
}) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(
    () => users.filter((item) => matchesSearch(query, item.full_name, item.email)),
    [users, query]
  );

  if (users.length === 0) {
    return <EmptyState icon={UsersIcon} title="Nenhum usuário cadastrado ainda" />;
  }

  return (
    <div className="space-y-4">
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Buscar por nome ou e-mail..."
        aria-label="Buscar usuário"
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <EmptyState icon={UsersIcon} title={`Nenhum usuário encontrado para "${query}"`} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => (
            <li key={item.id}>
              <Card className="flex items-start justify-between gap-3 p-4">
                <div>
                  <p className="font-medium text-slate-900">{item.full_name}</p>
                  <p className="text-sm text-slate-600">{item.email}</p>
                  <p className="text-xs text-slate-400">
                    {ROLE_LABELS[item.role]}
                    {item.departments?.name ? ` · ${item.departments.name}` : ""}
                    {" · "}
                    {item.manager_full_name ? `Gestor: ${item.manager_full_name}` : "Sem gestor definido"}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="flex items-center gap-1.5">
                    {item.must_change_password ? (
                      <span className={badgeClassName("warning")}>Aguardando 1º acesso</span>
                    ) : null}
                    <span className={badgeClassName(item.is_active ? "success" : "neutral")}>
                      {item.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </div>

                  {item.id === currentUserId ? (
                    <span className="text-xs italic text-slate-400">Você</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <form action={resetUserPasswordAction}>
                        <input type="hidden" name="id" value={item.id} />
                        <ConfirmSubmitButton
                          variant="ghost"
                          size="icon"
                          aria-label={`Redefinir senha de ${item.full_name}`}
                          title={`Redefinir a senha de ${item.full_name}?`}
                          description="Uma nova senha provisória será gerada e ele(a) precisará trocá-la no próximo login."
                          confirmLabel="Redefinir senha"
                          cancelLabel="Cancelar"
                        >
                          <KeyRound className="h-4 w-4" aria-hidden />
                        </ConfirmSubmitButton>
                      </form>

                      <Modal
                        title={`Editar ${item.full_name}`}
                        trigger={
                          <Button variant="ghost" size="icon" aria-label={`Editar ${item.full_name}`}>
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Button>
                        }
                      >
                      <form action={updateUserAction} className="space-y-4">
                        <input type="hidden" name="id" value={item.id} />

                        <Field label="Papel" htmlFor={`role-${item.id}`} required>
                          <Select id={`role-${item.id}`} name="role" defaultValue={item.role}>
                            <option value="colaborador">Colaborador</option>
                            <option value="gestor">Gestor</option>
                            <option value="rh">RH</option>
                            <option value="admin_ti">Admin TI</option>
                          </Select>
                        </Field>

                        <Field label="Departamento" htmlFor={`department_id-${item.id}`} hint="Opcional">
                          <Select
                            id={`department_id-${item.id}`}
                            name="department_id"
                            defaultValue={item.department_id ?? ""}
                          >
                            <option value="">Nenhum</option>
                            {departments.map((department) => (
                              <option key={department.id} value={department.id}>
                                {department.name}
                              </option>
                            ))}
                          </Select>
                        </Field>

                        <Field
                          label="Gestor responsável"
                          htmlFor={`manager_id-${item.id}`}
                          hint="Quem decide as solicitações de acesso deste usuário em 'Aprovações pendentes'"
                        >
                          <Select id={`manager_id-${item.id}`} name="manager_id" defaultValue={item.manager_id ?? ""}>
                            <option value="">Sem gestor</option>
                            {managers
                              .filter((manager) => manager.id !== item.id)
                              .map((manager) => (
                                <option key={manager.id} value={manager.id}>
                                  {manager.full_name} ({ROLE_LABELS[manager.role]})
                                </option>
                              ))}
                          </Select>
                        </Field>

                        <Field label="Situação" htmlFor={`is_active-${item.id}`}>
                          <Select
                            id={`is_active-${item.id}`}
                            name="is_active"
                            defaultValue={item.is_active ? "true" : "false"}
                          >
                            <option value="true">Ativo</option>
                            <option value="false">Inativo</option>
                          </Select>
                        </Field>

                        <div className="flex justify-end">
                          <SubmitButton variant="primary" pendingLabel="Salvando...">
                            Salvar alterações
                          </SubmitButton>
                        </div>
                      </form>
                      </Modal>
                    </div>
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
