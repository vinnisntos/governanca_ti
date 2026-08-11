-- 0001_init.sql
-- Arquitetura alinhada com as diretrizes do ADR Master.
-- Portal de Governança de TI — inicialização completa do banco de dados.
-- Ordem interna preservada de propósito (cada bloco depende do anterior):
--   1) extensões e tipos ENUM
--   2) departments e profiles (+ provisionamento automático via auth.users)
--   3) Módulo 1 — Solicitação e Controle de Acessos
--   4) Módulo 2 — Inventário de Hardware & Check-in Mensal
--   5) Módulo 3 — Telefonia e Linhas Móveis
--   6) Módulo 4 — Base de Conhecimento
--   7) Módulo 5 — audit_logs (estrutura)
--   8) funções auxiliares de RLS (current_role/is_admin/is_manager_of)
--   9) políticas de RLS de todas as tabelas
--   10) buckets de Storage e suas policies
--   11) trigger genérico de auditoria e sua anexação nas tabelas críticas
-- Este arquivo é idempotente (create/drop ... if exists) e pode ser
-- reexecutado com segurança em caso de falha parcial.

-- ============================================================================
-- 1) EXTENSÕES E TIPOS ENUM
-- ============================================================================

create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('colaborador', 'gestor', 'rh', 'admin_ti');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.access_request_status as enum
    ('pendente', 'em_analise', 'aprovado', 'negado', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.hardware_category as enum
    ('notebook', 'desktop', 'monitor', 'periferico', 'celular', 'outro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.hardware_status as enum
    ('em_estoque', 'em_uso', 'em_manutencao', 'baixado', 'extraviado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.physical_condition as enum
    ('otimo', 'bom', 'regular', 'com_defeito');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.line_type as enum ('sim_fisico', 'esim');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.mobile_line_status as enum ('ativa', 'suspensa', 'cancelada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.audit_action as enum ('INSERT', 'UPDATE', 'DELETE');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2) DEPARTMENTS E PROFILES
-- ============================================================================

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.user_role not null default 'colaborador',
  department_id uuid references public.departments (id),
  -- ON DELETE SET NULL: se o gestor for removido de auth.users (ex.: exclusão
  -- definitiva por LGPD), os liderados não devem ficar impedindo a exclusão
  -- por causa de uma referência organizacional — eles só ficam sem gestor
  -- até serem realocados. Diferente das FKs de histórico (requester_id,
  -- profile_id em check-ins/contratos etc.), que devem continuar bloqueando
  -- a exclusão (RESTRICT), pois apagar esses registros apagaria auditoria.
  manager_id uuid references public.profiles (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_department on public.profiles (department_id);
create index if not exists idx_profiles_manager on public.profiles (manager_id);

-- Provisionamento automático do perfil no cadastro em auth.users.
-- SECURITY DEFINER: precisa gravar em public.profiles mesmo antes de existir
-- qualquer policy de INSERT liberada para o usuário recém-criado.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.email,
    'colaborador'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Defesa em profundidade: mesmo com RLS permitindo update do próprio registro,
-- nenhum não-admin pode alterar campos administrativos do próprio perfil
-- (impede auto-escalonamento de privilégio via role/department_id/manager_id/is_active).
-- Depende de public.is_admin(), criada no bloco 8 — a trigger só é anexada
-- no bloco 9, quando a função já existe.
--
-- IMPORTANTE: RLS bypass ≠ trigger bypass. Triggers do Postgres disparam
-- para QUALQUER role, inclusive service_role e uma conexão direta via SQL
-- (superuser/table owner não são isentos de trigger, só de RLS). Sem o
-- tratamento abaixo, nem a service_role key nem uma sessão direta no SQL
-- Editor conseguiriam promover o primeiro admin_ti ou vincular um
-- colaborador ao seu gestor — auth.role() é NULL numa conexão direta e
-- 'service_role' quando a chamada vem da secret key, então ambos os casos
-- precisam ser explicitamente liberados aqui.
create or replace function public.fn_protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.role();
begin
  if not public.is_admin()
     and v_role is distinct from 'service_role'
     and v_role is not null then
    if new.role is distinct from old.role
       or new.department_id is distinct from old.department_id
       or new.manager_id is distinct from old.manager_id
       or new.is_active is distinct from old.is_active then
      raise exception 'Alteração não autorizada de campo administrativo do perfil';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================================
-- 3) MÓDULO 1 — SOLICITAÇÃO E CONTROLE DE ACESSOS
-- ============================================================================

create table if not exists public.access_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  owner_department_id uuid references public.departments (id),
  -- Custo mensal da licença/assinatura (quando aplicável) — alimenta o
  -- "Custos de telefonia e licenças" do Dashboard Executivo (Módulo 5).
  monthly_cost numeric(10,2) check (monthly_cost is null or monthly_cost >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id),
  -- Nulo quando a solicitação é para um sistema fora do catálogo — ver
  -- requested_system_name. Exatamente um dos dois deve estar preenchido
  -- (access_requests_system_xor_check).
  system_id uuid references public.access_catalog (id),
  requested_system_name text,
  justification text not null check (length(trim(justification)) > 0),
  status public.access_request_status not null default 'pendente',
  reviewed_by uuid references public.profiles (id),
  review_notes text,
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_requests_system_xor_check check (
    (system_id is not null and requested_system_name is null)
    or (system_id is null and requested_system_name is not null and length(trim(requested_system_name)) > 0)
  )
);

-- Idempotente para bancos onde a tabela já existia antes de system_id se
-- tornar opcional e de requested_system_name/access_requests_system_xor_check
-- serem introduzidos (suporte a pedidos de acesso a sistemas fora do catálogo).
alter table public.access_requests alter column system_id drop not null;
alter table public.access_requests add column if not exists requested_system_name text;
alter table public.access_requests drop constraint if exists access_requests_system_xor_check;
alter table public.access_requests add constraint access_requests_system_xor_check check (
  (system_id is not null and requested_system_name is null)
  or (system_id is null and requested_system_name is not null and length(trim(requested_system_name)) > 0)
);

create index if not exists idx_access_requests_requester on public.access_requests (requester_id);
create index if not exists idx_access_requests_status on public.access_requests (status);

-- Campos imutáveis após a criação da solicitação: nem o solicitante nem o
-- aprovador podem reescrever quem pediu, o que pediu, ou o motivo original.
create or replace function public.fn_protect_access_request_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.system_id is distinct from old.system_id
     or new.requested_system_name is distinct from old.requested_system_name
     or new.justification is distinct from old.justification
     or new.created_at is distinct from old.created_at then
    raise exception 'Campos imutáveis da solicitação não podem ser alterados';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_access_request_fields on public.access_requests;
create trigger trg_protect_access_request_fields
before update on public.access_requests
for each row execute function public.fn_protect_access_request_fields();

-- Exige justificativa de recusa e carimba automaticamente quem/quando decidiu
-- (reviewed_by/decision_at nunca são informados pelo client).
create or replace function public.fn_validate_access_request_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'negado' and coalesce(length(trim(new.review_notes)), 0) = 0 then
      raise exception 'Motivo de recusa é obrigatório';
    end if;

    if new.status in ('aprovado', 'negado', 'em_analise') then
      new.reviewed_by := auth.uid();
      new.decision_at := case when new.status in ('aprovado','negado') then now() else null end;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_access_request_transition on public.access_requests;
create trigger trg_validate_access_request_transition
before update on public.access_requests
for each row execute function public.fn_validate_access_request_transition();

-- ============================================================================
-- 4) MÓDULO 2 — INVENTÁRIO DE HARDWARE & CHECK-IN MENSAL
-- ============================================================================

create table if not exists public.hardware_assets (
  id uuid primary key default gen_random_uuid(),
  asset_tag text not null unique,
  category public.hardware_category not null,
  model text not null,
  serial_number text not null unique,
  status public.hardware_status not null default 'em_estoque',
  assigned_to uuid references public.profiles (id),
  purchase_date date,
  warranty_until date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hardware_assets_assigned_to on public.hardware_assets (assigned_to);

create table if not exists public.hardware_contracts (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.hardware_assets (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  storage_path text not null,
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

-- reference_month deve ser sempre truncado para o primeiro dia do mês pelo
-- backend (date_trunc('month', now())); a constraint abaixo é a garantia real
-- de "1 check-in por máquina/mês", independente do que o Server Action fizer.
create table if not exists public.hardware_checkins (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.hardware_assets (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  reference_month date not null,
  photo_storage_path text not null,
  physical_condition public.physical_condition not null,
  condition_notes text,
  maintenance_requested boolean not null default false,
  maintenance_details text,
  maintenance_resolved boolean not null default false,
  admin_notes text,
  created_at timestamptz not null default now(),
  constraint uq_checkin_asset_month unique (asset_id, reference_month)
);

create index if not exists idx_hardware_checkins_profile on public.hardware_checkins (profile_id);

-- ============================================================================
-- 5) MÓDULO 3 — TELEFONIA E LINHAS MÓVEIS
-- ============================================================================

create table if not exists public.mobile_lines (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  carrier text not null,
  plan_name text not null,
  monthly_cost numeric(10,2) not null check (monthly_cost >= 0),
  line_type public.line_type not null,
  status public.mobile_line_status not null default 'ativa',
  assigned_to uuid references public.profiles (id),
  department_id uuid references public.departments (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mobile_lines_assigned_to on public.mobile_lines (assigned_to);

-- ============================================================================
-- 6) MÓDULO 4 — BASE DE CONHECIMENTO (WIKI DE TI)
-- ============================================================================

create table if not exists public.knowledge_base_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text
);

create table if not exists public.knowledge_base_articles (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.knowledge_base_categories (id),
  title text not null,
  content text not null,
  created_by uuid not null references public.profiles (id),
  updated_by uuid references public.profiles (id),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 7) MÓDULO 5 — AUDITORIA IMUTÁVEL (ESTRUTURA)
-- ============================================================================

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  action public.audit_action not null,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references public.profiles (id),
  client_ip inet,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_table on public.audit_logs (table_name, created_at desc);
create index if not exists idx_audit_logs_changed_by on public.audit_logs (changed_by);

-- ============================================================================
-- 8) FUNÇÕES AUXILIARES DE RLS
-- ============================================================================
--
-- SECURITY DEFINER é essencial aqui: sem isso, uma policy em `profiles` que
-- consulta a própria `profiles` para saber o role do usuário gera recursão.
-- Estas funções rodam com o privilégio do dono (bypassando RLS internamente)
-- e retornam apenas um valor escalar — não vazam dados de outras linhas.

create or replace function public.current_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin_ti'
  );
$$;

create or replace function public.is_manager_of(target_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = target_id and manager_id = auth.uid()
  );
$$;

revoke all on function public.current_role() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_manager_of(uuid) from public;
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_manager_of(uuid) to authenticated;

-- ============================================================================
-- 9) POLÍTICAS DE RLS
-- ============================================================================
--
-- Regra geral: RLS habilitado em 100% das tabelas de negócio. Qualquer
-- comando sem policy correspondente é negado automaticamente pelo Postgres.

-- Anexação adiada até aqui porque a função depende de public.is_admin() (bloco 8).
drop trigger if exists trg_protect_profile_fields on public.profiles;
create trigger trg_protect_profile_fields
before update on public.profiles
for each row execute function public.fn_protect_profile_fields();

-- ============================== departments ==============================
alter table public.departments enable row level security;

drop policy if exists departments_select_authenticated on public.departments;
create policy departments_select_authenticated on public.departments
  for select to authenticated using (true);

drop policy if exists departments_write_admin on public.departments;
create policy departments_write_admin on public.departments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ================================ profiles ================================
alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or public.current_role() = 'rh'
    or manager_id = auth.uid()
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Sem policy de DELETE: perfis nunca são apagados (offboarding = is_active = false)

-- ============================= access_catalog =============================
alter table public.access_catalog enable row level security;

drop policy if exists access_catalog_select on public.access_catalog;
create policy access_catalog_select on public.access_catalog
  for select to authenticated using (is_active = true or public.is_admin());

drop policy if exists access_catalog_write_admin on public.access_catalog;
create policy access_catalog_write_admin on public.access_catalog
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================= access_requests =============================
alter table public.access_requests enable row level security;

drop policy if exists access_requests_select on public.access_requests;
create policy access_requests_select on public.access_requests
  for select to authenticated
  using (
    requester_id = auth.uid()
    or public.is_admin()
    or public.current_role() = 'rh'
    or public.is_manager_of(requester_id)
  );

drop policy if exists access_requests_insert on public.access_requests;
create policy access_requests_insert on public.access_requests
  for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pendente');

drop policy if exists access_requests_update_requester on public.access_requests;
create policy access_requests_update_requester on public.access_requests
  for update to authenticated
  using (requester_id = auth.uid() and status = 'pendente')
  with check (requester_id = auth.uid() and status = 'cancelado');

drop policy if exists access_requests_update_approver on public.access_requests;
create policy access_requests_update_approver on public.access_requests
  for update to authenticated
  using (public.is_admin() or public.is_manager_of(requester_id))
  with check (public.is_admin() or public.is_manager_of(requester_id));

-- Sem policy de DELETE: histórico de acessos nunca é apagado

-- ============================= hardware_assets =============================
alter table public.hardware_assets enable row level security;

drop policy if exists hardware_assets_select on public.hardware_assets;
create policy hardware_assets_select on public.hardware_assets
  for select to authenticated
  using (assigned_to = auth.uid() or public.is_admin());

drop policy if exists hardware_assets_write_admin on public.hardware_assets;
create policy hardware_assets_write_admin on public.hardware_assets
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================ hardware_contracts ============================
alter table public.hardware_contracts enable row level security;

drop policy if exists hardware_contracts_select on public.hardware_contracts;
create policy hardware_contracts_select on public.hardware_contracts
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists hardware_contracts_write_admin on public.hardware_contracts;
create policy hardware_contracts_write_admin on public.hardware_contracts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================ hardware_checkins ============================
alter table public.hardware_checkins enable row level security;

drop policy if exists hardware_checkins_select on public.hardware_checkins;
create policy hardware_checkins_select on public.hardware_checkins
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists hardware_checkins_insert on public.hardware_checkins;
create policy hardware_checkins_insert on public.hardware_checkins
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.hardware_assets a
      where a.id = asset_id and a.assigned_to = auth.uid()
    )
  );

drop policy if exists hardware_checkins_update_admin on public.hardware_checkins;
create policy hardware_checkins_update_admin on public.hardware_checkins
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =============================== mobile_lines ===============================
alter table public.mobile_lines enable row level security;

drop policy if exists mobile_lines_select on public.mobile_lines;
create policy mobile_lines_select on public.mobile_lines
  for select to authenticated
  using (assigned_to = auth.uid() or public.is_admin());

drop policy if exists mobile_lines_write_admin on public.mobile_lines;
create policy mobile_lines_write_admin on public.mobile_lines
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ==================== knowledge_base_categories / articles ====================
alter table public.knowledge_base_categories enable row level security;
alter table public.knowledge_base_articles enable row level security;

drop policy if exists kb_categories_select on public.knowledge_base_categories;
create policy kb_categories_select on public.knowledge_base_categories
  for select to authenticated using (true);

drop policy if exists kb_categories_write on public.knowledge_base_categories;
create policy kb_categories_write on public.knowledge_base_categories
  for all to authenticated
  using (public.is_admin() or public.current_role() = 'rh')
  with check (public.is_admin() or public.current_role() = 'rh');

drop policy if exists kb_articles_select on public.knowledge_base_articles;
create policy kb_articles_select on public.knowledge_base_articles
  for select to authenticated
  using (is_published = true or public.is_admin() or public.current_role() = 'rh');

drop policy if exists kb_articles_write on public.knowledge_base_articles;
create policy kb_articles_write on public.knowledge_base_articles
  for all to authenticated
  using (public.is_admin() or public.current_role() = 'rh')
  with check (public.is_admin() or public.current_role() = 'rh');

-- ================================ audit_logs ================================
alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (public.is_admin());

-- Nenhuma policy de insert/update/delete é criada para 'authenticated':
-- todo INSERT ocorre exclusivamente via trigger SECURITY DEFINER (bloco 11),
-- de forma que nenhum papel client-side jamais escreve nesta tabela diretamente.

-- ============================================================================
-- 10) STORAGE — BUCKETS E POLICIES
-- ============================================================================
--
-- Buckets privados, organizados por prefixo {profile_id}/... para permitir
-- policies baseadas em pasta. O caminho do arquivo é SEMPRE montado no
-- backend como `${profile.id}/${crypto.randomUUID()}.${ext}` — nunca a
-- partir de um valor recebido do client — para impedir path traversal e
-- colisão entre usuários.

insert into storage.buckets (id, name, public)
values
  ('hardware-checkin-photos', 'hardware-checkin-photos', false),
  ('hardware-contracts', 'hardware-contracts', false)
on conflict (id) do nothing;

-- Fotos de check-in: o colaborador só grava/lê dentro da própria pasta; admin lê tudo
drop policy if exists storage_checkin_insert on storage.objects;
create policy storage_checkin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'hardware-checkin-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists storage_checkin_select on storage.objects;
create policy storage_checkin_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'hardware-checkin-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- Fotos de check-in nunca são substituídas/apagadas pelo próprio colaborador
-- (registro histórico); apenas admin_ti pode gerenciar em caso de correção.
drop policy if exists storage_checkin_admin_manage on storage.objects;
create policy storage_checkin_admin_manage on storage.objects
  for all to authenticated
  using (bucket_id = 'hardware-checkin-photos' and public.is_admin())
  with check (bucket_id = 'hardware-checkin-photos' and public.is_admin());

-- Contratos assinados: upload feito por admin_ti; dono do contrato e admin podem visualizar
drop policy if exists storage_contracts_select on storage.objects;
create policy storage_contracts_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'hardware-contracts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists storage_contracts_admin_manage on storage.objects;
create policy storage_contracts_admin_manage on storage.objects
  for all to authenticated
  using (bucket_id = 'hardware-contracts' and public.is_admin())
  with check (bucket_id = 'hardware-contracts' and public.is_admin());

-- ============================================================================
-- 11) TRIGGER GENÉRICO DE AUDITORIA
-- ============================================================================
--
-- O IP do cliente não existe nativamente dentro de uma trigger de Postgres.
-- Importante: o Next.js fala com o Supabase via PostgREST (uma requisição
-- HTTP = uma transação isolada por chamada), então "set_config" feito em uma
-- chamada anterior NUNCA sobreviveria até o INSERT/UPDATE seguinte — por
-- isso NÃO usamos esse padrão aqui (ele só funcionaria com conexão direta
-- ao Postgres reaproveitada dentro de uma única transação).
--
-- Em vez disso, o backend (lib/supabase/server.ts) resolve o IP confiável a
-- partir do header X-Forwarded-For que o próprio Nginx sobrescreve com
-- $remote_addr (nunca aceita o valor bruto do client — ver
-- ARQUITETURA_TECNICA.md seção 6.2) e o repassa em TODA chamada ao Supabase
-- como o header customizado `x-client-ip`. O PostgREST expõe os headers da
-- requisição recebida via o GUC `request.headers` (JSON), que a trigger lê
-- abaixo.

create or replace function public.fn_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip inet;
  v_headers json;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
    v_ip := nullif(v_headers ->> 'x-client-ip', '')::inet;
  exception when others then
    v_ip := null;
  end;

  if tg_op = 'DELETE' then
    insert into public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by, client_ip)
    values (tg_table_name, old.id, 'DELETE', to_jsonb(old), null, auth.uid(), v_ip);
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by, client_ip)
    values (tg_table_name, new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid(), v_ip);
    return new;
  elsif tg_op = 'INSERT' then
    insert into public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by, client_ip)
    values (tg_table_name, new.id, 'INSERT', null, to_jsonb(new), auth.uid(), v_ip);
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
after insert or update or delete on public.profiles
for each row execute function public.fn_audit_trigger();

drop trigger if exists trg_audit_access_requests on public.access_requests;
create trigger trg_audit_access_requests
after insert or update or delete on public.access_requests
for each row execute function public.fn_audit_trigger();

drop trigger if exists trg_audit_hardware_assets on public.hardware_assets;
create trigger trg_audit_hardware_assets
after insert or update or delete on public.hardware_assets
for each row execute function public.fn_audit_trigger();

drop trigger if exists trg_audit_hardware_contracts on public.hardware_contracts;
create trigger trg_audit_hardware_contracts
after insert or update or delete on public.hardware_contracts
for each row execute function public.fn_audit_trigger();

drop trigger if exists trg_audit_hardware_checkins on public.hardware_checkins;
create trigger trg_audit_hardware_checkins
after insert or update or delete on public.hardware_checkins
for each row execute function public.fn_audit_trigger();

drop trigger if exists trg_audit_mobile_lines on public.mobile_lines;
create trigger trg_audit_mobile_lines
after insert or update or delete on public.mobile_lines
for each row execute function public.fn_audit_trigger();

drop trigger if exists trg_audit_knowledge_base_articles on public.knowledge_base_articles;
create trigger trg_audit_knowledge_base_articles
after insert or update or delete on public.knowledge_base_articles
for each row execute function public.fn_audit_trigger();
