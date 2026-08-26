// Arquitetura alinhada com as diretrizes do ADR Master.
//
// toLocaleDateString/toLocaleString("pt-BR") sem `timeZone` explícito usa o
// fuso do AMBIENTE que roda o código — UTC no servidor (Node dentro do
// container), o fuso do navegador do usuário no cliente. Como a mesma data é
// formatada duas vezes (uma no SSR, outra na hidratação client-side de
// componentes "use client"), os dois textos divergem e o React trata isso
// como erro de hidratação (#418/#423/#425) — além de, mesmo em componentes só
// de servidor, mostrar um horário errado (UTC rotulado como se fosse horário
// de Brasília). Fixar timeZone: "America/Sao_Paulo" torna o resultado
// determinístico nos dois ambientes — mesmo padrão já usado em
// lib/utils/reference-month.ts e nas triggers do banco.
const TIME_ZONE = "America/Sao_Paulo";

export function formatDateBR(value: string | Date): string {
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: TIME_ZONE });
}

export function formatDateTimeBR(value: string | Date): string {
  return new Date(value).toLocaleString("pt-BR", { timeZone: TIME_ZONE });
}
