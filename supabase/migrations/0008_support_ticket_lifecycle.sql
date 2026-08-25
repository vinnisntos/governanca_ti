-- 0008_support_ticket_lifecycle.sql
-- Central de Ajuda — ciclo de vida profissional de chamados: código de
-- chamado legível, mesclagem de duplicados, cancelamento e reabertura sem
-- prazo. Depende de 0007_support_ticket_cancel_status.sql (rodado antes,
-- sozinho). Idempotente e pode ser reexecutado com segurança.

-- ============================================================================
-- TICKET_NUMBER — código de chamado legível (#000123 na UI)
-- ============================================================================

create sequence if not exists public.support_tickets_ticket_number_seq;

alter table public.support_tickets
  add column if not exists ticket_number bigint;

update public.support_tickets
  set ticket_number = nextval('public.support_tickets_ticket_number_seq')
  where ticket_number is null;

alter table public.support_tickets
  alter column ticket_number set not null,
  alter column ticket_number set default nextval('public.support_tickets_ticket_number_seq');

do $$ begin
  alter table public.support_tickets
    add constraint support_tickets_ticket_number_key unique (ticket_number);
exception when duplicate_object then null; end $$;

alter sequence public.support_tickets_ticket_number_seq owned by public.support_tickets.ticket_number;

-- ============================================================================
-- MERGED_INTO_ID — mesclagem de chamados duplicados (mesmo solicitante)
-- ============================================================================

alter table public.support_tickets
  add column if not exists merged_into_id uuid references public.support_tickets (id);

do $$ begin
  alter table public.support_tickets
    add constraint support_tickets_merged_into_not_self
    check (merged_into_id is null or merged_into_id <> id);
exception when duplicate_object then null; end $$;

create index if not exists idx_support_tickets_merged_into on public.support_tickets (merged_into_id);

-- ============================================================================
-- MÁQUINA DE ESTADOS — reescreve fn_protect_support_ticket_fields
-- ============================================================================
-- Mesmo padrão de fn_validate_access_request_transition
-- (supabase/migrations/0005_revoke_access.sql): um único lugar concentra as
-- regras de transição válidas, além das guardas de campos imutáveis já
-- existentes desde 0006_support_tickets.sql.

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

  -- cancelado é estado final de verdade: reabertura de chamado cancelado não
  -- existe (diferente de resolvido/fechado, que podem reabrir) — o
  -- colaborador abre um novo chamado se ainda precisar de ajuda.
  if old.status = 'cancelado' and new.status is distinct from old.status then
    raise exception 'Chamado cancelado é estado final e não pode mudar de status';
  end if;

  -- Uma vez mesclado, o chamado de origem fica congelado (somente leitura):
  -- todo o atendimento continua no chamado de destino.
  if old.merged_into_id is not null
     and (new.status is distinct from old.status
          or new.merged_into_id is distinct from old.merged_into_id) then
    raise exception 'Chamado já mesclado não pode ser alterado';
  end if;

  if new.merged_into_id is distinct from old.merged_into_id and not public.is_admin() then
    raise exception 'Só admin_ti pode mesclar chamados';
  end if;

  -- Fecha uma lacuna da v1: assigned_to era alterável por qualquer papel via
  -- chamada direta à API (só a UI restringia o botão a admin_ti).
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

-- ============================================================================
-- RLS — support_tickets: substitui a policy única de update do solicitante
-- por três policies granulares (fechar / cancelar / reabrir)
-- ============================================================================

drop policy if exists support_tickets_update_requester on public.support_tickets;

-- O solicitante pode encerrar o próprio chamado a partir de qualquer estado
-- ativo (inclusive "resolvido", como confirmação de que o problema acabou).
drop policy if exists support_tickets_close_requester on public.support_tickets;
create policy support_tickets_close_requester on public.support_tickets
  for update to authenticated
  using (requester_id = auth.uid() and status in ('aberto', 'em_andamento', 'resolvido'))
  with check (requester_id = auth.uid() and status = 'fechado');

-- Cancelamento pelo solicitante só antes de alguém do TI assumir o chamado
-- (status ainda 'aberto'); depois disso, só admin_ti cancela
-- (support_tickets_update_admin já cobre esse caso).
drop policy if exists support_tickets_cancel_requester on public.support_tickets;
create policy support_tickets_cancel_requester on public.support_tickets
  for update to authenticated
  using (requester_id = auth.uid() and status = 'aberto')
  with check (requester_id = auth.uid() and status = 'cancelado');

-- Reabertura sem prazo, a partir de resolvido/fechado, contanto que o
-- chamado não tenha sido mesclado (chamado mesclado é congelado — a
-- trigger acima também bloquearia, esta policy só evita a viagem ao banco).
drop policy if exists support_tickets_reopen_requester on public.support_tickets;
create policy support_tickets_reopen_requester on public.support_tickets
  for update to authenticated
  using (requester_id = auth.uid() and status in ('resolvido', 'fechado') and merged_into_id is null)
  with check (requester_id = auth.uid() and status = 'aberto');

-- support_tickets_update_admin (0006_support_tickets.sql) não muda: admin_ti
-- continua podendo fazer qualquer transição, incluindo mesclar e sobrepor a
-- decisão de fechar/reabrir em nome do solicitante que não respondeu.

-- ============================================================================
-- RLS — support_ticket_messages: chamado mesclado ou em estado final não
-- recebe mais mensagens novas (mas continua legível, para consulta)
-- ============================================================================

drop policy if exists support_ticket_messages_insert on public.support_ticket_messages;
create policy support_ticket_messages_insert on public.support_ticket_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
        and t.status not in ('fechado', 'cancelado')
        and t.merged_into_id is null
        and (t.requester_id = auth.uid() or public.is_admin())
    )
  );
