<div align="center">

# 🛡️ Portal de Governança de TI

**Um único lugar para gerenciar acessos, hardware, telefonia e conhecimento de TI — com segurança Zero-Trust do banco até a interface.**

[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

</div>

---

## ✨ O problema

Times de TI acabam gerenciando acesso a sistemas, notebooks, linhas corporativas e políticas internas espalhados entre planilhas, formulários avulsos e ferramentas desatualizadas. Isso dificulta auditoria, atrasa onboarding/offboarding e esconde custos (licenças ociosas, hardware perdido).

O **Portal de Governança de TI** centraliza isso tudo em um painel único, com todo o controle de permissão garantido no próprio banco de dados — não apenas na interface.

## 🚀 Módulos

| Módulo | O que faz |
|---|---|
| 🔐 **Acessos e Licenças** | Colaborador solicita acesso a um sistema do catálogo (ou pede algo novo via "Outro"); gestor/admin aprova ou recusa com motivo obrigatório; cada um vê só o que tem direito de ver. |
| 💻 **Hardware & Check-in** | Inventário de notebooks/periféricos, termo de responsabilidade em PDF e check-in mensal com foto — 1 por equipamento/mês, garantido pelo banco. |
| 📱 **Telefonia** | Linhas corporativas, plano, operadora e custo mensal, com visão consolidada de gasto. |
| 📚 **Base de Conhecimento** | Wiki interna de políticas e manuais, com rascunhos visíveis só para quem pode editar. |
| 📊 **Dashboard Executivo** | Métricas de solicitações, custos combinados (telefonia + licenças), adesão ao check-in e trilha de auditoria — restrito a admin de TI. |

## 🔒 Segurança por padrão

- **Row Level Security em 100% das tabelas** — o frontend nunca decide quem vê o quê; ele só reflete o que o Postgres já autorizou.
- **RBAC granular** (`admin_ti`, `gestor`, `rh`, `colaborador`), com gestores enxergando apenas os pedidos de seus liderados.
- **Triggers de defesa em profundidade**: campos imutáveis após criação, bloqueio de auto-escalonamento de privilégio, motivo obrigatório em toda recusa.
- **Auditoria imutável**: toda escrita relevante gera log via trigger `SECURITY DEFINER` — nenhum papel client-side consegue escrever nele.
- **Sessão blindada**: cookies `HttpOnly` + `Secure` + `SameSite=Strict`, revalidados a cada request.
- **Zero dependência de APIs de terceiros** — o sistema é isolado por design.

## 🛠️ Stack

**Next.js 14** (App Router, Server Actions) · **TypeScript** · **Supabase** (Postgres, Auth, Storage) · **Tailwind CSS** · **Zod** para validação server-side.

---

<div align="center">

*Projeto interno — consulte a equipe antes de reutilizar fora do contexto original.*

</div>
