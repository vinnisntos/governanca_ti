-- 0003_access_catalog_source_ref.sql
-- Suporte à sincronização automática do Catálogo de Acessos com a planilha
-- "Assinaturas - Softwares e licenças" do Google Sheets (ver
-- lib/integrations/software-catalog-sync.ts).
--
-- source_ref guarda o descritor da fatura normalizado (trim + espaços
-- colapsados + minúsculo) que originou o item. É a chave estável usada para
-- casar uma linha da planilha com um item já cadastrado — independe do
-- "name" exibido, que um admin_ti pode renomear livremente sem quebrar o
-- casamento em sincronizações futuras. NULL para itens criados manualmente
-- fora dessa integração.

alter table public.access_catalog
  add column if not exists source_ref text;

create unique index if not exists idx_access_catalog_source_ref
  on public.access_catalog (source_ref)
  where source_ref is not null;

-- Backfill: liga os itens já importados manualmente (ver conversa de
-- importação da planilha) ao descritor original da fatura, para que a
-- primeira sincronização automática os reconheça em vez de recriá-los como
-- "novo, pendente de revisão".
update public.access_catalog set source_ref = 'amazon web services' where name = 'AWS (Amazon Web Services)' and source_ref is null;
update public.access_catalog set source_ref = 'anthropic' where name = 'Anthropic API' and source_ref is null;
update public.access_catalog set source_ref = 'anthropic* claude team' where name = 'Claude Team (Anthropic)' and source_ref is null;
update public.access_catalog set source_ref = 'apollo.io' where name = 'Apollo' and source_ref is null;
update public.access_catalog set source_ref = 'assinatura digital' where name = 'Clicksign' and source_ref is null;
update public.access_catalog set source_ref = 'atlassian' where name = 'Jira' and source_ref is null;
update public.access_catalog set source_ref = 'br1*rocketseat' where name = 'Rocketseat' and source_ref is null;
update public.access_catalog set source_ref = 'browserstack' where name = 'BrowserStack' and source_ref is null;
update public.access_catalog set source_ref = 'builder.io' where name = 'Builder.io' and source_ref is null;
update public.access_catalog set source_ref = 'cake.com' where name = 'Cake.com' and source_ref is null;
update public.access_catalog set source_ref = 'claude.ai subscription' where name = 'Claude.ai' and source_ref is null;
update public.access_catalog set source_ref = 'dify professional plan' where name = 'Dify' and source_ref is null;
update public.access_catalog set source_ref = 'dm *hostingercombr' where name = 'Hostinger (1)' and source_ref is null;
update public.access_catalog set source_ref = 'dm*hostingercomb' where name = 'Hostinger (2)' and source_ref is null;
update public.access_catalog set source_ref = 'ebn*hostinger' where name = 'Hostinger (3)' and source_ref is null;
update public.access_catalog set source_ref = 'figma' where name = 'Figma' and source_ref is null;
update public.access_catalog set source_ref = 'fireflies.ai' where name = 'Firefiles' and source_ref is null;
update public.access_catalog set source_ref = 'github' where name = 'GitHub' and source_ref is null;
update public.access_catalog set source_ref = 'google gsuite' where name = 'Google Workspace (G Suite)' and source_ref is null;
update public.access_catalog set source_ref = 'heroku' where name = 'Heroku' and source_ref is null;
update public.access_catalog set source_ref = 'heygen technology inc.' where name = 'HeyGen' and source_ref is null;
update public.access_catalog set source_ref = 'linkedin' where name = 'LinkedIn' and source_ref is null;
update public.access_catalog set source_ref = 'lovable' where name = 'Lovable' and source_ref is null;
update public.access_catalog set source_ref = 'manus ai' where name = 'Manus AI' and source_ref is null;
update public.access_catalog set source_ref = 'miro.com' where name = 'Miro' and source_ref is null;
update public.access_catalog set source_ref = 'paddle.net* n8n cloud1' where name = 'N8N' and source_ref is null;
update public.access_catalog set source_ref = 'pipedrive' where name = 'Pipedrive' and source_ref is null;
update public.access_catalog set source_ref = 'resend' where name = 'Resend' and source_ref is null;
update public.access_catalog set source_ref = 'shown subscription' where name = 'Shown' and source_ref is null;
update public.access_catalog set source_ref = 'slack t0urhdy4b' where name = 'Slack' and source_ref is null;
update public.access_catalog set source_ref = 'trysoro.com' where name = 'TrySoro' and source_ref is null;
update public.access_catalog set source_ref = 'twilio sendgrid' where name = 'Twilio SendGrid' and source_ref is null;
