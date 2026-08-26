import { Plus } from "lucide-react";
import { pool } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { createUserAction } from "./actions";
import { UserList } from "./user-list";
import { TempPasswordAlert } from "./temp-password-alert";
import { readTempPasswordFlash } from "@/lib/utils/temp-password-flash";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Section } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";

export type UserRole = "colaborador" | "gestor" | "rh" | "admin_ti";

export type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  department_id: string | null;
  manager_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
  departments: { name: string } | null;
  manager_full_name: string | null;
};

type UserQueryRow = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  department_id: string | null;
  manager_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
  department_name: string | null;
};

type DepartmentRow = { id: string; name: string };

export default async function UsersAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error: errorMessage, success: successMessage } = await searchParams;
  // app/dashboard/admin/layout.tsx já garante admin_ti — aqui não há mais
  // RLS/policy alguma restringindo linhas: admin vê todos os perfis.
  const session = await getSession();

  // manager_id referencia a própria tabela profiles: resolvemos o nome do
  // gestor com um mapa em memória (tabela pequena; não justifica subquery
  // por linha) em vez de um self-join que exigiria alias duplicado.
  const [{ rows: rawUsers }, { rows: departments }, tempPassword] = await Promise.all([
    pool.query<UserQueryRow>(
      `select p.id, p.full_name, p.email, p.role, p.department_id, p.manager_id,
              p.is_active, p.must_change_password, d.name as department_name
       from profiles p
       left join departments d on d.id = p.department_id
       order by p.full_name`
    ),
    pool.query<DepartmentRow>("select id, name from departments order by name"),
    readTempPasswordFlash(),
  ]);

  const nameById = new Map(rawUsers.map((u) => [u.id, u.full_name]));
  const users: UserRow[] = rawUsers.map((u) => ({
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    role: u.role,
    department_id: u.department_id,
    manager_id: u.manager_id,
    is_active: u.is_active,
    must_change_password: u.must_change_password,
    departments: u.department_name ? { name: u.department_name } : null,
    manager_full_name: u.manager_id ? (nameById.get(u.manager_id) ?? null) : null,
  }));

  // Candidatos a gestor: quem pode efetivamente decidir uma solicitação em
  // "Aprovações pendentes" (ver app/dashboard/approvals/page.tsx) é admin_ti
  // ou quem tem role = 'gestor' — atribuir manager_id a alguém fora desses
  // papéis deixaria o colaborador sem ninguém que consiga aprová-lo.
  const managers = users.filter((u) => u.role === "gestor" || u.role === "admin_ti");

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Usuários"
        description="Papel, departamento e gestor de cada usuário — o gestor definido aqui é quem enxerga e decide as solicitações de acesso da pessoa em 'Aprovações pendentes'."
        actions={
          <Modal
            title="Novo usuário"
            trigger={
              <Button variant="primary">
                <Plus className="h-4 w-4" aria-hidden />
                Novo usuário
              </Button>
            }
          >
            <form action={createUserAction} className="space-y-4">
              <Field label="Nome completo" htmlFor="full_name" required>
                <Input id="full_name" name="full_name" required minLength={2} placeholder="Ex.: Maria Silva" />
              </Field>

              <Field label="E-mail" htmlFor="email" required hint="Vai ser o login do usuário">
                <Input id="email" name="email" type="email" required placeholder="nome@empresa.com" />
              </Field>

              <Field label="Papel" htmlFor="role" required>
                <Select id="role" name="role" defaultValue="colaborador">
                  <option value="colaborador">Colaborador</option>
                  <option value="gestor">Gestor</option>
                  <option value="rh">RH</option>
                  <option value="admin_ti">Admin TI</option>
                </Select>
              </Field>

              <Field label="Departamento" htmlFor="department_id" hint="Opcional">
                <Select id="department_id" name="department_id" defaultValue="">
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
                htmlFor="manager_id"
                hint="Quem vai decidir as solicitações de acesso deste usuário"
              >
                <Select id="manager_id" name="manager_id" defaultValue="">
                  <option value="">Sem gestor</option>
                  {managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.full_name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="flex justify-end">
                <SubmitButton variant="primary" pendingLabel="Criando...">
                  Criar usuário
                </SubmitButton>
              </div>
            </form>
          </Modal>
        }
      />

      {tempPassword ? <TempPasswordAlert email={tempPassword.email} password={tempPassword.password} /> : null}

      <Section title="Usuários cadastrados">
        <UserList users={users} departments={departments} managers={managers} currentUserId={session!.id} />
      </Section>
    </>
  );
}
