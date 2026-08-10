// Arquitetura alinhada com as diretrizes do ADR Master.
//
// Sempre o primeiro dia do mês corrente em UTC — deve corresponder
// exatamente ao que a constraint uq_checkin_asset_month (asset_id,
// reference_month) espera no banco, que é a garantia real de "1 check-in
// por máquina/mês" (supabase/migrations/0001_init.sql, bloco 4).
export function currentReferenceMonth(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}
