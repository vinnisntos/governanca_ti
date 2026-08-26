// Arquitetura alinhada com as diretrizes do ADR Master.
//
// Sempre o primeiro dia do mês corrente em America/Sao_Paulo (não UTC) — o
// negócio é brasileiro, e UTC vira o mês ~3h antes da meia-noite em
// horário de Brasília, atribuindo check-ins feitos no fim da noite ao mês
// errado. Deve corresponder ao que o trigger fn_lock_hardware_checkin_fields
// calcula no banco (db/migrations/0001_init.sql, bloco 5), que é a
// fonte de verdade real por sobrescrever qualquer valor enviado pelo client.
export function currentReferenceMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  return `${year}-${month}-01`;
}
