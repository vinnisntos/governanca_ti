import { Plus } from "lucide-react";
import { pool } from "@/lib/db/client";
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

  // app/dashboard/admin/layout.tsx já garante admin_ti — sem RLS, esta
  // página vê todos os departamentos.
  const { rows: departments } = await pool.query<DepartmentRow>(
    "select id, name from departments order by name"
  );

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
        <DepartmentList departments={departments} />
      </Section>
    </>
  );
}
