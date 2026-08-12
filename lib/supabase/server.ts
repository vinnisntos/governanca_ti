import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

// Arquitetura alinhada com as diretrizes do ADR Master.
//
// Cliente Supabase para uso em Server Components / Server Actions / Route
// Handlers. A sessão trafega exclusivamente via cookies HttpOnly/Secure/
// SameSite=Strict geridos pelo próprio adaptador do @supabase/ssr — nunca em
// localStorage/sessionStorage.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const headerList = await headers();

  // O Nginx sobrescreve (não concatena) este header com $remote_addr — ver
  // ARQUITETURA_TECNICA.md seção 6.2 — por isso é seguro repassá-lo como
  // identificador confiável de origem para a trilha de auditoria via o
  // header customizado x-client-ip, lido pela trigger de auditoria
  // (ver bloco 11 de supabase/migrations/0001_init.sql).
  const clientIp = headerList.get("x-forwarded-for")?.split(",")[0]?.trim();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: clientIp ? { "x-client-ip": clientIp } : {},
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                httpOnly: true,
                secure: true,
                sameSite: "strict",
              })
            );
          } catch {
            // Setar cookies a partir de um Server Component (fora de uma
            // Server Action/Route Handler) não é permitido pelo Next.js e é
            // ignorado aqui: o middleware.ts é responsável por refrescar a
            // sessão nesse caso.
          }
        },
      },
    }
  );
}

// Cliente com a service_role key — bypassa RLS. Uso restrito a rotinas
// administrativas internas do backend (ex.: job de fechamento mensal de
// check-in). NUNCA importar este módulo em código alcançável por uma rota
// que aceite input direto de um colaborador comum.
export function createSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  }

  return createServerClient(url, serviceRoleKey, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  });
}
