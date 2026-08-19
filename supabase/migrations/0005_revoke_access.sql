-- 0005_revoke_access.sql
-- Revogacao de acesso: admin_ti pode encerrar um access_request ja
-- 'aprovado', transicionando para o novo status 'revogado' (adicionado em
-- 0004_add_revoked_status.sql - rode aquele arquivo primeiro, em separado).
-- Idempotente e pode ser reexecutado com seguranca.

alter table public.access_requests
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles (id),
  add column if not exists revoke_reason text;

-- Reescreve a trigger de transicao de status (bloco 3 de 0001_init.sql) para
-- permitir exatamente uma transicao nova: aprovado -> revogado. Todo o resto
-- do comportamento original (reviewed_by/decision_at/review_notes carimbados
-- pelo banco, nunca aceitos do client; negado exige motivo; estados finais
-- nao podem ser reabertos) e preservado.
create or replace function public.fn_validate_access_request_transition()
returns trigger
language plpgsql
security definer
set search_path = public
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
      -- negado/cancelado/revogado sao estados finais de verdade: nenhuma
      -- transicao posterior e legitima (mudar de ideia gera uma NOVA
      -- solicitacao). aprovado tem exatamente UMA saida: revogado.
      if old.status in ('negado', 'cancelado', 'revogado') then
        raise exception 'Solicitação já está em estado final (%) e não pode ser reaberta', old.status;
      end if;

      if old.status = 'aprovado' then
        if new.status <> 'revogado' then
          raise exception 'Solicitação aprovada só pode ser revogada, não reaberta para outra decisão';
        end if;

        new.revoked_by := auth.uid();
        new.revoked_at := now();
        -- preserva o registro original da aprovacao (quem aprovou, quando,
        -- observacao daquela decisao) - revogar nao reescreve historico.
        new.reviewed_by := old.reviewed_by;
        new.review_notes := old.review_notes;
        new.decision_at := old.decision_at;
      else
        -- old.status em pendente/em_analise: fluxo normal de decisao.
        if new.status = 'revogado' then
          raise exception 'Só é possível revogar uma solicitação já aprovada';
        end if;

        if new.status = 'negado' and coalesce(length(trim(new.review_notes)), 0) = 0 then
          raise exception 'Motivo de recusa é obrigatório';
        end if;

        if new.status in ('aprovado', 'negado', 'em_analise') then
          new.reviewed_by := auth.uid();
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
      -- Sem mudanca de status: qualquer tentativa de alterar os campos
      -- carimbados pelo banco sem uma transicao real e ignorada.
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

-- Policy adicional (permissiva, soma-se a access_requests_update_approver):
-- só admin_ti pode revogar, e só a partir de 'aprovado' para 'revogado' -
-- qualquer outra combinação cai fora do using/with check e é negada.
drop policy if exists access_requests_revoke_admin on public.access_requests;
create policy access_requests_revoke_admin on public.access_requests
  for update to authenticated
  using (status = 'aprovado' and public.is_admin())
  with check (status = 'revogado' and public.is_admin());
