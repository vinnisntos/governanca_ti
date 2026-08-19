-- 0004_add_revoked_status.sql
-- Adiciona o valor 'revogado' ao enum access_request_status, usado pela
-- funcionalidade de revogacao de acesso (admin_ti encerra um acesso ja
-- aprovado).
--
-- IMPORTANTE: rode este arquivo SOZINHO no SQL Editor (um "Run" separado),
-- e so depois rode 0005_revoke_access.sql. O Postgres nao permite usar um
-- valor de enum recem-adicionado dentro da MESMA transacao em que ele foi
-- criado (e ALTER TYPE ... ADD VALUE tambem nao pode rodar dentro de um
-- bloco de funcao/DO) - por isso este arquivo tem uma unica instrucao.

alter type public.access_request_status add value if not exists 'revogado' after 'aprovado';
