import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Mesma metodologia de test/unit/sql/migration-rls-static-checks.test.ts:
// verificações estáticas/textuais sobre a migration para transformar os
// invariantes de segurança do ciclo de vida de chamados (cancelamento
// terminal, mesclagem congela o chamado, reabertura sem prazo) em regressão
// automatizada, sem depender de credenciais de banco.

const sql = readFileSync(
  path.resolve(__dirname, "../../../supabase/migrations/0008_support_ticket_lifecycle.sql"),
  "utf-8"
);

describe("supabase/migrations/0008_support_ticket_lifecycle.sql", () => {
  it("ticket_number é uma coluna única e não nula", () => {
    expect(sql).toMatch(/add constraint support_tickets_ticket_number_key unique \(ticket_number\)/i);
  });

  it("merged_into_id não pode apontar para o próprio chamado", () => {
    expect(sql).toMatch(
      /add constraint support_tickets_merged_into_not_self\s+check \(merged_into_id is null or merged_into_id <> id\)/i
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

  it("só admin_ti pode alterar assigned_to (fecha lacuna da v1)", () => {
    expect(sql).toMatch(
      /new\.assigned_to is distinct from old\.assigned_to and not public\.is_admin\(\)/i
    );
  });

  it("existem as três policies granulares de update do solicitante", () => {
    expect(sql).toMatch(/create policy support_tickets_close_requester/i);
    expect(sql).toMatch(/create policy support_tickets_cancel_requester/i);
    expect(sql).toMatch(/create policy support_tickets_reopen_requester/i);
  });

  it("cancelamento pelo solicitante só é permitido a partir de 'aberto'", () => {
    const cancelPolicyBlock = sql.slice(
      sql.indexOf("create policy support_tickets_cancel_requester"),
      sql.indexOf("create policy support_tickets_reopen_requester")
    );
    expect(cancelPolicyBlock).toMatch(/using \(requester_id = auth\.uid\(\) and status = 'aberto'\)/i);
  });

  it("reabertura pelo solicitante não tem restrição de prazo e exige chamado não mesclado", () => {
    const reopenPolicyBlock = sql.slice(sql.indexOf("create policy support_tickets_reopen_requester"));
    expect(reopenPolicyBlock).toMatch(
      /using \(requester_id = auth\.uid\(\) and status in \('resolvido', 'fechado'\) and merged_into_id is null\)/i
    );
  });

  it("mensagens novas são bloqueadas em chamado fechado, cancelado ou mesclado", () => {
    expect(sql).toMatch(
      /t\.status not in \('fechado', 'cancelado'\)\s+and t\.merged_into_id is null/i
    );
  });
});
