// Arquitetura alinhada com as diretrizes do ADR Master.
// Espelha support_tickets.ticket_number (bigint sequencial, ver
// supabase/migrations/0008_support_ticket_lifecycle.sql) — puramente
// apresentacional, não é usado como identificador em queries (isso continua
// sendo o uuid id).
export function formatTicketNumber(ticketNumber: number): string {
  return `#${String(ticketNumber).padStart(6, "0")}`;
}
