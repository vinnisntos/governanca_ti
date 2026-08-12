import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Estes testes NÃO substituem testes de integração ao vivo contra um projeto
// Supabase real (o próprio README do projeto descreve essa metodologia para
// validar RLS de ponta a ponta). Eles fazem verificações estáticas/textuais
// sobre supabase/migrations/0001_init.sql para transformar os achados da
// auditoria de RLS/triggers em regressão automatizada e executável em CI, sem
// depender de credenciais de banco. Cada teste abaixo documenta um achado do
// relatório de auditoria e HOJE DEVE FALHAR — a barra fica verde quando a
// migration for corrigida conforme a sugestão descrita em cada teste.

const sql = readFileSync(
  path.resolve(__dirname, "../../../supabase/migrations/0001_init.sql"),
  "utf-8"
);

describe("supabase/migrations/0001_init.sql — regressão dos achados de auditoria de RLS", () => {
  it("Achado SQL#1: fn_validate_access_request_transition deve disparar também em INSERT (hoje só dispara em UPDATE, permitindo forjar reviewed_by/decision_at/review_notes na criação da solicitação)", () => {
    expect(sql).toMatch(
      /create trigger trg_validate_access_request_transition\s+before insert or update on public\.access_requests/i
    );
  });

  it("Achado SQL#2: hardware_checkins.reference_month deve ter CHECK garantindo truncamento para o 1º dia do mês (hoje a granularidade 'por mês' depende só do backend, permitindo múltiplos check-ins no mesmo mês via chamada direta à API)", () => {
    expect(sql).toMatch(/date_trunc\(\s*'month'\s*,\s*reference_month\s*\)/i);
  });

  it("Achado SQL#3a: audit_logs.changed_by deve ser 'on delete set null' (hoje, sem cláusula, RESTRICT impede excluir qualquer usuário que já tenha uma ação auditada)", () => {
    expect(sql).toMatch(
      /changed_by uuid references public\.profiles \(id\) on delete set null/i
    );
  });

  it("Achado SQL#3b: hardware_assets.assigned_to deve ser 'on delete set null' (hoje RESTRICT impede excluir colaborador com equipamento já atribuído)", () => {
    const hardwareAssetsBlock = sql.slice(
      sql.indexOf("create table if not exists public.hardware_assets"),
      sql.indexOf("create index if not exists idx_hardware_assets_assigned_to")
    );
    expect(hardwareAssetsBlock).toMatch(
      /assigned_to uuid references public\.profiles \(id\) on delete set null/i
    );
  });

  it("Achado SQL#3c: mobile_lines.assigned_to deve ser 'on delete set null' (mesma inconsistência do #3b)", () => {
    const mobileLinesBlock = sql.slice(
      sql.indexOf("create table if not exists public.mobile_lines"),
      sql.indexOf("create index if not exists idx_mobile_lines_assigned_to")
    );
    expect(mobileLinesBlock).toMatch(
      /assigned_to uuid references public\.profiles \(id\) on delete set null/i
    );
  });

  it("Achado SQL#4: hardware_contracts.asset_id e hardware_checkins.asset_id deveriam ser 'on delete restrict' (hoje CASCADE apaga contratos e histórico de check-in ao excluir um ativo, quebrando a trilha de auditoria)", () => {
    expect(sql).not.toMatch(
      /asset_id uuid not null references public\.hardware_assets \(id\) on delete cascade/i
    );
  });

  it("Achado SQL#5: knowledge_base_articles.category_id deveria ser 'on delete set null' (hoje RESTRICT impede excluir categoria com artigos vinculados)", () => {
    expect(sql).toMatch(
      /category_id uuid references public\.knowledge_base_categories \(id\) on delete set null/i
    );
  });

  it("Achado SQL#6: departments, access_catalog e knowledge_base_categories deveriam ter trigger de auditoria anexada (hoje alterações nessas tabelas não geram linha em audit_logs)", () => {
    expect(sql).toMatch(/create trigger trg_audit_departments/i);
    expect(sql).toMatch(/create trigger trg_audit_access_catalog/i);
    expect(sql).toMatch(/create trigger trg_audit_knowledge_base_categories/i);
  });
});

describe("supabase/migrations/0001_init.sql — controles que já estão corretos (não devem regredir)", () => {
  it("RLS está habilitado em todas as 11 tabelas de negócio", () => {
    const tables = [
      "departments",
      "profiles",
      "access_catalog",
      "access_requests",
      "hardware_assets",
      "hardware_contracts",
      "hardware_checkins",
      "mobile_lines",
      "knowledge_base_categories",
      "knowledge_base_articles",
      "audit_logs",
    ];
    for (const table of tables) {
      expect(sql).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`, "i")
      );
    }
  });

  it("audit_logs não tem nenhuma policy de INSERT/UPDATE/DELETE concedida a 'authenticated' (imutabilidade real)", () => {
    const auditBlockStart = sql.indexOf("alter table public.audit_logs enable row level security");
    const auditBlockEnd = sql.indexOf("STORAGE — BUCKETS", auditBlockStart);
    const auditBlock = sql.slice(auditBlockStart, auditBlockEnd);
    expect(auditBlock).not.toMatch(/for insert to authenticated/i);
    expect(auditBlock).not.toMatch(/for update to authenticated/i);
    expect(auditBlock).not.toMatch(/for delete to authenticated/i);
  });

  it("uq_checkin_asset_month continua sendo uma constraint UNIQUE real de banco", () => {
    expect(sql).toMatch(/constraint uq_checkin_asset_month unique \(asset_id, reference_month\)/i);
  });
});
