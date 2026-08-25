-- 0007_support_ticket_cancel_status.sql
-- Adiciona o valor 'cancelado' ao enum support_ticket_status, usado pelo
-- fluxo de cancelamento de chamados (colaborador cancela antes do TI
-- assumir, ou admin_ti cancela a qualquer momento).
--
-- IMPORTANTE: rode este arquivo SOZINHO no SQL Editor (um "Run" separado),
-- e só depois rode 0008_support_ticket_lifecycle.sql. O Postgres não permite
-- usar um valor de enum recém-adicionado dentro da MESMA transação em que
-- ele foi criado (e ALTER TYPE ... ADD VALUE também não pode rodar dentro de
-- um bloco de função/DO) — por isso este arquivo tem uma única instrução.

alter type public.support_ticket_status add value if not exists 'cancelado';
