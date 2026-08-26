import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Estas verificações são estáticas/textuais sobre db/migrations/0001_init.sql
// — não substituem um teste de integração ao vivo contra um Postgres real,
// mas transformam invariantes de segurança em regressão automatizada e
// executável em CI sem depender de credenciais de banco.
//
// Migração Supabase -> Postgres puro: os achados originais de auditoria de
// RLS/triggers (RELATORIO_SEGURANCA_E_TESTES.txt) sobre integridade
// referencial e máquina de estados continuam valendo tal qual (são
// portáveis, nunca foram específicos de RLS). O que mudou: não existe mais
// RLS/policy nenhuma — a autorização por linha agora é responsabilidade
// explícita do código em lib/db + app/**/actions.ts (ver mapeamento no
// plano da migração) — e auth.uid()/auth.role() (GUCs do PostgREST) viram
// public.current_user_id() (GUC própria, setada por lib/db/context.ts).

const sql = readFileSync(path.resolve(__dirname, "../../../db/migrations/0001_init.sql"), "utf-8");
// Só o SQL executável importa para estas checagens — comentários de "--"
// documentam de propósito o que auth.uid()/auth.role() do PostgREST viram
// nesta migration, e não devem contar como uso real.
const executableSql = sql
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("db/migrations/0001_init.sql — sem RLS/PostgREST (Postgres puro)", () => {
  it("nenhuma tabela tem RLS habilitado", () => {
    expect(executableSql).not.toMatch(/enable row level security/i);
  });

  it("nenhuma policy é criada", () => {
    expect(executableSql).not.toMatch(/create policy/i);
  });

  it("nenhuma função depende de auth.uid()/auth.role() (GUCs do PostgREST)", () => {
    expect(executableSql).not.toMatch(/auth\.uid\(\)/i);
    expect(executableSql).not.toMatch(/auth\.role\(\)/i);
  });

  it("public.current_user_id() lê a GUC própria app.current_user_id no lugar de auth.uid()", () => {
    expect(sql).toMatch(/current_setting\('app\.current_user_id', true\)/i);
  });

  it("profiles não referencia mais auth.users e tem password_hash + sessions próprias", () => {
    expect(sql).not.toMatch(/references auth\.users/i);
    expect(sql).toMatch(/password_hash text not null/i);
    expect(sql).toMatch(/create table if not exists public\.sessions/i);
  });
});

describe("db/migrations/0001_init.sql — invariantes de negócio preservados da era Supabase", () => {
  it("trg_validate_access_request_transition dispara em INSERT e em UPDATE (Achado SQL#1)", () => {
    expect(sql).toMatch(
      /create trigger trg_validate_access_request_transition\s+before insert or update on public\.access_requests/i
    );
  });

  it("hardware_checkins.reference_month tem CHECK garantindo truncamento pro 1º dia do mês (Achado SQL#2)", () => {
    expect(sql).toMatch(/date_trunc\(\s*'month'\s*,\s*reference_month\s*\)/i);
  });

  it("audit_logs.changed_by é 'on delete set null' (Achado SQL#3a)", () => {
    expect(sql).toMatch(/changed_by uuid references public\.profiles \(id\) on delete set null/i);
  });

  it("hardware_assets.assigned_to é 'on delete set null' (Achado SQL#3b)", () => {
    const block = sql.slice(
      sql.indexOf("create table if not exists public.hardware_assets"),
      sql.indexOf("create index if not exists idx_hardware_assets_assigned_to")
    );
    expect(block).toMatch(/assigned_to uuid references public\.profiles \(id\) on delete set null/i);
  });

  it("mobile_lines.assigned_to é 'on delete set null' (Achado SQL#3c)", () => {
    const block = sql.slice(
      sql.indexOf("create table if not exists public.mobile_lines"),
      sql.indexOf("create index if not exists idx_mobile_lines_assigned_to")
    );
    expect(block).toMatch(/assigned_to uuid references public\.profiles \(id\) on delete set null/i);
  });

  it("hardware_contracts.asset_id e hardware_checkins.asset_id são 'on delete restrict' (Achado SQL#4)", () => {
    expect(sql).not.toMatch(/asset_id uuid not null references public\.hardware_assets \(id\) on delete cascade/i);
  });

  it("knowledge_base_articles.category_id é 'on delete set null' (Achado SQL#5)", () => {
    expect(sql).toMatch(/category_id uuid references public\.knowledge_base_categories \(id\) on delete set null/i);
  });

  it("departments, access_catalog e knowledge_base_categories têm trigger de auditoria (Achado SQL#6)", () => {
    expect(sql).toMatch(/create trigger trg_audit_departments/i);
    expect(sql).toMatch(/create trigger trg_audit_access_catalog/i);
    expect(sql).toMatch(/create trigger trg_audit_knowledge_base_categories/i);
  });

  it("uq_checkin_asset_month continua sendo uma constraint UNIQUE real de banco", () => {
    expect(sql).toMatch(/constraint uq_checkin_asset_month unique \(asset_id, reference_month\)/i);
  });

  it("audit_logs só é escrito pela trigger SECURITY-neutra fn_audit_trigger (nenhum INSERT direto de outra tabela)", () => {
    const auditTableBlock = sql.slice(
      sql.indexOf("create table if not exists public.audit_logs"),
      sql.indexOf("create index if not exists idx_audit_logs_table")
    );
    expect(auditTableBlock).toMatch(/id bigint generated always as identity primary key/i);
  });
});
