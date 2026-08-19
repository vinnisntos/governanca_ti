import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

export default async function UsersAdminPage({
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

  // O middleware já bloqueia quem não é admin_ti de chegar nesta página; a
  // autoridade real continua sendo a policy profiles_update.
  //
  // Não usamos o embed automático do PostgREST (profiles!manager_id(...))
  // aqui: como manager_id referencia a própria tabela profiles, o PostgREST
  // não consegue inferir a direção da relação e resolve como "quem esta
  // pessoa gerencia" em vez de "quem é o gestor desta pessoa" — o nome do
  // gestor sai sempre vazio. Resolvemos manualmente com um mapa em memória
  // (a tabela de usuários é pequena; não justifica outra query por linha).
  const [{ data: rawUsers }, { data: departments }, tempPassword] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, email, role, department_id, manager_id, is_active, must_change_password, departments(name)"
      )
      .order("full_name")
      .returns<Omit<UserRow, "manager_full_name">[]>(),
    supabase.from("departments").select("id, name").order("name"),
    readTempPasswordFlash(),
  ]);

  const nameById = new Map((rawUsers ?? []).map((u) => [u.id, u.full_name]));
  const users: UserRow[] = (rawUsers ?? []).map((u) => ({
    ...u,
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
                  {(departments ?? []).map((department) => (
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
        <UserList
          users={users ?? []}
          departments={departments ?? []}
          managers={managers}
          currentUserId={user.id}
        />
      </Section>
    </>
  );
}
