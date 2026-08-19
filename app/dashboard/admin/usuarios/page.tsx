import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UserList } from "./user-list";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Section } from "@/components/ui/card";

export type UserRole = "colaborador" | "gestor" | "rh" | "admin_ti";

export type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  department_id: string | null;
  manager_id: string | null;
  is_active: boolean;
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
  const [{ data: rawUsers }, { data: departments }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, department_id, manager_id, is_active, departments(name)")
      .order("full_name")
      .returns<Omit<UserRow, "manager_full_name">[]>(),
    supabase.from("departments").select("id, name").order("name"),
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
      />

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
