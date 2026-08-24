-- 0006_support_tickets.sql
-- Módulo 6 — Central de Ajuda: chamados de suporte de TI abertos pelo
-- colaborador e atendidos pelo admin_ti, com histórico de mensagens.
-- Idempotente e pode ser reexecutado com segurança.

-- ============================================================================
-- TIPOS ENUM
-- ============================================================================

do $$ begin
  create type public.support_ticket_status as enum
    ('aberto', 'em_andamento', 'resolvido', 'fechado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.support_ticket_category as enum
    ('acesso', 'hardware', 'telefonia', 'conta', 'outro');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- TABELAS
-- ============================================================================

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id),
  category public.support_ticket_category not null default 'outro',
  subject text not null check (length(trim(subject)) > 0),
  status public.support_ticket_status not null default 'aberto',
  -- Preenchido pelo próprio admin_ti que responde primeiro (ver Server
  -- Action) — não é reforçado por trigger porque não é um dado sensível a
  -- forjar, só um indicador de UX de "alguém já está olhando".
  assigned_to uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists idx_support_tickets_requester on public.support_tickets (requester_id);
create index if not exists idx_support_tickets_status on public.support_tickets (status);

-- Sem coluna de "descrição" separada: a mensagem inicial do solicitante é a
-- primeira linha de support_ticket_messages, então abrir um chamado e
-- responder um chamado usam exatamente o mesmo caminho de código.
create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  message text not null check (length(trim(message)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_support_ticket_messages_ticket
  on public.support_ticket_messages (ticket_id, created_at);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Campos imutáveis (quem abriu, assunto, categoria original, data de
-- criação) não podem ser reescritos depois de aberto — só o status e
-- assigned_to mudam ao longo do ciclo de vida do chamado.
create or replace function public.fn_protect_support_ticket_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.category is distinct from old.category
     or new.subject is distinct from old.subject
     or new.created_at is distinct from old.created_at then
    raise exception 'Campos imutáveis do chamado não podem ser alterados';
  end if;

  if new.status is distinct from old.status and new.status = 'fechado' then
    new.closed_at := now();
  elsif new.status is distinct from old.status and old.status = 'fechado' then
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
-- RLS
-- ============================================================================

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets
  for select to authenticated
  using (requester_id = auth.uid() or public.is_admin());

drop policy if exists support_tickets_insert on public.support_tickets;
create policy support_tickets_insert on public.support_tickets
  for insert to authenticated
  with check (requester_id = auth.uid() and status = 'aberto');

-- O solicitante só pode fechar o próprio chamado (ex.: resolveu por conta
-- própria); qualquer outra transição de status é exclusiva do admin_ti.
drop policy if exists support_tickets_update_requester on public.support_tickets;
create policy support_tickets_update_requester on public.support_tickets
  for update to authenticated
  using (requester_id = auth.uid() and status <> 'fechado')
  with check (requester_id = auth.uid() and status = 'fechado');

drop policy if exists support_tickets_update_admin on public.support_tickets;
create policy support_tickets_update_admin on public.support_tickets
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Mensagens: só quem abriu o chamado e admin_ti participam da conversa;
-- sender_id é sempre o próprio autor (nunca em nome de outro usuário), e só
-- é possível escrever enquanto o chamado não estiver fechado.
drop policy if exists support_ticket_messages_select on public.support_ticket_messages;
create policy support_ticket_messages_select on public.support_ticket_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and (t.requester_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists support_ticket_messages_insert on public.support_ticket_messages;
create policy support_ticket_messages_insert on public.support_ticket_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
        and t.status <> 'fechado'
        and (t.requester_id = auth.uid() or public.is_admin())
    )
  );

-- Sem policy de UPDATE/DELETE em mensagens nem de DELETE em tickets:
-- histórico de atendimento é imutável, igual ao restante do portal.

-- ============================================================================
-- AUDITORIA
-- ============================================================================

drop trigger if exists trg_audit_support_tickets on public.support_tickets;
create trigger trg_audit_support_tickets
after insert or update or delete on public.support_tickets
for each row execute function public.fn_audit_trigger();

drop trigger if exists trg_audit_support_ticket_messages on public.support_ticket_messages;
create trigger trg_audit_support_ticket_messages
after insert or update or delete on public.support_ticket_messages
for each row execute function public.fn_audit_trigger();
