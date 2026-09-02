import "server-only";
import { withRequestContext, type RequestContext } from "@/lib/db/context";
import { fetchSheetRows } from "./google-sheets";

// Sincroniza o Catálogo de Acessos com a planilha "Assinaturas - Softwares e
// licenças" do Google Sheets. Colunas esperadas (na ordem): Nome do
// fornecedor, Data de vencimento, Descrição, Valor original da parcela,
// Categoria 1, Centro de Custo 1 — linha 1 é cabeçalho.
//
// Casamento com o catálogo é feito por access_catalog.source_ref (descritor
// da fatura normalizado), não pelo "name" exibido — um admin_ti pode
// renomear o item livremente sem quebrar sincronizações futuras (ver
// db/migrations/0003_access_catalog_source_ref.sql).

const COL = { vendor: 0, dueDate: 1, description: 2, cost: 3, category: 4, costCenter: 5 } as const;
const HEADER_ROWS = 1;

export type ParsedSheetRow = {
  sourceRef: string;
  rawDescription: string;
  monthlyCost: number;
  dueDateSerial: number;
};

export type SyncSummary = {
  updated: { name: string; monthlyCost: number }[];
  inserted: { name: string; monthlyCost: number }[];
  // rawDescription cujo "name" bruto já existe no catálogo mas com um
  // source_ref diferente (ou nenhum) — precisa de reconciliação manual.
  conflicts: string[];
  errors: string[];
};

export function normalizeDescriptor(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

function parseCost(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    // defensivo: caso a célula venha como texto formatado (ex.: "R$ 1.801,04")
    const cleaned = value
      .replace(/[^\d.,-]/g, "")
      .replace(/\.(?=\d{3}(?:[.,]|$))/g, "")
      .replace(",", ".");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseDueDateSerial(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// Puro/testável: linhas com Descrição ou Valor ausentes/inválidos são
// ignoradas; entre linhas com o mesmo descritor (ex.: duas parcelas do
// mesmo fornecedor em meses diferentes), fica a de vencimento mais recente.
export function buildSyncPlan(rows: unknown[][]): ParsedSheetRow[] {
  const bySourceRef = new Map<string, ParsedSheetRow>();

  for (let i = HEADER_ROWS; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const rawDescription = row[COL.description];
    const monthlyCost = parseCost(row[COL.cost]);
    if (typeof rawDescription !== "string" || !rawDescription.trim() || monthlyCost === null) continue;

    const sourceRef = normalizeDescriptor(rawDescription);
    const dueDateSerial = parseDueDateSerial(row[COL.dueDate]);

    const current = bySourceRef.get(sourceRef);
    if (!current || dueDateSerial >= current.dueDateSerial) {
      bySourceRef.set(sourceRef, { sourceRef, rawDescription: rawDescription.trim(), monthlyCost, dueDateSerial });
    }
  }

  return [...bySourceRef.values()];
}

function pendingReviewDescription(): string {
  return `Importado automaticamente em ${new Date().toLocaleDateString("pt-BR")} — revisar nome e descrição antes de ativar.`;
}

export async function syncSoftwareCatalogFromSheet(
  actor: RequestContext = { userId: null, clientIp: null }
): Promise<SyncSummary> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CATALOG_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_CATALOG_SPREADSHEET_ID não configurada");
  }

  const rawRows = await fetchSheetRows(spreadsheetId);
  const plan = buildSyncPlan(rawRows);
  const summary: SyncSummary = { updated: [], inserted: [], conflicts: [], errors: [] };

  // Cada item roda na sua própria transação: uma falha isolada (ex.: nome
  // bruto colidindo com um item já existente) não deve derrubar o resto de
  // uma sincronização que só roda uma vez por dia.
  for (const entry of plan) {
    try {
      await withRequestContext(actor, async (client) => {
        const { rows: existing } = await client.query<{ id: string; name: string }>(
          "select id, name from public.access_catalog where source_ref = $1",
          [entry.sourceRef]
        );

        if (existing.length > 0) {
          await client.query("update public.access_catalog set monthly_cost = $2 where id = $1", [
            existing[0]!.id,
            entry.monthlyCost,
          ]);
          summary.updated.push({ name: existing[0]!.name, monthlyCost: entry.monthlyCost });
          return;
        }

        const { rows: insertedRows } = await client.query<{ name: string }>(
          `insert into public.access_catalog (name, description, monthly_cost, is_active, source_ref)
           values ($1, $2, $3, false, $4)
           returning name`,
          [entry.rawDescription, pendingReviewDescription(), entry.monthlyCost, entry.sourceRef]
        );
        summary.inserted.push({ name: insertedRows[0]!.name, monthlyCost: entry.monthlyCost });
      });
    } catch (error) {
      const pgError = error as { code?: string; message?: string };
      if (pgError.code === "23505") {
        summary.conflicts.push(entry.rawDescription);
      } else {
        console.error("[catalog-sync] falha ao processar item", {
          sourceRef: entry.sourceRef,
          message: pgError.message,
        });
        summary.errors.push(entry.rawDescription);
      }
    }
  }

  return summary;
}
