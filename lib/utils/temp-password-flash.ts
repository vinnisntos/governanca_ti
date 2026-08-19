import "server-only";
import { cookies } from "next/headers";

// Arquitetura alinhada com as diretrizes do ADR Master.
//
// A senha descartável precisa chegar até a tela do admin_ti uma única vez.
// Não usamos o padrão ?success=/?error= (action-redirect.ts) para isso: uma
// senha em texto puro na URL fica gravada no histórico do navegador e nos
// access logs do Nginx, mesmo que a página em si não a reaproveite depois.
// Um cookie HttpOnly de vida curta evita os dois.
//
// Limitação aceita: Server Components não podem apagar cookies durante o
// render (só Server Actions/Route Handlers podem — ver lib/supabase/server.ts).
// Por isso o cookie expira sozinho em 30s em vez de ser apagado no primeiro
// GET; um refresh dentro dessa janela reexibe a senha, o que é aceitável
// dado o ganho de não trafegar o segredo pela URL.
const COOKIE_NAME = "temp_password_flash";
const MAX_AGE_SECONDS = 30;

export type TempPasswordFlash = { email: string; password: string };

export async function setTempPasswordFlash(data: TempPasswordFlash) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, JSON.stringify(data), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: MAX_AGE_SECONDS,
    path: "/dashboard/admin/usuarios",
  });
}

export async function readTempPasswordFlash(): Promise<TempPasswordFlash | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.email === "string" && typeof parsed?.password === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
