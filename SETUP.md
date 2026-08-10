# Setup do Ambiente de Desenvolvimento

## 1. Pré-requisitos

- Node.js 20+ (testado com v24)
- Uma conta e um projeto criado em [supabase.com](https://supabase.com)
- [Supabase CLI](https://supabase.com/docs/guides/cli) instalado (`npm install -g supabase`), opcional mas recomendado para aplicar as migrations

## 2. Instalar dependências

```bash
npm install
```

## 3. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
```

Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` com os valores em **Project Settings → API** do seu projeto Supabase. `SUPABASE_SERVICE_ROLE_KEY` só é necessária para rotinas administrativas internas — não é obrigatória para rodar o fluxo básico de login/dashboard.

## 4. Aplicar as migrations no Supabase

Existe um único arquivo, `supabase/migrations/0001_init.sql`, que cria toda a estrutura do zero (tipos ENUM → tabelas → funções auxiliares de RLS → policies → storage → triggers de auditoria, nessa ordem interna) e é idempotente — pode ser reexecutado com segurança em caso de falha parcial.

**Opção A — Supabase CLI (recomendado):**

```bash
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

**Opção B — SQL Editor do painel Supabase:**

Cole o conteúdo de `supabase/migrations/0001_init.sql` e execute.

Depois de aplicar tudo, crie ao menos um usuário via **Authentication → Users** no painel (ou pelo próprio fluxo de signup, se implementado) — o trigger `handle_new_user` já cria o `profiles` correspondente automaticamente com `role = 'colaborador'`. Para testar como admin, promova manualmente esse registro:

```sql
update public.profiles set role = 'admin_ti' where email = 'seu-email@empresa.com';
```

(Isso só funciona rodando como um papel com bypass de RLS, ex.: o próprio SQL Editor do Supabase, que roda como `postgres`.)

## 5. Rodar o servidor de desenvolvimento

```bash
npm run dev
```

Acesse `http://localhost:3000` — a rota `/` redireciona para `/login` (sem sessão) ou `/dashboard` (com sessão válida).

## 6. Estado atual da implementação

Este é o esqueleto inicial gerado a partir de `ARQUITETURA_TECNICA.md`. Já implementado:

- Modelagem completa do banco + RLS + auditoria (`supabase/migrations/`)
- Clients Supabase SSR (server/browser/middleware) com cookies HttpOnly/Secure/SameSite=Strict
- Middleware de proteção de rota (atalho de UX; a autoridade real é o RLS)
- Login com Server Action, validação Zod e verificação de Origin (anti-CSRF)
- Dashboard mínimo (prova de que a leitura de `profiles` respeita RLS)
- Schemas Zod dos 5 módulos (`lib/validations/`)

Ainda **não** implementado (próximos passos naturais):

- Telas e Server Actions dos módulos de Acessos, Hardware/Check-in, Telefonia e Base de Conhecimento
- Upload de arquivos para os buckets do Storage (fotos de check-in, contratos PDF)
- Dashboard executivo (Módulo 5) com métricas e trilha de auditoria
- Deploy real na AWS EC2 (Nginx, fail2ban, systemd — configs de referência em `ARQUITETURA_TECNICA.md` seção 6)
