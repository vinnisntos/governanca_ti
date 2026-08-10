# 🛡️ Portal Interno de Governança de TI & Gestão de Acessos

Um painel centralizado, seguro e isolado para o gerenciamento do ciclo de vida dos ativos tecnológicos, acessos a sistemas e rotinas operacionais do departamento de TI.

---

## 🎯 Finalidade

O objetivo principal deste sistema é **eliminar a fragmentação de informações** (planilhas soltas, documentos no Drive, Notion desatualizado) criando uma **Fonte Única da Verdade** corporativa.

A aplicação automatiza e audita os processos de Onboarding e Offboarding, previne perdas financeiras (licenças SaaS ociosas e extravio de hardware) e garante que as políticas de segurança da empresa sejam aplicadas de ponta a ponta, utilizando uma arquitetura baseada no princípio de *Zero-Trust* (Confiança Zero).

---

## 📦 Escopo Geral

O escopo abrange o rastreamento completo de qualquer colaborador desde o seu primeiro dia até o seu desligamento. O portal mapeia a relação entre **Pessoas**, **Equipamentos Físicos (Hardware)** e **Sistemas Lógicos (Software/Acessos)**.

O sistema opera de forma 100% autônoma e isolada (sem dependência de APIs externas de terceiros), garantindo máxima privacidade e segurança dos dados internos da empresa. As senhas continuam armazenadas no cofre corporativo (1Password), enquanto este portal orquestra *quem* tem acesso ao quê.

---

## 🚀 Funcionalidades Principais (Módulos)

### 1. 🔐 Gestão de Acessos e Licenças — ✅ Implementado
*   **Workflow de Requisições:** Colaboradores solicitam acesso a ferramentas específicas (ex: CRM, Figma, ERP) diretamente pelo portal.
*   **Aprovação Estruturada:** Fluxo de liberação de acessos (Requisição ➔ Aprovação/Recusa pelo gestor direto ou admin_ti, com motivo obrigatório em caso de recusa).
*   **Catálogo de Sistemas:** Administração central de quais sistemas podem ser solicitados, incluindo o custo mensal da licença (`/dashboard/admin/catalogo`).
*   **Histórico:** Cada colaborador vê o histórico completo das próprias solicitações, com status e motivo de recusa quando aplicável.

### 2. 💻 Inventário de Hardware e Check-in Mensal — ✅ Implementado
*   **Ficha do Ativo:** Registro detalhado de notebooks e periféricos (Patrimônio, N/S, Modelo, Categoria, Status e Responsável atual).
*   **Termos de Responsabilidade:** Upload e armazenamento seguro (Supabase Storage, bucket privado) de contratos assinados em PDF, com link de acesso temporário (signed URL) tanto para o admin quanto para o próprio colaborador.
*   **Check-in Mensal:** O colaborador envia 1x/mês uma foto do equipamento, relata o estado físico e pode abrir solicitação de manutenção — limite de 1 check-in/mês por equipamento garantido por constraint no banco, não só pela aplicação.
*   **Fila de Manutenção:** Painel admin (`/dashboard/admin/hardware/checkins`) para revisar solicitações de manutenção (com a foto enviada) e marcá-las como resolvidas.
*   *Pendente:* checklist de devolução/logística reversa de offboarding.

### 3. 📱 Gestão de Telefonia — ✅ Implementado
*   **Controle de Linhas:** Cadastro de números corporativos, operadora, plano, custo mensal, tipo (SIM físico/eSIM) e responsável/setor.
*   **Visão de Custos:** Total de custo mensal das linhas ativas, calculado no painel admin.
*   **Visibilidade do Colaborador:** Cada colaborador vê apenas as linhas atribuídas a si (`/dashboard/telefonia`).

### 4. 📚 Base de Conhecimento (Wiki de TI) — ✅ Implementado
*   **Políticas e Manuais:** Repositório central de artigos (categorias + conteúdo) para políticas de segurança, manuais e guias de boas práticas (`/dashboard/wiki`).
*   **Publicação Controlada:** Artigos podem ser criados como rascunho (`is_published = false`) e só ficam visíveis a todos depois de publicados; admin_ti e RH sempre veem tudo, inclusive rascunhos.
*   **Conteúdo seguro por padrão:** o texto do artigo é renderizado como texto puro pelo React (sem `dangerouslySetInnerHTML`), o que já neutraliza Stored XSS sem depender de nenhuma biblioteca de sanitização.

### 5. 📊 Dashboard Executivo e Auditoria — ✅ Implementado
*   **Métricas de Requisições:** contagem por status (pendente, em análise, aprovada, negada, cancelada) e lista das recusas recentes com o motivo formal.
*   **Custos:** total mensal de telefonia (linhas ativas) e de licenças/sistemas (catálogo de acessos ativo), com o total combinado.
*   **Adesão ao Check-in:** percentual de equipamentos atribuídos que já fizeram o check-in do mês corrente, com a lista de quem ainda está pendente.
*   **Trilha de Auditoria:** últimas 50 ações registradas em `audit_logs` (quem, o quê, quando) — leitura restrita a `admin_ti` pela própria RLS, testado explicitamente para confirmar que nenhum outro papel consegue ler essa tabela em nenhuma circunstância (`/dashboard/admin/relatorios`).

---

## 🛡️ Arquitetura e Segurança (Zero-Trust)

Este projeto foi construído seguindo diretrizes rígidas de cibersegurança (detalhadas no nosso `ADR Master`, em `ARCH_DECISIONS.txt`, e na documentação técnica completa em `ARQUITETURA_TECNICA.md`). Os pilares de proteção incluem:

*   **Row Level Security (RLS):** Toda a segurança de acesso aos dados ocorre diretamente na camada do Banco de Dados, em **100% das tabelas**. O Frontend não possui autoridade sobre permissões — ele só reflete o que o RLS já decidiu.
*   **Sessões Blindadas:** Uso exclusivo de cookies `HttpOnly`, `Secure` e `SameSite=Strict` para impedir ataques de roubo de sessão (XSS), com revalidação do JWT a cada requisição via `getUser()` (nunca `getSession()`).
*   **RBAC (Role-Based Access Control):** Perfis de acesso granulares (`admin_ti`, `gestor`, `rh`, `colaborador`). Um colaborador só tem permissão para visualizar e interagir com seus próprios dados e equipamentos; um gestor também vê o que seus liderados solicitam.
*   **Triggers de Defesa em Profundidade:** além do RLS, triggers no Postgres impedem auto-escalonamento de privilégio, edição de campos imutáveis (ex.: justificativa de uma solicitação já criada) e exigem motivo formal em toda recusa.
*   **Auditoria Imutável:** toda escrita em tabela crítica gera uma linha em `audit_logs` via trigger `SECURITY DEFINER` — nenhum papel client-side tem permissão de INSERT/UPDATE/DELETE nessa tabela.
*   **Proteção contra Ameaças:** validação estrita com Zod (`.strict()`) em todo Server Action, verificação de `Origin` como camada extra de anti-CSRF, e Rate Limiting previsto na borda (Nginx + fail2ban) para produção.

---

## 🛠️ Stack Tecnológica

*   **Banco de Dados, Auth & Storage:** Supabase (PostgreSQL nativo).
*   **Backend & Frontend:** Next.js 14 (App Router) com Server-Side Rendering (SSR) e Server Actions, TypeScript.
*   **Validação:** Zod (`lib/validations/`).
*   **Estilização:** Tailwind CSS.
*   **Infraestrutura / Hospedagem (planejada):** Instância AWS EC2, com Nginx como Reverse Proxy e fail2ban (ver `ARQUITETURA_TECNICA.md`, seção 6).

---

## 📌 Estado Atual da Implementação

### Banco de dados
Toda a estrutura (tipos ENUM, 11 tabelas, funções auxiliares de RLS, policies, buckets de Storage e triggers de auditoria) está em um único arquivo, **`supabase/migrations/0001_init.sql`**, idempotente e pronto para rodar via `supabase db push` ou colar no SQL Editor. Já aplicado e validado no projeto Supabase real do time.

Dois bugs de produção foram encontrados durante os testes e corrigidos diretamente no arquivo de migration (então qualquer instalação nova já nasce correta):
1. A trigger anti-escalonamento de privilégio (`fn_protect_profile_fields`) bloqueava até a `service_role` e conexões diretas via SQL — tornando impossível promover o primeiro admin. Corrigida para reconhecer esses contextos administrativos.
2. `profiles.manager_id` não tinha `ON DELETE SET NULL` — remover um gestor com liderados vinculados quebrava com erro de integridade referencial. Corrigido.

Uma coluna foi adicionada depois da criação inicial: `access_catalog.monthly_cost` (custo mensal da licença), necessária para o card de custos do Dashboard Executivo — já incorporada ao `0001_init.sql` para instalações novas.

### Aplicação (Next.js)
| Módulo | Rotas | Status |
|---|---|---|
| Autenticação | `/login` | ✅ |
| Dashboard | `/dashboard` | ✅ |
| Acessos | `/dashboard/access-requests`, `/dashboard/approvals`, `/dashboard/admin/catalogo` | ✅ |
| Hardware | `/dashboard/hardware`, `/dashboard/admin/hardware`, `/dashboard/admin/hardware/checkins` | ✅ |
| Telefonia | `/dashboard/telefonia`, `/dashboard/admin/telefonia` | ✅ |
| Base de Conhecimento | `/dashboard/wiki`, `/dashboard/wiki/[articleId]` | ✅ |
| Dashboard Executivo | `/dashboard/admin/relatorios` | ✅ |
| Deploy AWS EC2 | — | ⏳ Pendente (configs de referência prontas em `ARQUITETURA_TECNICA.md`) |

### Metodologia de teste
Cada módulo foi validado **ao vivo** contra o projeto Supabase real (não com mocks): criação de usuários de teste reais via Auth Admin API, login de verdade obtendo um JWT por usuário, exercício do fluxo completo (caminho feliz + tentativas deliberadas de violar RLS/regras de negócio) via chamadas REST autenticadas como cada papel, checagem de que `audit_logs` registrou o autor correto, e limpeza total dos dados de teste ao final (o projeto volta a zero linhas/zero usuários). Esse processo já encontrou e corrigiu os dois bugs citados acima antes que chegassem a um ambiente real de uso.

### Onde encontrar cada coisa
*   `ARQUITETURA_TECNICA.md` — documentação técnica completa (modelagem, RLS, Storage, infraestrutura EC2/Nginx, fluxo de autenticação).
*   `SETUP.md` — passo a passo para rodar o projeto localmente.
*   `ARCH_DECISIONS.txt` — ADR Master com as regras que orientam toda decisão técnica do projeto.
*   `supabase/migrations/0001_init.sql` — schema completo do banco.
*   `lib/validations/` — schemas Zod usados tanto no client quanto no servidor.
*   `lib/supabase/` — clients Supabase (server, browser, middleware).
*   `app/dashboard/` — todas as telas autenticadas, organizadas por módulo.

---

## 🚦 Próximos Passos (Roadmap de Implementação)

- [x] Modelagem do Banco de Dados e políticas RLS no Supabase.
- [x] Desenvolvimento do fluxo de Autenticação e Gestão de Sessões.
- [x] Construção do Módulo de Acessos.
- [x] Construção do Módulo de Hardware e rotina de Check-in (Upload de Imagens/PDFs).
- [x] Construção do Módulo de Telefonia.
- [x] Construção do Módulo de Base de Conhecimento.
- [x] Construção do Dashboard Executivo e tela de Auditoria (Módulo 5).
- [ ] Checklist de devolução/logística reversa no Offboarding de Hardware.
- [ ] Aprovação do Protótipo (MVP) junto à gestão.
- [ ] Deploy na AWS EC2 em ambiente de staging.
