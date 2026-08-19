-- 0002_must_change_password.sql
-- Fluxo de senha descartável no primeiro acesso: quando o admin_ti cria um
-- usuário ou redefine a senha de alguém, a conta fica marcada para forçar a
-- troca de senha no próximo login (middleware.ts redireciona para
-- /primeiro-acesso enquanto a flag estiver true). Este arquivo é idempotente
-- e pode ser reexecutado com segurança.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- Mesma defesa em profundidade já aplicada a role/department_id/manager_id/
-- is_active (ver 0001_init.sql): só admin_ti (ou service_role — usado pela
-- Server Action de troca de senha, depois de confirmar a troca real no
-- Supabase Auth) pode alterar esta flag. Sem isso, o próprio usuário poderia
-- zerá-la via uma chamada direta à API sem nunca ter trocado a senha.
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
       or new.is_active is distinct from old.is_active
       or new.must_change_password is distinct from old.must_change_password then
      raise exception 'Alteração não autorizada de campo administrativo do perfil';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
