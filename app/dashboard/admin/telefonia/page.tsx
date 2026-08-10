import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createMobileLineAction, updateMobileLineAction } from "./actions";

const LINE_TYPE_LABELS: Record<string, string> = {
  sim_fisico: "SIM físico",
  esim: "eSIM",
};

const STATUS_LABELS: Record<string, string> = {
  ativa: "Ativa",
  suspensa: "Suspensa",
  cancelada: "Cancelada",
};

type MobileLineRow = {
  id: string;
  phone_number: string;
  carrier: string;
  plan_name: string;
  monthly_cost: number;
  line_type: string;
  status: string;
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Telefonia e Linhas Móveis</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 underline">
          Voltar
        </Link>
      </div>

      {errorMessage ? (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
      {successMessage ? (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {successMessage}
        </p>
      ) : null}

      <p className="mb-6 text-sm text-slate-500">
        Custo mensal total (linhas ativas): {totalMonthlyCost.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
      </p>

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Nova linha</h2>
        <form action={createMobileLineAction} className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="phone_number" className="text-sm font-medium">Número</label>
            <input id="phone_number" name="phone_number" required placeholder="5511999999999" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label htmlFor="carrier" className="text-sm font-medium">Operadora</label>
            <input id="carrier" name="carrier" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label htmlFor="plan_name" className="text-sm font-medium">Plano</label>
            <input id="plan_name" name="plan_name" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label htmlFor="monthly_cost" className="text-sm font-medium">Custo mensal (R$)</label>
            <input id="monthly_cost" name="monthly_cost" type="number" step="0.01" min="0" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label htmlFor="line_type" className="text-sm font-medium">Tipo</label>
            <select id="line_type" name="line_type" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {Object.entries(LINE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="status" className="text-sm font-medium">Status</label>
            <select id="status" name="status" defaultValue="ativa" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="assigned_to" className="text-sm font-medium">Responsável (opcional)</label>
            <select id="assigned_to" name="assigned_to" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">Nenhum</option>
              {(profiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="department_id" className="text-sm font-medium">Setor (opcional)</label>
            <select id="department_id" name="department_id" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">Nenhum</option>
              {(departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Cadastrar linha
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Linhas cadastradas</h2>
        {!lines || lines.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma linha cadastrada ainda.</p>
        ) : (
          <ul className="space-y-4">
            {lines.map((line) => (
              <li key={line.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{line.phone_number} — {LINE_TYPE_LABELS[line.line_type]}</p>
                    <p className="text-sm text-slate-500">
                      {line.profiles ? `Com: ${line.profiles.full_name} (${line.profiles.email})` : line.departments ? `Setor: ${line.departments.name}` : "Sem responsável"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                    {STATUS_LABELS[line.status]}
                  </span>
                </div>

                <form action={updateMobileLineAction} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <input type="hidden" name="id" value={line.id} />
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Operadora</label>
                    <input name="carrier" defaultValue={line.carrier} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Plano</label>
                    <input name="plan_name" defaultValue={line.plan_name} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Custo (R$)</label>
                    <input name="monthly_cost" type="number" step="0.01" min="0" defaultValue={line.monthly_cost} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Tipo</label>
                    <select name="line_type" defaultValue={line.line_type} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
                      {Object.entries(LINE_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Status</label>
                    <select name="status" defaultValue={line.status} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Responsável</label>
                    <select name="assigned_to" defaultValue={line.assigned_to ?? ""} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
                      <option value="">Nenhum</option>
                      {(profiles ?? []).map((p) => (
                        <option key={p.id} value={p.id}>{p.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500">Setor</label>
                    <select name="department_id" defaultValue={line.department_id ?? ""} className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
                      <option value="">Nenhum</option>
                      {(departments ?? []).map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
                      Atualizar
                    </button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
