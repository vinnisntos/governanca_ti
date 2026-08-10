import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  line_type: string;
  status: string;
};

export default async function TelefoniaPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // A policy mobile_lines_select só retorna linhas com assigned_to = próprio
  // usuário (ou tudo, se admin) — esta página não filtra nada por conta
  // própria, só exibe o que o banco já devolveu.
  const { data: lines } = await supabase
    .from("mobile_lines")
    .select("id, phone_number, carrier, plan_name, line_type, status")
    .eq("assigned_to", user.id)
    .returns<MobileLineRow[]>();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Minhas linhas telefônicas</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 underline">
          Voltar
        </Link>
      </div>

      {!lines || lines.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nenhuma linha telefônica corporativa vinculada ao seu usuário.
        </p>
      ) : (
        <ul className="space-y-3">
          {lines.map((line) => (
            <li key={line.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{line.phone_number}</p>
                  <p className="text-sm text-slate-500">
                    {line.carrier} — {line.plan_name} ({LINE_TYPE_LABELS[line.line_type]})
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {STATUS_LABELS[line.status]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
