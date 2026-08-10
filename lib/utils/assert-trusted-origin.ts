import "server-only";
import { headers } from "next/headers";

// Arquitetura alinhada com as diretrizes do ADR Master.
//
// Camada defensiva adicional de anti-CSRF, além da proteção nativa do
// Next.js para Server Actions (que já compara Origin x Host) e do
// SameSite=Strict dos cookies de sessão. Chamada no início de TODO Server
// Action que altera estado (INSERT/UPDATE/DELETE), conforme exigido pelo
// ADR Master para "requisições de alteração de estado".
export async function assertTrustedOrigin() {
  const headerList = await headers();
  const origin = headerList.get("origin");
  const host = headerList.get("host");

  if (!origin || !host || new URL(origin).host !== host) {
    throw new Error("Origem da requisição não confiável");
  }
}
