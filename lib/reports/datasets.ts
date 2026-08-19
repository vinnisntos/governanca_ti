import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATEGORY_LABELS, STATUS_LABELS as HARDWARE_STATUS_LABELS } from "@/app/dashboard/admin/hardware/labels";
import { LINE_TYPE_LABELS, STATUS_LABELS as TELEFONIA_STATUS_LABELS } from "@/app/dashboard/admin/telefonia/labels";
import { ACCESS_STATUS_LABELS, ACTION_LABELS } from "@/app/dashboard/admin/relatorios/labels";
import type { AuditLogRow } from "@/app/dashboard/admin/relatorios/types";

// Módulo 5 (Relatórios e Auditoria) — fetchers usados pela exportação em
// .xlsx/.pdf do Dashboard Executivo (ver app/dashboard/admin/relatorios/export/route.ts).
// Cada fetcher devolve uma forma comum (colunas + linhas) consumida tanto por
// build-xlsx.ts quanto por build-pdf.tsx, para não duplicar formatação entre
// os dois formatos.

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
  profiles: { full_name: string; email: string } | null;
};

async function fetchHardwareDataset(supabase: SupabaseClient): Promise<ReportDataset> {
  const { data } = await supabase
    .from("hardware_assets")
    .select("asset_tag, category, model, serial_number, status, purchase_date, warranty_until, profiles(full_name, email)")
    .order("asset_tag")
    .returns<HardwareAssetRow[]>();

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
    rows: (data ?? []).map((asset) => ({
      asset_tag: asset.asset_tag,
      category: CATEGORY_LABELS[asset.category] ?? asset.category,
      model: asset.model,
      serial_number: asset.serial_number,
      status: HARDWARE_STATUS_LABELS[asset.status] ?? asset.status,
      responsavel: asset.profiles?.full_name ?? null,
      email: asset.profiles?.email ?? null,
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
  profiles: { full_name: string } | null;
  departments: { name: string } | null;
};

async function fetchTelefoniaDataset(supabase: SupabaseClient): Promise<ReportDataset> {
  const { data } = await supabase
    .from("mobile_lines")
    .select("phone_number, carrier, plan_name, monthly_cost, line_type, status, profiles(full_name), departments(name)")
    .order("phone_number")
    .returns<MobileLineRow[]>();

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
    rows: (data ?? []).map((line) => ({
      phone_number: line.phone_number,
      carrier: line.carrier,
      plan_name: line.plan_name,
      monthly_cost: Number(line.monthly_cost),
      line_type: LINE_TYPE_LABELS[line.line_type] ?? line.line_type,
      status: TELEFONIA_STATUS_LABELS[line.status] ?? line.status,
      responsavel: line.profiles?.full_name ?? null,
      setor: line.departments?.name ?? null,
    })),
  };
}

type AccessCatalogRow = {
  name: string;
  description: string | null;
  is_active: boolean;
  monthly_cost: number | null;
  departments: { name: string } | null;
};

async function fetchLicencasDataset(supabase: SupabaseClient): Promise<ReportDataset> {
  const { data } = await supabase
    .from("access_catalog")
    .select("name, description, is_active, monthly_cost, departments(name)")
    .order("name")
    .returns<AccessCatalogRow[]>();

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
    rows: (data ?? []).map((item) => ({
      name: item.name,
      description: item.description,
      setor: item.departments?.name ?? null,
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
  access_catalog: { name: string } | null;
  requested_system_name: string | null;
  requester: { full_name: string; email: string } | null;
  reviewer: { full_name: string } | null;
};

async function fetchAcessosDataset(supabase: SupabaseClient): Promise<ReportDataset> {
  const { data } = await supabase
    .from("access_requests")
    .select(
      "status, justification, review_notes, decision_at, created_at, access_catalog(name), requested_system_name, requester:profiles!access_requests_requester_id_fkey(full_name, email), reviewer:profiles!access_requests_reviewed_by_fkey(full_name)"
    )
    .order("created_at", { ascending: false })
    .returns<AccessRequestRow[]>();

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
    rows: (data ?? []).map((request) => ({
      solicitante: request.requester?.full_name ?? "Colaborador removido",
      email: request.requester?.email ?? null,
      sistema: request.access_catalog?.name ?? request.requested_system_name ?? "Sistema removido",
      status: ACCESS_STATUS_LABELS[request.status] ?? request.status,
      justification: request.justification,
      aprovador: request.reviewer?.full_name ?? null,
      review_notes: request.review_notes,
      created_at: request.created_at,
      decision_at: request.decision_at,
    })),
  };
}

async function fetchAuditoriaDataset(supabase: SupabaseClient): Promise<ReportDataset> {
  const { data } = await supabase
    .from("audit_logs")
    .select("id, table_name, action, created_at, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(EXPORT_AUDIT_LOG_LIMIT)
    .returns<AuditLogRow[]>();

  return {
    key: "auditoria",
    title: DATASET_LABELS.auditoria,
    columns: [
      { key: "created_at", label: "Quando", format: "datetime", widthWeight: 1.2 },
      { key: "quem", label: "Quem", widthWeight: 1.3 },
      { key: "action", label: "Ação", widthWeight: 0.8 },
      { key: "table_name", label: "Tabela", widthWeight: 1 },
    ],
    rows: (data ?? []).map((log) => ({
      created_at: log.created_at,
      quem: log.profiles?.full_name ?? "—",
      action: ACTION_LABELS[log.action] ?? log.action,
      table_name: log.table_name,
    })),
  };
}

const FETCHERS: Record<DatasetKey, (supabase: SupabaseClient) => Promise<ReportDataset>> = {
  hardware: fetchHardwareDataset,
  telefonia: fetchTelefoniaDataset,
  acessos: fetchAcessosDataset,
  licencas: fetchLicencasDataset,
  auditoria: fetchAuditoriaDataset,
};

export function isDatasetKey(value: string): value is DatasetKey {
  return (DATASET_KEYS as string[]).includes(value);
}

export async function fetchDatasets(supabase: SupabaseClient, keys: DatasetKey[]): Promise<ReportDataset[]> {
  return Promise.all(keys.map((key) => FETCHERS[key](supabase)));
}
