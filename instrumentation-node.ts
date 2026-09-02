// Só é importado pelo register() em instrumentation.ts quando
// NEXT_RUNTIME === "nodejs" (nunca no edge) — ver o comentário lá.
//
// Agenda a sincronização automática do Catálogo de Acessos com a planilha do
// Google Sheets (ver lib/integrations/software-catalog-sync.ts). A aplicação
// roda como processo Node único sob pm2 (ver .github/workflows/ci-cd.yml),
// não em ambiente serverless — por isso um setTimeout auto-reagendado dentro
// do próprio processo resolve, sem depender de cron externo/infra extra.

// Precisa de um export (mesmo vazio) pro TypeScript tratar este arquivo como
// módulo — só assim "declare global" abaixo é válido.
export {};

declare global {
  // eslint-disable-next-line no-var
  var __catalogSyncScheduled: boolean | undefined;
}

function scheduleIfConfigured() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !process.env.GOOGLE_SHEETS_CATALOG_SPREADSHEET_ID) {
    console.log(
      "[catalog-sync] GOOGLE_SERVICE_ACCOUNT_KEY/GOOGLE_SHEETS_CATALOG_SPREADSHEET_ID não configuradas — sincronização automática desativada (o botão manual na tela de Catálogo de Acessos também exige essas variáveis)."
    );
    return;
  }

  const hourUTC = Number(process.env.CATALOG_SYNC_HOUR_UTC ?? 6);
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  function msUntilNextRun(): number {
    const now = new Date();
    const next = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUTC, 0, 0, 0)
    );
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next.getTime() - now.getTime();
  }

  async function runAndReschedule() {
    try {
      const { syncSoftwareCatalogFromSheet } = await import("@/lib/integrations/software-catalog-sync");
      const summary = await syncSoftwareCatalogFromSheet();
      console.log("[catalog-sync] sincronização automática concluída", {
        atualizados: summary.updated.length,
        novos: summary.inserted.length,
        falhas: summary.conflicts.length + summary.errors.length,
      });
    } catch (error) {
      console.error("[catalog-sync] sincronização automática falhou", { message: (error as Error).message });
    }
    setTimeout(runAndReschedule, ONE_DAY_MS);
  }

  setTimeout(runAndReschedule, msUntilNextRun());
}

// Evita agendar duas vezes num hot-reload do dev server.
if (!globalThis.__catalogSyncScheduled) {
  globalThis.__catalogSyncScheduled = true;
  scheduleIfConfigured();
}
