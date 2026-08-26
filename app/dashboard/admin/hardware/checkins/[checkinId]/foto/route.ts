import path from "node:path";
import { getSession } from "@/lib/auth/session";
import { pool } from "@/lib/db/client";
import { readFile } from "@/lib/storage/local";

// Substitui createSignedUrl do Supabase Storage: o acesso já passa pela
// sessão do próprio Next.js — só confere posse/papel antes de streamar a
// foto (mesma regra da antiga policy storage_checkin_select).
export async function GET(_request: Request, { params }: { params: Promise<{ checkinId: string }> }) {
  const session = await getSession();
  if (!session) {
    return new Response("Não autenticado", { status: 401 });
  }

  const { checkinId } = await params;
  const { rows } = await pool.query<{ profile_id: string; photo_storage_path: string }>(
    "select profile_id, photo_storage_path from hardware_checkins where id = $1",
    [checkinId]
  );
  const checkin = rows[0];

  if (!checkin || (checkin.profile_id !== session.id && session.role !== "admin_ti")) {
    return new Response("Não encontrado", { status: 404 });
  }

  const buffer = await readFile(checkin.photo_storage_path);
  const ext = path.extname(checkin.photo_storage_path).toLowerCase();
  const contentType =
    ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": contentType } });
}
