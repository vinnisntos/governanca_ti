import { ListChecks, Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCatalogItemAction, toggleCatalogItemActiveAction } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Card, Section } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { badgeClassName } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

type CatalogRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  monthly_cost: number | null;
  departments: { name: string } | null;
};

export default async function AccessCatalogAdminPage({
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
  // autoridade real continua sendo a policy access_catalog_write_admin.
  const [{ data: catalog }, { data: departments }] = await Promise.all([
    supabase
      .from("access_catalog")
      .select("id, name, description, is_active, monthly_cost, departments(name)")
      .order("name")
      .returns<CatalogRow[]>(),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Catálogo de Acessos"
        description="Sistemas disponíveis para solicitação de acesso pelos colaboradores."
        actions={
          <Modal
            title="Novo sistema"
            trigger={
              <Button variant="primary">
                <Plus className="h-4 w-4" aria-hidden />
                Novo sistema
              </Button>
            }
          >
            <form action={createCatalogItemAction} className="space-y-4">
              <Field label="Nome do sistema" htmlFor="name" required>
                <Input id="name" name="name" required minLength={2} placeholder="Ex.: CRM, Figma, ERP" />
              </Field>

              <Field label="Descrição" htmlFor="description" hint="Opcional">
                <Textarea id="description" name="description" rows={2} />
              </Field>

              <Field label="Custo mensal da licença (R$)" htmlFor="monthly_cost" hint="Opcional">
                <Input id="monthly_cost" name="monthly_cost" type="number" step="0.01" min="0" />
              </Field>

              <Field label="Departamento responsável" htmlFor="owner_department_id" hint="Opcional">
                <Select id="owner_department_id" name="owner_department_id" defaultValue="">
                  <option value="">Nenhum</option>
                  {(departments ?? []).map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="flex justify-end">
                <SubmitButton variant="primary" pendingLabel="Adicionando...">
                  Adicionar ao catálogo
                </SubmitButton>
              </div>
            </form>
          </Modal>
        }
      />

      <Section title="Sistemas cadastrados">
        {!catalog || catalog.length === 0 ? (
          <EmptyState icon={ListChecks} title="Nenhum sistema cadastrado ainda" />
        ) : (
          <ul className="space-y-3">
            {catalog.map((item) => (
              <li key={item.id}>
                <Card className="flex items-start justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium text-slate-900">{item.name}</p>
                    {item.description ? (
                      <p className="text-sm text-slate-600">{item.description}</p>
                    ) : null}
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

                  <form action={toggleCatalogItemActiveAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="next_active" value={(!item.is_active).toString()} />
                    <button
                      type="submit"
                      className={badgeClassName(item.is_active ? "success" : "neutral")}
                    >
                      {item.is_active ? "Ativo" : "Inativo"}
                    </button>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
