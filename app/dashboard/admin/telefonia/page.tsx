import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/session";
import { createMobileLineAction } from "./actions";
import { LINE_TYPE_LABELS, STATUS_LABELS } from "./labels";
import { LineList } from "./line-list";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Section } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { StatCard } from "@/components/ui/stat-card";

export type MobileLineRow = {
  id: string;
  phone_number: string;
  carrier: string;
  plan_name: string;
  monthly_cost: number;
  line_type: string;
  status: keyof typeof STATUS_LABELS;
  assigned_to: string | null;
  department_id: string | null;
  profiles: { full_name: string; email: string } | null;
  departments: { name: string } | null;
};

export default async function TelefoniaAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error: errorMessage, success: successMessage } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: lines }, { data: profiles }, { data: departments }] = await Promise.all([
    supabase
      .from("mobile_lines")
      .select(
        "id, phone_number, carrier, plan_name, monthly_cost, line_type, status, assigned_to, department_id, profiles(full_name, email), departments(name)"
      )
      .order("phone_number")
      .returns<MobileLineRow[]>(),
    supabase.from("profiles").select("id, full_name, email").eq("is_active", true).order("full_name"),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  const totalMonthlyCost = (lines ?? [])
    .filter((l) => l.status === "ativa")
    .reduce((sum, l) => sum + Number(l.monthly_cost), 0);

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Telefonia e Linhas Móveis"
        description="Linhas corporativas cadastradas, seus responsáveis e status."
        actions={
          <Modal
            title="Nova linha"
            size="lg"
            trigger={
              <Button variant="primary">
                <Plus className="h-4 w-4" aria-hidden />
                Nova linha
              </Button>
            }
          >
            <form action={createMobileLineAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Número" htmlFor="phone_number" required>
                <Input id="phone_number" name="phone_number" required placeholder="5511999999999" />
              </Field>
              <Field label="Operadora" htmlFor="carrier" required>
                <Input id="carrier" name="carrier" required />
              </Field>
              <Field label="Plano" htmlFor="plan_name" required>
                <Input id="plan_name" name="plan_name" required />
              </Field>
              <Field label="Custo mensal (R$)" htmlFor="monthly_cost" required>
                <Input id="monthly_cost" name="monthly_cost" type="number" step="0.01" min="0" required />
              </Field>
              <Field label="Tipo" htmlFor="line_type" required>
                <Select id="line_type" name="line_type" required>
                  {Object.entries(LINE_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status" htmlFor="status" required>
                <Select id="status" name="status" defaultValue="ativa" required>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Responsável" htmlFor="assigned_to" hint="Opcional">
                <Select id="assigned_to" name="assigned_to" defaultValue="">
                  <option value="">Nenhum</option>
                  {(profiles ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.email})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Setor" htmlFor="department_id" hint="Opcional">
                <Select id="department_id" name="department_id" defaultValue="">
                  <option value="">Nenhum</option>
                  {(departments ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex justify-end sm:col-span-2">
                <SubmitButton variant="primary" pendingLabel="Cadastrando...">
                  Cadastrar linha
                </SubmitButton>
              </div>
            </form>
          </Modal>
        }
      />

      <StatCard
        className="mb-6 max-w-xs"
        label="Custo mensal total (linhas ativas)"
        value={totalMonthlyCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
      />

      <Section title="Linhas cadastradas">
        <LineList lines={lines ?? []} profiles={profiles ?? []} departments={departments ?? []} />
      </Section>
    </>
  );
}
