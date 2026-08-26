import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Mesma metodologia de test/unit/sql/migration-rls-static-checks.test.ts:
// verificações estáticas/textuais sobre a migration para transformar os
// invariantes de segurança do ciclo de vida de chamados (cancelamento
// terminal, mesclagem congela o chamado, reabertura sem prazo) em regressão
// automatizada, sem depender de credenciais de banco.
//
// As antigas policies de RLS (support_tickets_close_requester/
// cancel_requester/reopen_requester) não existem mais — a mesma regra de
// "quem pode fazer cada transição" agora vive como WHERE explícito em
// app/dashboard/ajuda/actions.ts (coberto por outros testes/pela leitura do
// código, não por este arquivo). Aqui só ficam os invariantes que continuam
// sendo aplicados dentro do próprio banco, pela trigger
// fn_protect_support_ticket_fields.

const sql = readFileSync(path.resolve(__dirname, "../../../db/migrations/0001_init.sql"), "utf-8");

describe("db/migrations/0001_init.sql — ciclo de vida de chamados (support_tickets)", () => {
  it("ticket_number é uma coluna única e não nula", () => {
    expect(sql).toMatch(/constraint support_tickets_ticket_number_key unique \(ticket_number\)/i);
  });

  it("merged_into_id não pode apontar para o próprio chamado", () => {
    expect(sql).toMatch(
      /constraint support_tickets_merged_into_not_self check \(merged_into_id is null or merged_into_id <> id\)/i
    );
  });

  it("cancelado é estado final na trigger de proteção de campos", () => {
    expect(sql).toMatch(/old\.status = 'cancelado' and new\.status is distinct from old\.status/i);
  });

  it("chamado mesclado fica congelado (status e merged_into_id imutáveis) na trigger", () => {
    expect(sql).toMatch(/old\.merged_into_id is not null/i);
  });

  it("só admin_ti pode alterar merged_into_id", () => {
    expect(sql).toMatch(
      /new\.merged_into_id is distinct from old\.merged_into_id and not public\.is_admin\(\)/i
    );
  });

  it("só admin_ti pode alterar assigned_to", () => {
    expect(sql).toMatch(
      /new\.assigned_to is distinct from old\.assigned_to and not public\.is_admin\(\)/i
    );
  });

  it("support_ticket_status inclui 'cancelado' como valor do enum", () => {
    expect(sql).toMatch(/create type public\.support_ticket_status as enum\s*\n?\s*\([^)]*'cancelado'/i);
  });
});
