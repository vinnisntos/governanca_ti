import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { currentReferenceMonth } from "@/lib/utils/reference-month";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Módulo 5: Relatórios e Auditoria (Dashboard Executivo).
// Autorização real é a policy audit_logs_select_admin (RLS) — só admin_ti
// consegue de fato ler audit_logs; o middleware bloqueando /dashboard/admin
// para quem não é admin_ti é só o atalho de UX.

const ACCESS_REQUEST_STATUSES = [
  "pendente",
  "em_analise",
  "aprovado",
  "negado",
  "cancelado",
] as const;

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendentes",
  em_analise: "Em análise",
  aprovado: "Aprovadas",
  negado: "Negadas",
  cancelado: "Canceladas",
};

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Criação",
  UPDATE: "Alteração",
  DELETE: "Exclusão",
};

type DeniedRequestRow = {
  id: string;
  review_notes: string | null;
  decision_at: string | null;
  access_catalog: { name: string } | null;
  requester: { full_name: string } | null;
};

type PendingCheckinAssetRow = {
  id: string;
  asset_tag: string;
  profiles: { full_name: string } | null;
};

type AuditLogRow = {
  id: number;
  table_name: string;
  action: string;
  created_at: string;
  profiles: { full_name: string } | null;
};

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function ExecutiveDashboardPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const referenceMonth = currentReferenceMonth();

  const [
    statusCounts,
    { data: deniedRequests },
    { data: activeLines },
    { data: activeLicenses },
    { count: assignedAssetsCount },
    { count: checkinsThisMonthCount },
    { data: assignedAssets },
    { data: checkinsThisMonth },
    { data: auditLogs },
  ] = await Promise.all([
    Promise.all(
      ACCESS_REQUEST_STATUSES.map((status) =>
        supabase
          .from("access_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", status)
          .then(({ count }) => ({ status, count: count ?? 0 }))
      )
    ),
    supabase
      .from("access_requests")
      .select(
        "id, review_notes, decision_at, access_catalog(name), requester:profiles!access_requests_requester_id_fkey(full_name)"
      )
      .eq("status", "negado")
      .order("decision_at", { ascending: false })
      .limit(10)
      .returns<DeniedRequestRow[]>(),
    supabase.from("mobile_lines").select("monthly_cost").eq("status", "ativa"),
    supabase.from("access_catalog").select("monthly_cost").eq("is_active", true),
    supabase.from("hardware_assets").select("id", { count: "exact", head: true }).not("assigned_to", "is", null),
    supabase
      .from("hardware_checkins")
      .select("id", { count: "exact", head: true })
      .eq("reference_month", referenceMonth),
    supabase
      .from("hardware_assets")
      .select("id, asset_tag, profiles(full_name)")
      .not("assigned_to", "is", null)
      .returns<PendingCheckinAssetRow[]>(),
    supabase.from("hardware_checkins").select("asset_id").eq("reference_month", referenceMonth),
    supabase
      .from("audit_logs")
      .select("id, table_name, action, created_at, profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<AuditLogRow[]>(),
  ]);

  const telefoniaCost = (activeLines ?? []).reduce((sum, l) => sum + Number(l.monthly_cost ?? 0), 0);
  const licensesCost = (activeLicenses ?? []).reduce((sum, l) => sum + Number(l.monthly_cost ?? 0), 0);

  const checkedInAssetIds = new Set((checkinsThisMonth ?? []).map((c) => c.asset_id));
  const pendingCheckinAssets = (assignedAssets ?? []).filter((a) => !checkedInAssetIds.has(a.id));
  const adherenceRate =
    assignedAssetsCount && assignedAssetsCount > 0
      ? Math.round(((checkinsThisMonthCount ?? 0) / assignedAssetsCount) * 100)
      : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard Executivo</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 underline">
          Voltar
        </Link>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Solicitações de acesso</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {statusCounts.map(({ status, count }) => (
            <div key={status} className="rounded-lg border border-slate-200 bg-white p-4 text-center">
              <p className="text-2xl font-semibold">{count}</p>
              <p className="text-xs text-slate-500">{STATUS_LABELS[status]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Recusas recentes (com motivo)</h2>
        {!deniedRequests || deniedRequests.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma solicitação recusada até o momento.</p>
        ) : (
          <ul className="space-y-2">
            {deniedRequests.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <span className="font-medium">{r.access_catalog?.name ?? "Sistema removido"}</span>
                {" — "}
                {r.requester?.full_name ?? "Colaborador removido"}
                {r.decision_at ? ` (${new Date(r.decision_at).toLocaleDateString("pt-BR")})` : ""}
                {r.review_notes ? <p className="mt-1 text-slate-500">Motivo: {r.review_notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Custo mensal — Telefonia</p>
          <p className="text-xl font-semibold">{currency(telefoniaCost)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Custo mensal — Licenças/Sistemas</p>
          <p className="text-xl font-semibold">{currency(licensesCost)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Custo mensal — Total</p>
          <p className="text-xl font-semibold">{currency(telefoniaCost + licensesCost)}</p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Adesão ao check-in mensal de hardware</h2>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          {adherenceRate === null ? (
            <p className="text-sm text-slate-500">Nenhum equipamento atribuído no momento.</p>
          ) : (
            <>
              <p className="text-2xl font-semibold">{adherenceRate}%</p>
              <p className="text-xs text-slate-500">
                {checkinsThisMonthCount ?? 0} de {assignedAssetsCount} equipamentos atribuídos já fizeram o check-in deste mês.
              </p>
            </>
          )}

          {pendingCheckinAssets.length > 0 ? (
            <details className="mt-3 text-sm text-slate-500">
              <summary className="cursor-pointer">
                {pendingCheckinAssets.length} equipamento(s) pendente(s) este mês
              </summary>
              <ul className="mt-2 space-y-1">
                {pendingCheckinAssets.map((a) => (
                  <li key={a.id}>
                    {a.asset_tag} — {a.profiles?.full_name ?? "sem responsável"}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Trilha de auditoria (últimas 50 ações)</h2>
        {!auditLogs || auditLogs.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum evento registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Quando</th>
                  <th className="px-3 py-2">Quem</th>
                  <th className="px-3 py-2">Ação</th>
                  <th className="px-3 py-2">Tabela</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-slate-500">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-3 py-2">{log.profiles?.full_name ?? "—"}</td>
                    <td className="px-3 py-2">{ACTION_LABELS[log.action] ?? log.action}</td>
                    <td className="px-3 py-2 text-slate-500">{log.table_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
