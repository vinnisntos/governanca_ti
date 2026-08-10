# Arquitetura Técnica — Portal Interno de Governança de TI

> Documento alinhado ao `ADR Master` (`ARCH_DECISIONS.txt`). Toda decisão aqui prioriza segurança sobre conveniência de implementação. Stack de referência: Next.js (SSR/Server Actions) + Supabase (Postgres/Auth/Storage) + AWS EC2 + Nginx.

## 0. Análise de Riscos (resumo)

| Risco | Vetor | Mitigação adotada |
|---|---|---|
| Escalonamento de privilégio | Usuário altera o próprio `role`/`department_id` via update direto | Trigger `fn_protect_profile_fields` bloqueia alteração de campos administrativos por não-admins, independente do RLS |
| Aprovação forjada pelo próprio solicitante | Update malicioso em `access_requests.status` | Policy separa "cancelamento pelo solicitante" de "decisão pelo aprovador"; trigger trava campos imutáveis (`requester_id`, `system_id`, `justification`) |
| Vazamento de token via XSS | Token em `localStorage` | Sessão 100% em cookies `HttpOnly/Secure/SameSite=Strict`, validada com `auth.getUser()` (revalida contra o servidor Auth, não confia em JWT local) |
| Falsificação de IP em log de auditoria | Header `X-Forwarded-For` forjado | Nginx é o único hop confiável (`set_real_ip_from`); a aplicação só usa o IP resolvido pelo proxy, nunca o header bruto do cliente |
| Log de auditoria adulterado/apagado | `DELETE`/`UPDATE` em `audit_logs` | RLS sem policy de escrita para `authenticated`; inserção só ocorre via função `SECURITY DEFINER` disparada por trigger, dona da tabela |
| Acesso cruzado entre colaboradores | Query direta ao Storage/Postgres pelo client | RLS obrigatório em 100% das tabelas + policies de Storage por prefixo de pasta (`{user_id}/...`) |
| Força bruta em login | Tentativas repetidas de senha | Rate limit em camada dupla: Nginx (`limit_req` por IP) + fail2ban (banimento por padrão de log) + rate limit nativo do GoTrue (Supabase Auth) |

---

## 1. Modelagem do Banco de Dados (PostgreSQL / Supabase)

Execute os blocos abaixo em ordem no SQL Editor do Supabase (ou como migrations sequenciais).

### 1.1 Extensões e Tipos ENUM

```sql
-- pgcrypto já vem habilitado por padrão nos projetos Supabase (gen_random_uuid())
create extension if not exists pgcrypto;

create type public.user_role as enum ('colaborador', 'gestor', 'rh', 'admin_ti');

create type public.access_request_status as enum
  ('pendente', 'em_analise', 'aprovado', 'negado', 'cancelado');

create type public.hardware_category as enum
  ('notebook', 'desktop', 'monitor', 'periferico', 'celular', 'outro');

create type public.hardware_status as enum
  ('em_estoque', 'em_uso', 'em_manutencao', 'baixado', 'extraviado');

create type public.physical_condition as enum
  ('otimo', 'bom', 'regular', 'com_defeito');

create type public.line_type as enum ('sim_fisico', 'esim');

create type public.mobile_line_status as enum ('ativa', 'suspensa', 'cancelada');

create type public.audit_action as enum ('INSERT', 'UPDATE', 'DELETE');
```

### 1.2 Estrutura organizacional e Perfis (`profiles`)

`profiles` é a extensão de `auth.users` — nunca armazene role/permissão em `auth.users.raw_user_meta_data`, pois esse campo é editável pelo próprio usuário via client SDK.

```sql
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.user_role not null default 'colaborador',
  department_id uuid references public.departments (id),
  manager_id uuid references public.profiles (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_department on public.profiles (department_id);
create index idx_profiles_manager on public.profiles (manager_id);
```

Provisionamento automático do perfil no cadastro (evita depender de INSERT feito pelo client):

```sql
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

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
```

### 1.3 Módulo 1 — Solicitação e Controle de Acessos

```sql
create table public.access_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  owner_department_id uuid references public.departments (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id),
  system_id uuid not null references public.access_catalog (id),
  justification text not null check (length(trim(justification)) > 0),
  status public.access_request_status not null default 'pendente',
  reviewed_by uuid references public.profiles (id),
  review_notes text,
  decision_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_access_requests_requester on public.access_requests (requester_id);
create index idx_access_requests_status on public.access_requests (status);
```

Regras de negócio garantidas no banco (não dependem do frontend nem do backend se comportarem):

```sql
-- Campos imutáveis após a criação da solicitação
create or replace function public.fn_protect_access_request_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.system_id is distinct from old.system_id
     or new.justification is distinct from old.justification
     or new.created_at is distinct from old.created_at then
    raise exception 'Campos imutáveis da solicitação não podem ser alterados';
  end if;
  return new;
end;
$$;

create trigger trg_protect_access_request_fields
before update on public.access_requests
for each row execute function public.fn_protect_access_request_fields();

-- Exige justificativa de recusa e carimba quem/quando decidiu
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

create trigger trg_validate_access_request_transition
before update on public.access_requests
for each row execute function public.fn_validate_access_request_transition();
```

### 1.4 Módulo 2 — Inventário de Hardware & Check-in Mensal

```sql
create table public.hardware_assets (
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

create index idx_hardware_assets_assigned_to on public.hardware_assets (assigned_to);

create table public.hardware_contracts (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.hardware_assets (id) on delete cascade,
  profile_id uuid not null references public.profiles (id),
  storage_path text not null,
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.hardware_checkins (
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

create index idx_hardware_checkins_profile on public.hardware_checkins (profile_id);
```

`reference_month` deve sempre ser truncado para o primeiro dia do mês pelo backend (`date_trunc('month', now())`) — a constraint `uq_checkin_asset_month` é o que efetivamente impede mais de 1 check-in por máquina/mês, mesmo que a validação do Server Action falhe.

### 1.5 Módulo 3 — Telefonia e Linhas Móveis

```sql
create table public.mobile_lines (
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

create index idx_mobile_lines_assigned_to on public.mobile_lines (assigned_to);
```

### 1.6 Módulo 4 — Base de Conhecimento

```sql
create table public.knowledge_base_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text
);

create table public.knowledge_base_articles (
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
```

### 1.7 Módulo 5 — Auditoria Imutável

```sql
create table public.audit_logs (
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

create index idx_audit_logs_table on public.audit_logs (table_name, created_at desc);
create index idx_audit_logs_changed_by on public.audit_logs (changed_by);
```

---

## 2. Funções auxiliares para RLS

Usar `SECURITY DEFINER` aqui é essencial: sem isso, uma policy em `profiles` que consulta a própria `profiles` para saber o `role` do usuário gera recursão. As funções abaixo rodam com o privilégio do dono (bypassando RLS internamente) e retornam apenas um booleano/valor escalar — não vazam dados.

```sql
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
```

---

## 3. Políticas de RLS (Row Level Security)

**Regra geral aplicada em todas as tabelas abaixo:** `alter table ... enable row level security;` seguido de policies **restritivas por padrão** — qualquer comando sem policy correspondente é negado automaticamente pelo Postgres.

### 3.1 `departments`

```sql
alter table public.departments enable row level security;

create policy departments_select_authenticated on public.departments
  for select to authenticated using (true);

create policy departments_write_admin on public.departments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

### 3.2 `profiles`

Trava adicional de defesa em profundidade contra escalonamento de privilégio — RLS sozinho **não** impede um colaborador de tentar dar `update` em seu próprio `role`, então o trigger abaixo é obrigatório:

```sql
create or replace function public.fn_protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
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

create trigger trg_protect_profile_fields
before update on public.profiles
for each row execute function public.fn_protect_profile_fields();

alter table public.profiles enable row level security;

-- Colaborador vê o próprio perfil; gestor vê seus liderados; RH e admin_ti veem todos
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_admin()
    or public.current_role() = 'rh'
    or manager_id = auth.uid()
  );

-- Update é liberado amplamente pela policy; quem trava os campos sensíveis é o trigger acima
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Não existe policy de DELETE: perfis nunca são apagados (offboarding = is_active = false)
```

### 3.3 `access_catalog`

```sql
alter table public.access_catalog enable row level security;

create policy access_catalog_select on public.access_catalog
  for select to authenticated using (is_active = true or public.is_admin());

create policy access_catalog_write_admin on public.access_catalog
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

### 3.4 `access_requests`

```sql
alter table public.access_requests enable row level security;

-- Colaborador vê a própria solicitação; gestor vê a do liderado; RH/admin veem tudo
create policy access_requests_select on public.access_requests
  for select to authenticated
  using (
    requester_id = auth.uid()
    or public.is_admin()
    or public.current_role() = 'rh'
    or public.is_manager_of(requester_id)
  );

-- Só é possível criar solicitação em nome de si mesmo, e sempre como 'pendente'
create policy access_requests_insert on public.access_requests
  for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pendente');

-- Solicitante só pode cancelar a própria solicitação enquanto pendente
create policy access_requests_update_requester on public.access_requests
  for update to authenticated
  using (requester_id = auth.uid() and status = 'pendente')
  with check (requester_id = auth.uid() and status = 'cancelado');

-- Aprovador (gestor direto ou admin_ti) decide a solicitação
create policy access_requests_update_approver on public.access_requests
  for update to authenticated
  using (public.is_admin() or public.is_manager_of(requester_id))
  with check (public.is_admin() or public.is_manager_of(requester_id));

-- Sem policy de DELETE: histórico de acessos nunca é apagado
```

### 3.5 `hardware_assets`

```sql
alter table public.hardware_assets enable row level security;

create policy hardware_assets_select on public.hardware_assets
  for select to authenticated
  using (assigned_to = auth.uid() or public.is_admin());

create policy hardware_assets_write_admin on public.hardware_assets
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

### 3.6 `hardware_contracts`

```sql
alter table public.hardware_contracts enable row level security;

create policy hardware_contracts_select on public.hardware_contracts
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

create policy hardware_contracts_write_admin on public.hardware_contracts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

### 3.7 `hardware_checkins`

```sql
alter table public.hardware_checkins enable row level security;

create policy hardware_checkins_select on public.hardware_checkins
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

-- Colaborador só registra check-in do próprio equipamento, em seu próprio nome
create policy hardware_checkins_insert on public.hardware_checkins
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.hardware_assets a
      where a.id = asset_id and a.assigned_to = auth.uid()
    )
  );

-- Check-in é um registro histórico imutável para o colaborador;
-- só admin_ti pode complementar com acompanhamento de manutenção
create policy hardware_checkins_update_admin on public.hardware_checkins
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

### 3.8 `mobile_lines`

```sql
alter table public.mobile_lines enable row level security;

create policy mobile_lines_select on public.mobile_lines
  for select to authenticated
  using (assigned_to = auth.uid() or public.is_admin());

create policy mobile_lines_write_admin on public.mobile_lines
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
```

### 3.9 `knowledge_base_categories` / `knowledge_base_articles`

```sql
alter table public.knowledge_base_categories enable row level security;
alter table public.knowledge_base_articles enable row level security;

create policy kb_categories_select on public.knowledge_base_categories
  for select to authenticated using (true);

create policy kb_categories_write on public.knowledge_base_categories
  for all to authenticated
  using (public.is_admin() or public.current_role() = 'rh')
  with check (public.is_admin() or public.current_role() = 'rh');

create policy kb_articles_select on public.knowledge_base_articles
  for select to authenticated
  using (is_published = true or public.is_admin() or public.current_role() = 'rh');

create policy kb_articles_write on public.knowledge_base_articles
  for all to authenticated
  using (public.is_admin() or public.current_role() = 'rh')
  with check (public.is_admin() or public.current_role() = 'rh');
```

### 3.10 `audit_logs` (imutável)

```sql
alter table public.audit_logs enable row level security;

-- Apenas leitura, e apenas para admin_ti
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (public.is_admin());

-- Nenhuma policy de insert/update/delete é criada para 'authenticated':
-- todo INSERT ocorre exclusivamente via trigger SECURITY DEFINER (seção 5),
-- de forma que nenhum papel client-side jamais escreve nesta tabela diretamente.
```

---

## 4. Storage (Supabase Storage) — Fotos de Check-in e Contratos PDF

Buckets **privados** (não públicos), organizados por prefixo `{profile_id}/...` para permitir policies baseadas em pasta:

```sql
insert into storage.buckets (id, name, public)
values
  ('hardware-checkin-photos', 'hardware-checkin-photos', false),
  ('hardware-contracts', 'hardware-contracts', false)
on conflict (id) do nothing;

-- Fotos de check-in: o colaborador só grava/lê dentro da própria pasta; admin lê tudo
create policy storage_checkin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'hardware-checkin-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy storage_checkin_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'hardware-checkin-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- Fotos de check-in nunca são substituídas/apagadas pelo próprio colaborador (registro histórico)
create policy storage_checkin_admin_manage on storage.objects
  for all to authenticated
  using (bucket_id = 'hardware-checkin-photos' and public.is_admin())
  with check (bucket_id = 'hardware-checkin-photos' and public.is_admin());

-- Contratos assinados: upload feito por admin_ti; dono do contrato e admin podem visualizar
create policy storage_contracts_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'hardware-contracts'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy storage_contracts_admin_manage on storage.objects
  for all to authenticated
  using (bucket_id = 'hardware-contracts' and public.is_admin())
  with check (bucket_id = 'hardware-contracts' and public.is_admin());
```

> Regra de negócio no Server Action: o caminho do arquivo enviado é **sempre** montado no backend como `${profile.id}/${crypto.randomUUID()}.${ext}` — nunca a partir de um valor recebido do client — para impedir path traversal e colisão entre usuários.

---

## 5. Auditoria — Trigger Genérico de Captura

O IP do cliente não existe nativamente dentro de uma trigger de Postgres. **Importante:** o Next.js fala com o Supabase via PostgREST — cada chamada do `supabase-js` é uma requisição HTTP isolada, com sua própria transação. Isso descarta o padrão ingênuo de `set_config` "antes do INSERT, na mesma transação": não existe uma transação compartilhada entre a chamada que setaria a variável e a chamada seguinte que faria a escrita.

A solução correta nesta topologia: o backend resolve o IP confiável a partir do header `X-Forwarded-For` que o Nginx sobrescreve com `$remote_addr` (seção 6.2) e o repassa como um **header HTTP customizado** (`x-client-ip`) em toda chamada ao Supabase — configurado uma vez no client SSR (`global.headers`), não a cada query. O PostgREST expõe os headers da requisição recebida ao Postgres através do GUC `request.headers` (JSON), que a trigger lê diretamente:

```ts
// lib/supabase/server.ts — configurado uma única vez ao criar o client
createServerClient(url, anonKey, {
  global: { headers: { "x-client-ip": clientIpResolvidoPeloNginx } },
  cookies: { /* ... */ },
});
```

Função e trigger genérico de auditoria:

```sql
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
```

Anexação nas tabelas críticas (execute uma vez cada):

```sql
create trigger trg_audit_profiles
after insert or update or delete on public.profiles
for each row execute function public.fn_audit_trigger();

create trigger trg_audit_access_requests
after insert or update or delete on public.access_requests
for each row execute function public.fn_audit_trigger();

create trigger trg_audit_hardware_assets
after insert or update or delete on public.hardware_assets
for each row execute function public.fn_audit_trigger();

create trigger trg_audit_hardware_contracts
after insert or update or delete on public.hardware_contracts
for each row execute function public.fn_audit_trigger();

create trigger trg_audit_hardware_checkins
after insert or update or delete on public.hardware_checkins
for each row execute function public.fn_audit_trigger();

create trigger trg_audit_mobile_lines
after insert or update or delete on public.mobile_lines
for each row execute function public.fn_audit_trigger();

create trigger trg_audit_knowledge_base_articles
after insert or update or delete on public.knowledge_base_articles
for each row execute function public.fn_audit_trigger();
```

**Por que isso é imutável de fato:** a função é `SECURITY DEFINER`, executando com o privilégio do dono do schema (o mesmo que criou a tabela `audit_logs`), que não está sujeito às próprias policies de RLS. Como nenhuma policy de `INSERT/UPDATE/DELETE` é concedida a `authenticated` na seção 3.10, nenhum código rodando com o token do usuário — nem mesmo um Server Action comprometido — consegue escrever em `audit_logs` fora deste caminho.

---

## 6. Arquitetura da Aplicação na AWS EC2

### 6.1 Diagrama textual

```
Internet
   │  HTTPS (443) apenas
   ▼
[ Security Group: 80/443 público, 22 restrito a IP de VPN/bastion ]
   ▼
EC2 (Amazon Linux 2023 / Ubuntu 22.04 LTS)
   ├─ Nginx (reverse proxy, TLS termination, security headers, rate limit)
   │     └─ proxy_pass → 127.0.0.1:3000 (Next.js, NUNCA exposto externamente)
   ├─ Next.js (systemd service, usuário não-root "app", PM2 ou systemd)
   ├─ fail2ban (monitora access.log do Nginx, bane IP após N tentativas de 401/429)
   └─ certbot (renovação automática do certificado TLS via ACME/Let's Encrypt)
        │
        ▼ (conexão TLS via connection pooler — Supavisor/PgBouncer)
   Supabase (Postgres gerenciado + Auth + Storage) — rede externa à EC2
```

Pontos de isolamento:
- O processo Node **nunca** faz bind em `0.0.0.0`; apenas `127.0.0.1:3000`.
- A Security Group não abre a porta 3000 para a internet — apenas Nginx é alcançável externamente.
- A `service_role key` do Supabase fica **somente** em variável de ambiente do servidor (carregada via AWS Secrets Manager ou `.env` com permissão `600`, dono `app`), nunca em código versionado nem exposta a rotas client-side.

### 6.2 Nginx — Reverse Proxy, TLS e Headers de Segurança

```nginx
# /etc/nginx/conf.d/portal-ti.conf

limit_req_zone $binary_remote_addr zone=login_zone:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=general_zone:10m rate=60r/m;

# Só confia no IP repassado pelo próprio Nginx local — evita spoofing de X-Forwarded-For
set_real_ip_from 127.0.0.1;
real_ip_header X-Forwarded-For;
real_ip_recursive on;

server {
    listen 80;
    server_name portal-ti.empresa.internal;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name portal-ti.empresa.internal;

    ssl_certificate     /etc/letsencrypt/live/portal-ti.empresa.internal/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portal-ti.empresa.internal/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5:!3DES;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    add_header Content-Security-Policy
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;

    client_max_body_size 15m;   # margem para upload de foto de check-in / PDF de contrato

    location /login {
        limit_req zone=login_zone burst=5 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }

    location / {
        limit_req zone=general_zone burst=30 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

> `X-Forwarded-For` é sobrescrito com `$remote_addr` (não concatenado) propositalmente: como o Nginx é o único hop confiável nesta topologia, isso impede que um client injete um IP falso nesse header antes de chegar ao Nginx.

### 6.3 fail2ban — Banimento por Padrão de Abuso

```ini
# /etc/fail2ban/filter.d/portal-ti-auth.conf
[Definition]
failregex = ^<HOST> .* "(POST|GET) /login.*" (401|429)
ignoreregex =
```

```ini
# /etc/fail2ban/jail.d/portal-ti.conf
[portal-ti-auth]
enabled  = true
filter   = portal-ti-auth
logpath  = /var/log/nginx/access.log
maxretry = 8
findtime = 600
bantime  = 3600
action   = iptables-multiport[name=portal-ti-auth, port="80,443", protocol=tcp]
```

### 6.4 Systemd — Processo Node não-root

```ini
# /etc/systemd/system/portal-ti.service
[Unit]
Description=Portal de Governanca de TI (Next.js)
After=network.target

[Service]
Type=simple
User=app
Group=app
WorkingDirectory=/opt/portal-ti
EnvironmentFile=/opt/portal-ti/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/portal-ti/.next/cache

[Install]
WantedBy=multi-user.target
```

---

## 7. Fluxo Seguro de Autenticação (Next.js + Supabase)

1. **Login**: Server Action recebe credenciais, chama `supabase.auth.signInWithPassword` usando o client Supabase **server-side** (`@supabase/ssr`). A sessão retornada é gravada como cookies `HttpOnly`, `Secure`, `SameSite=Strict` pelo próprio adaptador de cookies do `@supabase/ssr` — nunca manualmente em `localStorage`/`sessionStorage`.
2. **Middleware (`middleware.ts`)**, executado em toda requisição:
   - Reidrata o client Supabase a partir dos cookies da requisição.
   - Chama **`supabase.auth.getUser()`** (não `getSession()`) — `getUser()` revalida o JWT contra o servidor Auth do Supabase a cada chamada, evitando aceitar um cookie de sessão adulterado/expirado que `getSession()` aceitaria apenas por estar bem formado localmente.
   - Se inválido, redireciona para `/login` e limpa cookies.
   - Se válido, busca `role` em `profiles` (server-side) e aplica bloqueio de rota por papel (ex.: `/admin/*` exige `admin_ti`) — **esse é apenas um atalho de UX**, a autoridade real continua sendo o RLS no banco.
3. **CSRF**: com `SameSite=Strict`, cookies não são enviados em navegação cross-site, o que já neutraliza a maior parte dos vetores de CSRF clássico. Como camada adicional, todo Server Action valida `Origin`/`Referer` da requisição contra o domínio esperado antes de processar qualquer mutação.
4. **Toda escrita no banco passa por Server Action/Route Handler**, que:
   - Valida o payload com Zod (schema estrito, `strict()` para rejeitar campos inesperados).
   - Usa o client Supabase criado por `createSupabaseServerClient()`, que já anexa o header `x-client-ip` (IP resolvido pelo Nginx, nunca o header bruto do client) em toda chamada — é assim que o trigger de auditoria (seção 5) recebe o IP, já que cada chamada ao PostgREST é uma transação isolada.
   - Usa a conexão autenticada do usuário (respeitando RLS) para 100% das operações; a `service_role key` é reservada só para rotinas administrativas internas (ex.: job de fechamento mensal de check-in), nunca acionável a partir de uma rota alcançável pelo colaborador comum.
5. **Erros**: nunca retornam stack trace ou mensagem interna do Postgres ao client — o Server Action captura a exceção, loga internamente (ex.: CloudWatch) e retorna uma mensagem genérica (`"Não foi possível concluir a operação"`).

---

## 8. Checklist de Conformidade com o ADR Master

- [x] RLS ativado em 100% das tabelas de negócio.
- [x] Nenhuma dependência de API externa/terceiro (auth, storage e DB nativos do Supabase; sem SendGrid/Twilio/Google APIs).
- [x] Sessão exclusivamente em cookies `HttpOnly/Secure/SameSite=Strict`.
- [x] Nenhuma regra de negócio decidida apenas no client — toda decisão crítica é reforçada por trigger/policy no Postgres.
- [x] Auditoria imutável via trigger `SECURITY DEFINER`, sem policy de escrita para papéis client-side.
- [x] Upload de foto/PDF isolado por pasta `{profile_id}/...` com RLS de Storage.
- [x] Rate limiting em duas camadas (Nginx + fail2ban) nas rotas de autenticação.
- [x] Headers de segurança (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) aplicados no Nginx.
