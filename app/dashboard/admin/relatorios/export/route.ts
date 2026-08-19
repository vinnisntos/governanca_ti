import { requireRole } from "@/lib/utils/require-role";
import { fetchDatasets, isDatasetKey } from "@/lib/reports/datasets";
import { buildXlsxReport } from "@/lib/reports/build-xlsx";
import { buildPdfReport } from "@/lib/reports/build-pdf";

// exceljs e @react-pdf/renderer usam Buffer/APIs de Node — nunca rodar em
// Edge runtime.
export const runtime = "nodejs";

// Entrega via Route Handler (GET), não Server Action: Server Actions do
// Next.js não são feitas para devolver um arquivo binário direto ao browser.
// Autorização: requireRole é defesa em profundidade — middleware.ts já
// bloqueia /dashboard/admin/* para quem não é admin_ti por prefixo de rota.
// Não usamos assertTrustedOrigin() aqui: esse guard é reservado a Server
// Actions que alteram estado; esta rota é GET read-only e os cookies de
// sessão já são SameSite=Strict.
export async function GET(request: Request) {
  const { authorized, supabase } = await requireRole(["admin_ti"]);
  if (!authorized) {
    return new Response("Não autorizado", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  if (format !== "xlsx" && format !== "pdf") {
    return new Response("Formato inválido.", { status: 400 });
  }

  const requestedKeys = searchParams.getAll("datasets").filter(isDatasetKey);
  if (requestedKeys.length === 0) {
    return new Response("Selecione ao menos um dado para exportar.", { status: 400 });
  }

  const datasets = await fetchDatasets(supabase, requestedKeys);
  const buffer = format === "xlsx" ? await buildXlsxReport(datasets) : await buildPdfReport(datasets);

  const contentType =
    format === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/pdf";

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const filename = `relatorio-governanca-ti-${timestamp}.${format}`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
