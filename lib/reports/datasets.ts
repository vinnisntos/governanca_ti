import "server-only";
import { pool } from "@/lib/db/client";
import { CATEGORY_LABELS, STATUS_LABELS as HARDWARE_STATUS_LABELS } from "@/app/dashboard/admin/hardware/labels";
import { LINE_TYPE_LABELS, STATUS_LABELS as TELEFONIA_STATUS_LABELS } from "@/app/dashboard/admin/telefonia/labels";
import { ACCESS_STATUS_LABELS, ACTION_LABELS } from "@/app/dashboard/admin/relatorios/labels";
import type { AuditLogRow } from "@/app/dashboard/admin/relatorios/types";

// Módulo 5 (Relatórios e Auditoria) — fetchers usados pela exportação em
// .xlsx/.pdf do Dashboard Executivo (ver app/dashboard/admin/relatorios/export/route.ts).
// Cada fetcher devolve uma forma comum (colunas + linhas) consumida tanto por
// build-xlsx.ts quanto por build-pdf.tsx, para não duplicar formatação entre
// os dois formatos. Sem RLS: quem chama fetchDatasets já passou por
// requireRole(["admin_ti"]) na rota — os fetchers sempre leem tudo, sem
// filtro de linha (mesmo alcance que a policy "select admin" dava antes).

export type ReportColumnFormat = "text" | "number" | "currency" | "date" | "datetime";

export type ReportColumn = {
  key: string;
  label: string;
  format?: ReportColumnFormat;
  widthWeight?: number;
};

export type ReportDataset = {
  key: DatasetKey;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
};

export type DatasetKey = "hardware" | "telefonia" | "acessos" | "licencas" | "auditoria";

export const DATASET_KEYS: DatasetKey[] = ["hardware", "telefonia", "acessos", "licencas", "auditoria"];

export const DATASET_LABELS: Record<DatasetKey, string> = {
  hardware: "Hardware",
  telefonia: "Telefonia",
  acessos: "Acessos",
  licencas: "Licenças",
  auditoria: "Auditoria",
};

// Limite próprio da exportação (a tela do Dashboard Executivo só mostra as
// últimas 50 como resumo — o relatório para exportar cobre mais histórico,
// sem trazer a tabela inteira, que cresce sem limite).
const EXPORT_AUDIT_LOG_LIMIT = 500;

type HardwareAssetRow = {
  asset_tag: string;
  category: string;
  model: string;
  serial_number: string;
  status: keyof typeof HARDWARE_STATUS_LABELS;
  purchase_date: string | null;
  warranty_until: string | null;
  profile_full_name: string | null;
  profile_email: string | null;
};

async function fetchHardwareDataset(): Promise<ReportDataset> {
  const { rows } = await pool.query<HardwareAssetRow>(
    `select ha.asset_tag, ha.category, ha.model, ha.serial_number, ha.status,
            ha.purchase_date, ha.warranty_until,
            p.full_name as profile_full_name, p.email as profile_email
     from hardware_assets ha
     left join profiles p on p.id = ha.assigned_to
     order by ha.asset_tag`
  );

  return {
    key: "hardware",
    title: DATASET_LABELS.hardware,
    columns: [
      { key: "asset_tag", label: "Patrimônio", widthWeight: 1 },
      { key: "category", label: "Categoria", widthWeight: 1 },
      { key: "model", label: "Modelo", widthWeight: 1.5 },
      { key: "serial_number", label: "Nº de série", widthWeight: 1.2 },
      { key: "status", label: "Status", widthWeight: 1 },
      { key: "responsavel", label: "Responsável", widthWeight: 1.5 },
      { key: "email", label: "E-mail", widthWeight: 1.5 },
      { key: "purchase_date", label: "Data de compra", format: "date", widthWeight: 1 },
      { key: "warranty_until", label: "Garantia até", format: "date", widthWeight: 1 },
    ],
    rows: rows.map((asset) => ({
      asset_tag: asset.asset_tag,
      category: CATEGORY_LABELS[asset.category as keyof typeof CATEGORY_LABELS] ?? asset.category,
      model: asset.model,
      serial_number: asset.serial_number,
      status: HARDWARE_STATUS_LABELS[asset.status] ?? asset.status,
      responsavel: asset.profile_full_name,
      email: asset.profile_email,
      purchase_date: asset.purchase_date,
      warranty_until: asset.warranty_until,
    })),
  };
}

type MobileLineRow = {
  phone_number: string;
  carrier: string;
  plan_name: string;
  monthly_cost: number;
  line_type: string;
  status: keyof typeof TELEFONIA_STATUS_LABELS;
  profile_full_name: string | null;
  department_name: string | null;
};

async function fetchTelefoniaDataset(): Promise<ReportDataset> {
  const { rows } = await pool.query<MobileLineRow>(
    `select ml.phone_number, ml.carrier, ml.plan_name, ml.monthly_cost, ml.line_type, ml.status,
            p.full_name as profile_full_name, d.name as department_name
     from mobile_lines ml
     left join profiles p on p.id = ml.assigned_to
     left join departments d on d.id = ml.department_id
     order by ml.phone_number`
  );

  return {
    key: "telefonia",
    title: DATASET_LABELS.telefonia,
    columns: [
      { key: "phone_number", label: "Número", widthWeight: 1.2 },
      { key: "carrier", label: "Operadora", widthWeight: 1 },
      { key: "plan_name", label: "Plano", widthWeight: 1 },
      { key: "monthly_cost", label: "Custo mensal", format: "currency", widthWeight: 1 },
      { key: "line_type", label: "Tipo", widthWeight: 0.8 },
      { key: "status", label: "Status", widthWeight: 0.8 },
      { key: "responsavel", label: "Responsável", widthWeight: 1.3 },
      { key: "setor", label: "Setor", widthWeight: 1 },
    ],
    rows: rows.map((line) => ({
      phone_number: line.phone_number,
      carrier: line.carrier,
      plan_name: line.plan_name,
      monthly_cost: Number(line.monthly_cost),
      line_type: LINE_TYPE_LABELS[line.line_type as keyof typeof LINE_TYPE_LABELS] ?? line.line_type,
      status: TELEFONIA_STATUS_LABELS[line.status] ?? line.status,
      responsavel: line.profile_full_name,
      setor: line.department_name,
    })),
  };
}

type AccessCatalogRow = {
  name: string;
  description: string | null;
  is_active: boolean;
  monthly_cost: number | null;
  department_name: string | null;
};

async function fetchLicencasDataset(): Promise<ReportDataset> {
  const { rows } = await pool.query<AccessCatalogRow>(
    `select ac.name, ac.description, ac.is_active, ac.monthly_cost, d.name as department_name
     from access_catalog ac
     left join departments d on d.id = ac.owner_department_id
     order by ac.name`
  );

  return {
    key: "licencas",
    title: DATASET_LABELS.licencas,
    columns: [
      { key: "name", label: "Sistema", widthWeight: 1.5 },
      { key: "description", label: "Descrição", widthWeight: 2 },
      { key: "setor", label: "Departamento", widthWeight: 1.2 },
      { key: "monthly_cost", label: "Custo mensal", format: "currency", widthWeight: 1 },
      { key: "status", label: "Status", widthWeight: 0.8 },
    ],
    rows: rows.map((item) => ({
      name: item.name,
      description: item.description,
      setor: item.department_name,
      monthly_cost: item.monthly_cost != null ? Number(item.monthly_cost) : null,
      status: item.is_active ? "Ativo" : "Inativo",
    })),
  };
}

type AccessRequestRow = {
  status: keyof typeof ACCESS_STATUS_LABELS;
  justification: string;
  review_notes: string | null;
  decision_at: string | null;
  created_at: string;
  catalog_name: string | null;
  requested_system_name: string | null;
  requester_full_name: string | null;
  requester_email: string | null;
  reviewer_full_name: string | null;
};

async function fetchAcessosDataset(): Promise<ReportDataset> {
  const { rows } = await pool.query<AccessRequestRow>(
    `select ar.status, ar.justification, ar.review_notes, ar.decision_at, ar.created_at,
            ac.name as catalog_name, ar.requested_system_name,
            requester.full_name as requester_full_name, requester.email as requester_email,
            reviewer.full_name as reviewer_full_name
     from access_requests ar
     left join access_catalog ac on ac.id = ar.system_id
     left join profiles requester on requester.id = ar.requester_id
     left join profiles reviewer on reviewer.id = ar.reviewed_by
     order by ar.created_at desc`
  );

  return {
    key: "acessos",
    title: DATASET_LABELS.acessos,
    columns: [
      { key: "solicitante", label: "Solicitante", widthWeight: 1.3 },
      { key: "email", label: "E-mail", widthWeight: 1.5 },
      { key: "sistema", label: "Sistema", widthWeight: 1.3 },
      { key: "status", label: "Status", widthWeight: 0.8 },
      { key: "justification", label: "Justificativa", widthWeight: 2 },
      { key: "aprovador", label: "Aprovador", widthWeight: 1.2 },
      { key: "review_notes", label: "Motivo da decisão", widthWeight: 1.8 },
      { key: "created_at", label: "Criado em", format: "datetime", widthWeight: 1 },
      { key: "decision_at", label: "Decidido em", format: "datetime", widthWeight: 1 },
    ],
    rows: rows.map((request) => ({
      solicitante: request.requester_full_name ?? "Colaborador removido",
      email: request.requester_email,
      sistema: request.catalog_name ?? request.requested_system_name ?? "Sistema removido",
      status: ACCESS_STATUS_LABELS[request.status] ?? request.status,
      justification: request.justification,
      aprovador: request.reviewer_full_name,
      review_notes: request.review_notes,
      created_at: request.created_at,
      decision_at: request.decision_at,
    })),
  };
}

async function fetchAuditoriaDataset(): Promise<ReportDataset> {
  const { rows } = await pool.query<AuditLogRow & { profile_full_name: string | null }>(
    `select al.id, al.table_name, al.action, al.created_at, p.full_name as profile_full_name
     from audit_logs al
     left join profiles p on p.id = al.changed_by
     order by al.created_at desc
     limit $1`,
    [EXPORT_AUDIT_LOG_LIMIT]
  );

  return {
    key: "auditoria",
    title: DATASET_LABELS.auditoria,
    columns: [
      { key: "created_at", label: "Quando", format: "datetime", widthWeight: 1.2 },
      { key: "quem", label: "Quem", widthWeight: 1.3 },
      { key: "action", label: "Ação", widthWeight: 0.8 },
      { key: "table_name", label: "Tabela", widthWeight: 1 },
    ],
    rows: rows.map((log) => ({
      created_at: log.created_at,
      quem: log.profile_full_name ?? "—",
      action: ACTION_LABELS[log.action as keyof typeof ACTION_LABELS] ?? log.action,
      table_name: log.table_name,
    })),
  };
}

const FETCHERS: Record<DatasetKey, () => Promise<ReportDataset>> = {
  hardware: fetchHardwareDataset,
  telefonia: fetchTelefoniaDataset,
  acessos: fetchAcessosDataset,
  licencas: fetchLicencasDataset,
  auditoria: fetchAuditoriaDataset,
};

export function isDatasetKey(value: string): value is DatasetKey {
  return (DATASET_KEYS as string[]).includes(value);
}

export async function fetchDatasets(keys: DatasetKey[]): Promise<ReportDataset[]> {
  return Promise.all(keys.map((key) => FETCHERS[key]()));
}
