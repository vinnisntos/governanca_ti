import "server-only";
import { headers } from "next/headers";

// Nginx sobrescreve (não concatena) este header com $remote_addr — ver
// ARQUITETURA_TECNICA.md seção 6.2 — por isso é seguro repassá-lo como
// identificador confiável de origem para a trilha de auditoria (ver
// lib/db/context.ts / fn_audit_trigger em db/migrations/0001_init.sql).
export async function getClientIp(): Promise<string | null> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
