import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDepartmentAction } from "./actions";
import { DepartmentList } from "./department-list";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Section } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";

export type DepartmentRow = { id: string; name: string };

export default async function DepartmentsAdminPage({
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
  // autoridade real continua sendo a policy departments_write_admin.
  const { data: departments } = await supabase
    .from("departments")
    .select("id, name")
    .order("name")
    .returns<DepartmentRow[]>();

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Departamentos"
        description="Departamentos da organização — usados para associar usuários, sistemas do catálogo e linhas móveis."
        actions={
          <Modal
            title="Novo departamento"
            trigger={
              <Button variant="primary">
                <Plus className="h-4 w-4" aria-hidden />
                Novo departamento
              </Button>
            }
          >
            <form action={createDepartmentAction} className="space-y-4">
              <Field label="Nome do departamento" htmlFor="name" required>
                <Input id="name" name="name" required minLength={2} placeholder="Ex.: TI, Financeiro..." autoFocus />
              </Field>

              <div className="flex justify-end">
                <SubmitButton variant="primary" pendingLabel="Adicionando...">
                  Adicionar departamento
                </SubmitButton>
              </div>
            </form>
          </Modal>
        }
      />

      <Section title="Departamentos cadastrados">
        <DepartmentList departments={departments ?? []} />
      </Section>
    </>
  );
}
