import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutAction } from "./actions";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // A leitura abaixo só retorna o próprio perfil (ou mais, se admin/gestor/RH)
  // por força da policy `profiles_select` no banco — não por confiança nesta
  // página.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            Olá, {profile?.full_name ?? user.email}
          </h1>
          <p className="text-sm text-slate-500">
            Papel: {profile?.role ?? "desconhecido"}
          </p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            Sair
          </button>
        </form>
      </div>

      <nav className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/dashboard/access-requests"
          className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-sm hover:border-slate-300"
        >
          Minhas solicitações de acesso
        </Link>

        {profile?.role === "gestor" || profile?.role === "admin_ti" ? (
          <Link
            href="/dashboard/approvals"
            className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-sm hover:border-slate-300"
          >
            Aprovações pendentes
          </Link>
        ) : null}

        {profile?.role === "admin_ti" ? (
          <Link
            href="/dashboard/admin/catalogo"
            className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-sm hover:border-slate-300"
          >
            Catálogo de Acessos (admin)
          </Link>
        ) : null}

        <Link
          href="/dashboard/hardware"
          className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-sm hover:border-slate-300"
        >
          Meu(s) equipamento(s) / check-in
        </Link>

        {profile?.role === "admin_ti" ? (
          <>
            <Link
              href="/dashboard/admin/hardware"
              className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-sm hover:border-slate-300"
            >
              Inventário de Hardware (admin)
            </Link>
            <Link
              href="/dashboard/admin/hardware/checkins"
              className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-sm hover:border-slate-300"
            >
              Fila de manutenção (admin)
            </Link>
          </>
        ) : null}

        <Link
          href="/dashboard/telefonia"
          className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-sm hover:border-slate-300"
        >
          Minhas linhas telefônicas
        </Link>

        {profile?.role === "admin_ti" ? (
          <Link
            href="/dashboard/admin/telefonia"
            className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-sm hover:border-slate-300"
          >
            Telefonia (admin)
          </Link>
        ) : null}

        <Link
          href="/dashboard/wiki"
          className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-sm hover:border-slate-300"
        >
          Base de Conhecimento
        </Link>

        {profile?.role === "admin_ti" ? (
          <Link
            href="/dashboard/admin/relatorios"
            className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-medium shadow-sm hover:border-slate-300"
          >
            Dashboard Executivo (admin)
          </Link>
        ) : null}
      </nav>
    </main>
  );
}
