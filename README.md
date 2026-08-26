<div align="center">

# 🛡️ Portal de Governança de TI

**Um único lugar para gerenciar acessos, hardware, telefonia e conhecimento de TI — com segurança Zero-Trust do banco até a interface.**

[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Dokploy-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

</div>

---

## ✨ O problema

Times de TI acabam gerenciando acesso a sistemas, notebooks, linhas corporativas e políticas internas espalhados entre planilhas, formulários avulsos e ferramentas desatualizadas. Isso dificulta auditoria, atrasa onboarding/offboarding e esconde custos (licenças ociosas, hardware perdido).

O **Portal de Governança de TI** centraliza isso tudo em um painel único, rodando sobre um Postgres próprio (sem dependência de nenhuma plataforma de terceiros) — o Next.js é o único cliente do banco, e toda autenticação, sessão e autorização são resolvidas pela própria aplicação.

## 🚀 Módulos

| Módulo | O que faz |
|---|---|
| 🔐 **Acessos e Licenças** | Colaborador solicita acesso a um sistema do catálogo (ou pede algo novo via "Outro"); gestor/admin aprova ou recusa com motivo obrigatório; cada um vê só o que tem direito de ver. |
| 💻 **Hardware & Check-in** | Inventário de notebooks/periféricos, termo de responsabilidade em PDF e check-in mensal com foto — 1 por equipamento/mês, garantido pelo banco. |
| 📱 **Telefonia** | Linhas corporativas, plano, operadora e custo mensal, com visão consolidada de gasto. |
| 📚 **Base de Conhecimento** | Wiki interna de políticas e manuais, com rascunhos visíveis só para quem pode editar. |
| 📊 **Dashboard Executivo** | Métricas de solicitações, custos combinados (telefonia + licenças), adesão ao check-in e trilha de auditoria — restrito a admin de TI. |

## 🔒 Segurança por padrão

- **Autorização explícita no código**: sem RLS/PostgREST — o Next.js é o único cliente do Postgres, e cada leitura/escrita traz o `WHERE`/`requireRole()` equivalente à antiga policy (ver `db/migrations/0001_init.sql`).
- **RBAC granular** (`admin_ti`, `gestor`, `rh`, `colaborador`), com gestores enxergando apenas os pedidos de seus liderados.
- **Triggers de defesa em profundidade** no próprio Postgres: campos imutáveis após criação, bloqueio de auto-escalonamento de privilégio, motivo obrigatório em toda recusa.
- **Auditoria imutável**: toda escrita relevante gera log via trigger `fn_audit_trigger` — nenhum código de aplicação escreve nela diretamente.
- **Sessão própria**: token opaco em cookie `HttpOnly` + `Secure` + `SameSite=Strict`, validado contra uma tabela `sessions` no banco (revogável na hora ao desativar conta ou redefinir senha).
- **Senhas com `scrypt`** (nativo do Node) — sem serviço externo de autenticação.

## 🛠️ Stack

**Next.js 14** (App Router, Server Actions) · **TypeScript** · **PostgreSQL** (via `pg`, sem ORM) · **Tailwind CSS** · **Zod** para validação server-side. Arquivos ficam em disco (filesystem local, ver `lib/storage/local.ts`), servidos por Route Handlers autenticadas.

---

<div align="center">

*Projeto interno — consulte a equipe antes de reutilizar fora do contexto original.*

</div>
