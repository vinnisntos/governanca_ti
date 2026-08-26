import path from "node:path";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { pool } from "@/lib/db/client";
import { readFile } from "@/lib/storage/local";

// Substitui createSignedUrl do Supabase Storage: aqui o acesso já passa
// pela sessão do próprio Next.js, então não precisa de URL assinada — só
// confere posse/papel antes de streamar o arquivo (mesma regra da antiga
// policy storage_contracts_select).
export async function GET(_request: Request, { params }: { params: Promise<{ contractId: string }> }) {
  const session = await getSession();
  if (!session || !session.is_active) {
    return new Response("Não autenticado", { status: 401 });
  }

  const { contractId } = await params;
  if (!z.string().uuid().safeParse(contractId).success) {
    return new Response("Não encontrado", { status: 404 });
  }

  const { rows } = await pool.query<{ profile_id: string; storage_path: string }>(
    "select profile_id, storage_path from hardware_contracts where id = $1",
    [contractId]
  );
  const contract = rows[0];

  if (!contract || (contract.profile_id !== session.id && session.role !== "admin_ti")) {
    return new Response("Não encontrado", { status: 404 });
  }

  const buffer = await readFile(contract.storage_path);
  const ext = path.extname(contract.storage_path).toLowerCase();
  const contentType = ext === ".pdf" ? "application/pdf" : "application/octet-stream";

  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": contentType } });
}
