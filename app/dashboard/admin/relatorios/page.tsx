import { redirect } from "next/navigation";
import { ClipboardX, Gauge, KeySquare, Phone, ScrollText } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { currentReferenceMonth } from "@/lib/utils/reference-month";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Section } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";

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

const STATUS_LABELS = {
  pendente: "Pendentes",
  em_analise: "Em análise",
  aprovado: "Aprovadas",
  negado: "Negadas",
  cancelado: "Canceladas",
} as const;

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
    <>
      <PageHeader title="Dashboard Executivo" description="Visão consolidada de custos, aprovações e auditoria." />

      <Section title="Solicitações de acesso" className="mb-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {statusCounts.map(({ status, count }) => (
            <StatCard key={status} label={STATUS_LABELS[status]} value={count} />
          ))}
        </div>
      </Section>

      <Section title="Recusas recentes (com motivo)" className="mb-8">
        {!deniedRequests || deniedRequests.length === 0 ? (
          <EmptyState icon={ClipboardX} title="Nenhuma solicitação recusada até o momento" />
        ) : (
          <ul className="space-y-2">
            {deniedRequests.map((r) => (
              <li key={r.id}>
                <Card className="p-3 text-sm">
                  <span className="font-medium text-slate-900">
                    {r.access_catalog?.name ?? "Sistema removido"}
                  </span>
                  {" — "}
                  {r.requester?.full_name ?? "Colaborador removido"}
                  {r.decision_at ? ` (${new Date(r.decision_at).toLocaleDateString("pt-BR")})` : ""}
                  {r.review_notes ? <p className="mt-1 text-slate-500">Motivo: {r.review_notes}</p> : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section className="mb-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Custo mensal — Telefonia" value={currency(telefoniaCost)} icon={Phone} />
          <StatCard label="Custo mensal — Licenças/Sistemas" value={currency(licensesCost)} icon={KeySquare} />
          <StatCard
            label="Custo mensal — Total"
            value={currency(telefoniaCost + licensesCost)}
            icon={Gauge}
          />
        </div>
      </Section>

      <Section title="Adesão ao check-in mensal de hardware" className="mb-8">
        <Card>
          {adherenceRate === null ? (
            <p className="text-sm text-slate-500">Nenhum equipamento atribuído no momento.</p>
          ) : (
            <>
              <p className="text-2xl font-semibold text-slate-900">{adherenceRate}%</p>
              <p className="text-xs text-slate-500">
                {checkinsThisMonthCount ?? 0} de {assignedAssetsCount} equipamentos atribuídos já fizeram o
                check-in deste mês.
              </p>
            </>
          )}

          {pendingCheckinAssets.length > 0 ? (
            <details className="mt-3 text-sm text-slate-500">
              <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-800">
                {pendingCheckinAssets.length} equipamento(s) pendente(s) este mês
              </summary>
              <ul className="mt-2 space-y-1 border-l border-slate-200 pl-3">
                {pendingCheckinAssets.map((a) => (
                  <li key={a.id}>
                    {a.asset_tag} — {a.profiles?.full_name ?? "sem responsável"}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      </Section>

      <Section title="Trilha de auditoria (últimas 50 ações)">
        {!auditLogs || auditLogs.length === 0 ? (
          <EmptyState icon={ScrollText} title="Nenhum evento registrado ainda" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Quando</th>
                  <th className="px-3 py-2.5">Quem</th>
                  <th className="px-3 py-2.5">Ação</th>
                  <th className="px-3 py-2.5">Tabela</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2.5 text-slate-500">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-3 py-2.5 text-slate-900">{log.profiles?.full_name ?? "—"}</td>
                    <td className="px-3 py-2.5">{ACTION_LABELS[log.action] ?? log.action}</td>
                    <td className="px-3 py-2.5 text-slate-500">{log.table_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
