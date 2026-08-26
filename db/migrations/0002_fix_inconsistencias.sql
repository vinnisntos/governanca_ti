-- 0002_fix_inconsistencias.sql
-- Correções de inconsistências encontradas na leitura completa do código
-- (ver catálogo de casos de teste / achados de risco). Cada bloco é
-- independente e idempotente (create or replace / drop+create trigger /
-- create index if not exists), seguindo o mesmo padrão de 0001_init.sql.

-- ============================================================================
-- 1) Admin não pode alterar o próprio role/department_id/manager_id/is_active
--    ------------------------------------------------------------------------
-- Antes, fn_protect_profile_fields liberava qualquer UPDATE feito por
-- is_admin(), inclusive sobre a própria linha — o único bloqueio a
-- auto-promoção/auto-reativação vivia só como checagem de UX em
-- app/dashboard/admin/usuarios/actions.ts (session.id === id). Isso passa a
-- ser reforçado também no banco, defesa em profundidade contra qualquer
-- caminho de escrita futuro que não replique aquela checagem.
-- ============================================================================

create or replace function public.fn_protect_profile_fields()
returns trigger
language plpgsql
as $$
declare
  v_self_password_reset boolean;
  v_sensitive_change boolean;
begin
  v_self_password_reset :=
    new.id = public.current_user_id()
    and old.must_change_password = true
    and new.must_change_password = false
    and new.role is not distinct from old.role
    and new.department_id is not distinct from old.department_id
    and new.manager_id is not distinct from old.manager_id
    and new.is_active is not distinct from old.is_active;

  v_sensitive_change :=
    new.role is distinct from old.role
    or new.department_id is distinct from old.department_id
    or new.manager_id is distinct from old.manager_id
    or new.is_active is distinct from old.is_active
    or new.must_change_password is distinct from old.must_change_password;

  if v_sensitive_change and not v_self_password_reset then
    if not public.is_admin() then
      raise exception 'Alteração não autorizada de campo administrativo do perfil';
    end if;

    -- Mesmo admin_ti não pode alterar role/departamento/gestor/situação do
    -- próprio registro por este caminho — evita auto-promoção/auto-reativação
    -- caso um caminho de escrita futuro não replique a checagem de UX que
    -- hoje vive em app/dashboard/admin/usuarios/actions.ts.
    if new.id = public.current_user_id()
       and (new.role is distinct from old.role
            or new.department_id is distinct from old.department_id
            or new.manager_id is distinct from old.manager_id
            or new.is_active is distinct from old.is_active) then
      raise exception 'Um administrador não pode alterar role, departamento, gestor ou situação do próprio perfil';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================================
-- 2) Dedupe de solicitações de acesso pendentes
--    ------------------------------------------------------------------------
-- Nenhuma constraint impedia o mesmo colaborador de abrir N solicitações
-- pendentes/em_analise para o mesmo system_id (ou o mesmo nome livre, via
-- "Outro"). Dois índices únicos parciais cobrem os dois casos do CHECK
-- access_requests_system_xor_check (exatamente um dos dois preenchido).
-- ============================================================================

create unique index if not exists uq_access_requests_pending_system
  on public.access_requests (requester_id, system_id)
  where status in ('pendente', 'em_analise') and system_id is not null;

create unique index if not exists uq_access_requests_pending_requested_name
  on public.access_requests (requester_id, lower(trim(requested_system_name)))
  where status in ('pendente', 'em_analise') and requested_system_name is not null;

-- ============================================================================
-- 3) Nome de departamento não pode duplicar por variação de maiúsc./minúsc.
--    ------------------------------------------------------------------------
-- departments.name já é UNIQUE, mas case-sensitive — "TI" e "ti" coexistiam
-- como registros distintos.
-- ============================================================================

create unique index if not exists uq_departments_name_ci
  on public.departments (lower(trim(name)));

-- ============================================================================
-- 4) Revogação de acesso passa a exigir motivo (mesmo padrão da recusa)
--    ------------------------------------------------------------------------
-- fn_validate_access_request_transition já exige review_notes ao negar; a
-- transição aprovado -> revogado não tinha checagem equivalente para
-- revoke_reason. Redefinição completa da função (mesmo corpo de
-- 0001_init.sql, só com a checagem nova no branch de revogação).
-- ============================================================================

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

        if coalesce(length(trim(new.revoke_reason)), 0) = 0 then
          raise exception 'Motivo da revogação é obrigatório';
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

-- ============================================================================
-- 5) audit_logs vira verdadeiramente imutável no banco
--    ------------------------------------------------------------------------
-- Antes, a "imutabilidade" era só a ausência de código de aplicação que
-- escrevesse na tabela fora da trigger genérica de auditoria — sem trava
-- real no banco contra UPDATE/DELETE (ex.: acesso direto ao Postgres com as
-- credenciais da aplicação).
-- ============================================================================

create or replace function public.fn_forbid_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs é somente-inserção: UPDATE/DELETE não são permitidos';
end;
$$;

drop trigger if exists trg_forbid_audit_log_mutation on public.audit_logs;
create trigger trg_forbid_audit_log_mutation
before update or delete on public.audit_logs
for each row execute function public.fn_forbid_audit_log_mutation();
