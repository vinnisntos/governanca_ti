import { ClipboardX, Download, Gauge, KeySquare, Phone } from "lucide-react";
import { pool } from "@/lib/db/client";
import { currentReferenceMonth } from "@/lib/utils/reference-month";
import { formatDateBR } from "@/lib/utils/format-datetime";
import { ACCESS_REQUEST_STATUSES, ACCESS_STATUS_LABELS } from "./labels";
import type { AuditLogRow, DeniedRequestRow, PendingCheckinAssetRow } from "./types";
import { AuditLogList } from "./audit-log-list";
import { DATASET_KEYS, DATASET_LABELS } from "@/lib/reports/datasets";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Section } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/checkbox";

// Módulo 5: Relatórios e Auditoria (Dashboard Executivo). Sem RLS no banco:
// app/dashboard/admin/layout.tsx (requireRole(["admin_ti"])) é a autoridade
// real de acesso — esta página em si não filtra nenhuma linha, lê tudo.

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type StatusCountRow = { status: string; count: number };
type MonthlyCostRow = { monthly_cost: number | string | null };
type CountRow = { count: number };
type CheckinAssetIdRow = { asset_id: string };

export default async function ExecutiveDashboardPage() {
  const referenceMonth = currentReferenceMonth();

  const [
    statusCountRows,
    deniedRequestsResult,
    activeLinesResult,
    activeLicensesResult,
    assignedAssetsCountResult,
    checkinsThisMonthCountResult,
    assignedAssetsResult,
    checkinsThisMonthResult,
    auditLogsResult,
  ] = await Promise.all([
    pool.query<StatusCountRow>(
      `select status::text, count(*)::int as count
       from access_requests
       where status::text = any($1::text[])
       group by status`,
      [ACCESS_REQUEST_STATUSES as unknown as string[]]
    ),
    pool.query<DeniedRequestRow>(
      `select ar.id, ar.review_notes, ar.decision_at,
              case when ac.name is not null then jsonb_build_object('name', ac.name) end as access_catalog,
              ar.requested_system_name,
              case when requester.full_name is not null then jsonb_build_object('full_name', requester.full_name) end as requester
       from access_requests ar
       left join access_catalog ac on ac.id = ar.system_id
       left join profiles requester on requester.id = ar.requester_id
       where ar.status = 'negado'
       order by ar.decision_at desc
       limit 10`
    ),
    pool.query<MonthlyCostRow>("select monthly_cost from mobile_lines where status = 'ativa'"),
    pool.query<MonthlyCostRow>("select monthly_cost from access_catalog where is_active = true"),
    pool.query<CountRow>("select count(*)::int as count from hardware_assets where assigned_to is not null"),
    pool.query<CountRow>("select count(*)::int as count from hardware_checkins where reference_month = $1", [
      referenceMonth,
    ]),
    pool.query<PendingCheckinAssetRow>(
      `select ha.id, ha.asset_tag,
              case when p.full_name is not null then jsonb_build_object('full_name', p.full_name) end as profiles
       from hardware_assets ha
       left join profiles p on p.id = ha.assigned_to
       where ha.assigned_to is not null`
    ),
    pool.query<CheckinAssetIdRow>("select asset_id from hardware_checkins where reference_month = $1", [
      referenceMonth,
    ]),
    pool.query<AuditLogRow>(
      `select al.id, al.table_name, al.action::text as action, al.created_at,
              case when p.full_name is not null then jsonb_build_object('full_name', p.full_name) end as profiles
       from audit_logs al
       left join profiles p on p.id = al.changed_by
       order by al.created_at desc
       limit 50`
    ),
  ]);

  const countByStatus = new Map(statusCountRows.rows.map((r) => [r.status, r.count]));
  const statusCounts = ACCESS_REQUEST_STATUSES.map((status) => ({
    status,
    count: countByStatus.get(status) ?? 0,
  }));

  const deniedRequests = deniedRequestsResult.rows;
  const telefoniaCost = activeLinesResult.rows.reduce((sum, l) => sum + Number(l.monthly_cost ?? 0), 0);
  const licensesCost = activeLicensesResult.rows.reduce((sum, l) => sum + Number(l.monthly_cost ?? 0), 0);
  const assignedAssetsCount = assignedAssetsCountResult.rows[0]?.count ?? 0;
  const checkinsThisMonthCount = checkinsThisMonthCountResult.rows[0]?.count ?? 0;
  const auditLogs = auditLogsResult.rows;

  const checkedInAssetIds = new Set(checkinsThisMonthResult.rows.map((c) => c.asset_id));
  const pendingCheckinAssets = assignedAssetsResult.rows.filter((a) => !checkedInAssetIds.has(a.id));
  const adherenceRate =
    assignedAssetsCount > 0 ? Math.round((checkinsThisMonthCount / assignedAssetsCount) * 100) : null;

  return (
    <>
      <PageHeader
        title="Dashboard Executivo"
        description="Visão consolidada de custos, aprovações e auditoria."
        actions={
          <Modal
            title="Exportar relatório"
            description="Escolha os dados e o formato do arquivo."
            trigger={
              <Button variant="outline">
                <Download className="h-4 w-4" aria-hidden />
                Exportar
              </Button>
            }
          >
            <form method="GET" action="/dashboard/admin/relatorios/export" target="_blank" className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium text-slate-700">Dados a incluir</legend>
                {DATASET_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox name="datasets" value={key} defaultChecked />
                    {DATASET_LABELS[key]}
                  </label>
                ))}
              </fieldset>
              <div className="flex justify-end gap-2">
                <SubmitButton name="format" value="xlsx" variant="outline" pendingLabel="Gerando...">
                  Exportar .xlsx
                </SubmitButton>
                <SubmitButton name="format" value="pdf" variant="primary" pendingLabel="Gerando...">
                  Exportar .pdf
                </SubmitButton>
              </div>
            </form>
          </Modal>
        }
      />

      <Section title="Solicitações de acesso" className="mb-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {statusCounts.map(({ status, count }) => (
            <StatCard key={status} label={ACCESS_STATUS_LABELS[status]} value={count} />
          ))}
        </div>
      </Section>

      <Section title="Recusas recentes (com motivo)" className="mb-8">
        {deniedRequests.length === 0 ? (
          <EmptyState icon={ClipboardX} title="Nenhuma solicitação recusada até o momento" />
        ) : (
          <ul className="space-y-2">
            {deniedRequests.map((r) => (
              <li key={r.id}>
                <Card className="p-3 text-sm">
                  <span className="font-medium text-slate-900">
                    {r.access_catalog?.name ?? r.requested_system_name ?? "Sistema removido"}
                  </span>
                  {" — "}
                  {r.requester?.full_name ?? "Colaborador removido"}
                  {r.decision_at ? ` (${formatDateBR(r.decision_at)})` : ""}
                  {r.review_notes ? <p className="mt-1 text-slate-600">Motivo: {r.review_notes}</p> : null}
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
            <p className="text-sm text-slate-600">Nenhum equipamento atribuído no momento.</p>
          ) : (
            <>
              <p className="text-2xl font-semibold text-slate-900">{adherenceRate}%</p>
              <p className="text-xs text-slate-600">
                {checkinsThisMonthCount} de {assignedAssetsCount} equipamentos atribuídos já fizeram o
                check-in deste mês.
              </p>
            </>
          )}

          {pendingCheckinAssets.length > 0 ? (
            <details className="mt-3 text-sm text-slate-600">
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
        <AuditLogList logs={auditLogs} />
      </Section>
    </>
  );
}
