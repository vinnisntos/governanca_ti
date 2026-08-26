-- 0001_init.sql
-- Portal de Governança de TI — inicialização completa do banco Postgres
-- puro (Dokploy), substituindo o schema anterior baseado em Supabase
-- (RLS + Supabase Auth + Supabase Storage).
--
-- Diferenças deliberadas em relação ao supabase/migrations/*.sql antigo:
--   - profiles não referencia mais auth.users (não existe): ganha
--     password_hash e passa a ser a própria tabela de credenciais.
--   - Nova tabela sessions (sessão própria via cookie + token opaco).
--   - Sem RLS (nenhum "enable row level security"/"create policy"): a
--     autorização por linha agora é responsabilidade explícita do código
--     em lib/db + app/**/actions.ts (ver PLANO da migração).
--   - Sem storage.buckets/storage.objects: arquivos vão para filesystem
--     local (ver lib/storage/local.ts).
--   - auth.uid()/auth.role() (GUCs do PostgREST) viram public.current_user_id()
--     e a GUC própria app.client_ip, setadas pela aplicação via
--     lib/db/context.ts antes de cada escrita.
-- Toda a lógica de negócio dos triggers (campos imutáveis, máquina de
-- estados de access_requests/support_tickets, auditoria) é preservada.
-- Idempotente (create/drop ... if exists) — pode ser reexecutado com segurança.

-- ============================================================================
-- 1) EXTENSÕES E TIPOS ENUM
-- ============================================================================

create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('colaborador', 'gestor', 'rh', 'admin_ti');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.access_request_status as enum
    ('pendente', 'em_analise', 'aprovado', 'revogado', 'negado', 'cancelado');
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

do $$ begin
  create type public.support_ticket_status as enum
    ('aberto', 'em_andamento', 'resolvido', 'fechado', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.support_ticket_category as enum
    ('acesso', 'hardware', 'telefonia', 'conta', 'outro');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2) CONTEXTO DE REQUISIÇÃO (substitui auth.uid()/auth.role() do PostgREST)
-- ============================================================================
--
-- A aplicação seta estas duas GUCs via set_config(..., true) (efeito
-- SET LOCAL, só dura a transação atual) no início de toda escrita — ver
-- lib/db/context.ts. Leituras não passam por aqui.

create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid;
$$;

create or replace function public.current_client_ip()
returns inet
language sql
stable
as $$
  select nullif(current_setting('app.client_ip', true), '')::inet;
$$;

-- ============================================================================
-- 3) DEPARTMENTS E PROFILES
-- ============================================================================

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  password_hash text not null,
  role public.user_role not null default 'colaborador',
  department_id uuid references public.departments (id),
  -- ON DELETE SET NULL: mesmo raciocínio de antes (LGPD) — remover um
  -- gestor não pode ficar bloqueado só por liderados apontando pra ele.
  manager_id uuid references public.profiles (id) on delete set null,
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_department on public.profiles (department_id);
create index if not exists idx_profiles_manager on public.profiles (manager_id);

-- Sessão própria: token opaco gerado pela aplicação, guardado aqui só como
-- hash SHA-256 (o token cru só existe no cookie httpOnly do navegador).
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  ip inet,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_sessions_user on public.sessions (user_id);
create index if not exists idx_sessions_expires on public.sessions (expires_at);

-- Defesa em profundidade: nenhum papel não-admin pode alterar campos
-- administrativos do próprio perfil (impede auto-escalonamento de
-- privilégio via role/department_id/manager_id/is_active), com uma única
-- exceção estreita: o próprio usuário pode limpar must_change_password
-- (true -> false) como parte do fluxo de "primeiro acesso", contanto que
-- nenhum outro campo protegido mude na mesma UPDATE. Substitui o antigo
-- bypass via chave service_role do Supabase (não existe mais "papel
-- elevado" — só a aplicação fala com este banco).
create or replace function public.fn_protect_profile_fields()
returns trigger
language plpgsql
as $$
declare
  v_self_password_reset boolean;
begin
  v_self_password_reset :=
    new.id = public.current_user_id()
    and old.must_change_password = true
    and new.must_change_password = false
    and new.role is not distinct from old.role
    and new.department_id is not distinct from old.department_id
    and new.manager_id is not distinct from old.manager_id
    and new.is_active is not distinct from old.is_active;

  if not public.is_admin() and not v_self_password_reset then
    if new.role is distinct from old.role
       or new.department_id is distinct from old.department_id
       or new.manager_id is distinct from old.manager_id
       or new.is_active is distinct from old.is_active
       or new.must_change_password is distinct from old.must_change_password then
      raise exception 'Alteração não autorizada de campo administrativo do perfil';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================================
-- 4) MÓDULO 1 — SOLICITAÇÃO E CONTROLE DE ACESSOS
-- ============================================================================

create table if not exists public.access_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  description text,
  owner_department_id uuid references public.departments (id),
  monthly_cost numeric(10,2) check (monthly_cost is null or monthly_cost >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id),
  -- Nulo quando a solicitação é para um sistema fora do catálogo — ver
  -- requested_system_name. Exatamente um dos dois deve estar preenchido.
  system_id uuid references public.access_catalog (id),
  requested_system_name text,
  justification text not null check (length(trim(justification)) > 0),
  status public.access_request_status not null default 'pendente',
  reviewed_by uuid references public.profiles (id),
  review_notes text,
  decision_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_requests_system_xor_check check (
    (system_id is not null and requested_system_name is null)
    or (system_id is null and requested_system_name is not null and length(trim(requested_system_name)) > 0)
  )
);

create index if not exists idx_access_requests_requester on public.access_requests (requester_id);
create index if not exists idx_access_requests_status on public.access_requests (status);

-- Campos imutáveis após a criação da solicitação: nem o solicitante nem o
-- aprovador podem reescrever quem pediu, o que pediu, ou o motivo original.
create or replace function public.fn_protect_access_request_fields()
returns trigger
language plpgsql
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

-- Máquina de estados: exige justificativa de recusa, carimba
-- automaticamente quem/quando decidiu ou revogou, e define as únicas
-- transições válidas (pendente/em_analise -> aprovado/negado/em_analise;
-- aprovado -> revogado; qualquer estado final não reabre).
create or replace function public.fn_validate_access_request_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.reviewed_by := null;
    new.review_notes := null;
    new.decision_at := null;
    new.revoked_by := null;
    new.revoked_at := null;
    new.revoke_reason := null;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      if old.status in ('negado', 'cancelado', 'revogado') then
        raise exception 'Solicitação já está em estado final (%) e não pode ser reaberta', old.status;
      end if;

      if old.status = 'aprovado' then
        if new.status <> 'revogado' then
          raise exception 'Solicitação aprovada só pode ser revogada, não reaberta para outra decisão';
        end if;

        new.revoked_by := public.current_user_id();
        new.revoked_at := now();
        new.reviewed_by := old.reviewed_by;
        new.review_notes := old.review_notes;
        new.decision_at := old.decision_at;
      else
        if new.status = 'revogado' then
          raise exception 'Só é possível revogar uma solicitação já aprovada';
        end if;

        if new.status = 'negado' and coalesce(length(trim(new.review_notes)), 0) = 0 then
          raise exception 'Motivo de recusa é obrigatório';
        end if;

        if new.status in ('aprovado', 'negado', 'em_analise') then
          new.reviewed_by := public.current_user_id();
          new.decision_at := case when new.status in ('aprovado','negado') then now() else null end;
        else
          new.reviewed_by := old.reviewed_by;
          new.review_notes := old.review_notes;
          new.decision_at := old.decision_at;
        end if;
        new.revoked_by := null;
        new.revoked_at := null;
        new.revoke_reason := null;
      end if;
    else
      new.reviewed_by := old.reviewed_by;
      new.review_notes := old.review_notes;
      new.decision_at := old.decision_at;
      new.revoked_by := old.revoked_by;
      new.revoked_at := old.revoked_at;
      new.revoke_reason := old.revoke_reason;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_access_request_transition on public.access_requests;
create trigger trg_validate_access_request_transition
before insert or update on public.access_requests
for each row execute function public.fn_validate_access_request_transition();

-- ============================================================================
-- 5) MÓDULO 2 — INVENTÁRIO DE HARDWARE & CHECK-IN MENSAL
-- ============================================================================

create table if not exists public.hardware_assets (
  id uuid primary key default gen_random_uuid(),
  asset_tag text not null unique,
  category public.hardware_category not null,
  model text not null,
  serial_number text not null unique,
  status public.hardware_status not null default 'em_estoque',
  assigned_to uuid references public.profiles (id) on delete set null,
  purchase_date date,
  warranty_until date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_hardware_assets_warranty_after_purchase
    check (warranty_until is null or purchase_date is null or warranty_until >= purchase_date)
);

create index if not exists idx_hardware_assets_assigned_to on public.hardware_assets (assigned_to);

-- asset_id é RESTRICT (não CASCADE): hardware_status já modela retirada de
-- circulação via 'baixado'/'extraviado' — contratos e check-ins são
-- registros de auditoria e nunca devem ser arrastados por um DELETE.
create table if not exists public.hardware_contracts (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.hardware_assets (id) on delete restrict,
  profile_id uuid not null references public.profiles (id),
  storage_path text not null,
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_hardware_contracts_profile on public.hardware_contracts (profile_id);

create table if not exists public.hardware_checkins (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.hardware_assets (id) on delete restrict,
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
  constraint uq_checkin_asset_month unique (asset_id, reference_month),
  constraint chk_checkin_reference_month_first_of_month
    check (reference_month = date_trunc('month', reference_month)::date),
  constraint chk_checkin_maintenance_details
    check (not maintenance_requested or coalesce(length(trim(maintenance_details)), 0) > 0)
);

create index if not exists idx_hardware_checkins_profile on public.hardware_checkins (profile_id);

-- reference_month nunca é aceito do client — sempre o mês corrente em
-- America/Sao_Paulo (precisa bater com lib/utils/reference-month.ts). No
-- UPDATE, todo campo histórico é travado — só admin_notes/maintenance_resolved
-- (via requireRole(["admin_ti"]) na Server Action) passam adiante.
create or replace function public.fn_lock_hardware_checkin_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.reference_month := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
  elsif tg_op = 'UPDATE' then
    new.asset_id := old.asset_id;
    new.profile_id := old.profile_id;
    new.reference_month := old.reference_month;
    new.photo_storage_path := old.photo_storage_path;
    new.physical_condition := old.physical_condition;
    new.condition_notes := old.condition_notes;
    new.maintenance_requested := old.maintenance_requested;
    new.maintenance_details := old.maintenance_details;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_hardware_checkin_fields on public.hardware_checkins;
create trigger trg_lock_hardware_checkin_fields
before insert or update on public.hardware_checkins
for each row execute function public.fn_lock_hardware_checkin_fields();

-- ============================================================================
-- 6) MÓDULO 3 — TELEFONIA E LINHAS MÓVEIS
-- ============================================================================

create table if not exists public.mobile_lines (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  carrier text not null,
  plan_name text not null,
  monthly_cost numeric(10,2) not null check (monthly_cost >= 0),
  line_type public.line_type not null,
  status public.mobile_line_status not null default 'ativa',
  assigned_to uuid references public.profiles (id) on delete set null,
  department_id uuid references public.departments (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mobile_lines_assigned_to on public.mobile_lines (assigned_to);

-- ============================================================================
-- 7) MÓDULO 4 — BASE DE CONHECIMENTO (WIKI DE TI)
-- ============================================================================

create table if not exists public.knowledge_base_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  description text
);

create table if not exists public.knowledge_base_articles (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.knowledge_base_categories (id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  content text not null check (length(trim(content)) > 0),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 8) MÓDULO 5 — AUDITORIA IMUTÁVEL (ESTRUTURA)
-- ============================================================================

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  action public.audit_action not null,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references public.profiles (id) on delete set null,
  client_ip inet,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_table on public.audit_logs (table_name, created_at desc);
create index if not exists idx_audit_logs_changed_by on public.audit_logs (changed_by);

-- ============================================================================
-- 9) MÓDULO 6 — CENTRAL DE AJUDA (CHAMADOS DE SUPORTE)
-- ============================================================================

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id),
  category public.support_ticket_category not null default 'outro',
  subject text not null check (length(trim(subject)) > 0),
  status public.support_ticket_status not null default 'aberto',
  assigned_to uuid references public.profiles (id),
  ticket_number bigint not null,
  merged_into_id uuid references public.support_tickets (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint support_tickets_ticket_number_key unique (ticket_number),
  constraint support_tickets_merged_into_not_self check (merged_into_id is null or merged_into_id <> id)
);

create sequence if not exists public.support_tickets_ticket_number_seq
  owned by public.support_tickets.ticket_number;

alter table public.support_tickets
  alter column ticket_number set default nextval('public.support_tickets_ticket_number_seq');

create index if not exists idx_support_tickets_requester on public.support_tickets (requester_id);
create index if not exists idx_support_tickets_status on public.support_tickets (status);
create index if not exists idx_support_tickets_merged_into on public.support_tickets (merged_into_id);

-- Sem coluna de "descrição" separada: a mensagem inicial do solicitante é a
-- primeira linha de support_ticket_messages.
create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  message text not null check (length(trim(message)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_support_ticket_messages_ticket
  on public.support_ticket_messages (ticket_id, created_at);

-- Campos imutáveis + máquina de estados completa (cancelado é final de
-- verdade; chamado mesclado congela; só admin_ti mescla/reatribui).
create or replace function public.fn_protect_support_ticket_fields()
returns trigger
language plpgsql
as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.category is distinct from old.category
     or new.subject is distinct from old.subject
     or new.created_at is distinct from old.created_at then
    raise exception 'Campos imutáveis do chamado não podem ser alterados';
  end if;

  if old.status = 'cancelado' and new.status is distinct from old.status then
    raise exception 'Chamado cancelado é estado final e não pode mudar de status';
  end if;

  if old.merged_into_id is not null
     and (new.status is distinct from old.status
          or new.merged_into_id is distinct from old.merged_into_id) then
    raise exception 'Chamado já mesclado não pode ser alterado';
  end if;

  if new.merged_into_id is distinct from old.merged_into_id and not public.is_admin() then
    raise exception 'Só admin_ti pode mesclar chamados';
  end if;

  if new.assigned_to is distinct from old.assigned_to and not public.is_admin() then
    raise exception 'Só admin_ti pode reatribuir o responsável pelo chamado';
  end if;

  if new.status is distinct from old.status and new.status in ('fechado', 'cancelado') then
    new.closed_at := now();
  elsif new.status is distinct from old.status and old.status in ('fechado', 'cancelado') then
    new.closed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_protect_support_ticket_fields on public.support_tickets;
create trigger trg_protect_support_ticket_fields
before update on public.support_tickets
for each row execute function public.fn_protect_support_ticket_fields();

-- ============================================================================
-- 10) FUNÇÕES AUXILIARES DE AUTORIZAÇÃO
-- ============================================================================
--
-- is_active = false (offboarding) revoga automaticamente qualquer papel
-- especial destas três funções.

create or replace function public.current_role()
returns public.user_role
language sql
stable
as $$
  select role from public.profiles where id = public.current_user_id() and is_active = true;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = public.current_user_id() and role = 'admin_ti' and is_active = true
  );
$$;

create or replace function public.is_manager_of(target_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = target_id and manager_id = public.current_user_id()
      and exists (
        select 1 from public.profiles m where m.id = public.current_user_id() and m.is_active = true
      )
  );
$$;

-- Anexação adiada até aqui porque a função depende de public.is_admin().
drop trigger if exists trg_protect_profile_fields on public.profiles;
create trigger trg_protect_profile_fields
before update on public.profiles
for each row execute function public.fn_protect_profile_fields();

-- ============================================================================
-- 11) TRIGGER GENÉRICO DE AUDITORIA
-- ============================================================================

create or replace function public.fn_audit_trigger()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by, client_ip)
    values (tg_table_name, old.id, 'DELETE', to_jsonb(old), null, public.current_user_id(), public.current_client_ip());
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by, client_ip)
    values (tg_table_name, new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), public.current_user_id(), public.current_client_ip());
    return new;
  elsif tg_op = 'INSERT' then
    insert into public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by, client_ip)
    values (tg_table_name, new.id, 'INSERT', null, to_jsonb(new), public.current_user_id(), public.current_client_ip());
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

drop trigger if exists trg_audit_departments on public.departments;
create trigger trg_audit_departments
after insert or update or delete on public.departments
for each row execute function public.fn_audit_trigger();

drop trigger if exists trg_audit_access_catalog on public.access_catalog;
create trigger trg_audit_access_catalog
after insert or update or delete on public.access_catalog
for each row execute function public.fn_audit_trigger();

drop trigger if exists trg_audit_knowledge_base_categories on public.knowledge_base_categories;
create trigger trg_audit_knowledge_base_categories
after insert or update or delete on public.knowledge_base_categories
for each row execute function public.fn_audit_trigger();

drop trigger if exists trg_audit_support_tickets on public.support_tickets;
create trigger trg_audit_support_tickets
after insert or update or delete on public.support_tickets
for each row execute function public.fn_audit_trigger();

drop trigger if exists trg_audit_support_ticket_messages on public.support_ticket_messages;
create trigger trg_audit_support_ticket_messages
after insert or update or delete on public.support_ticket_messages
for each row execute function public.fn_audit_trigger();

-- ============================================================================
-- 12) SEED — DEPARTAMENTOS PADRÃO
-- ============================================================================

insert into public.departments (name) values
  ('TI'),
  ('Financeiro'),
  ('Desenvolvedores'),
  ('Gestores/Diretoria')
on conflict (name) do nothing;
