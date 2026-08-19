-- 0003_seed_departments.sql
-- Departamentos iniciais da organização, usados em profiles.department_id,
-- access_catalog.owner_department_id e mobile_lines.department_id.
-- Idempotente: "on conflict (name) do nothing" evita duplicar se já tiverem
-- sido cadastrados manualmente antes desta migração.

insert into public.departments (name)
values
  ('TI'),
  ('Financeiro'),
  ('Desenvolvedores'),
  ('Gestores/Diretoria')
on conflict (name) do nothing;
