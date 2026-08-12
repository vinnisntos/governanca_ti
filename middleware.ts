import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Arquitetura alinhada com as diretrizes do ADR Master.
//
// Este middleware é apenas um atalho de UX (redireciona quem não deveria
// estar em uma rota). A autoridade real sobre o que cada papel pode ler ou
// escrever é o RLS no Postgres (ver bloco 9 de supabase/migrations/0001_init.sql) —
// mesmo que este middleware tivesse um bug, o banco continuaria recusando
// operações não autorizadas.
const PUBLIC_PATHS = ["/login"];
const ADMIN_PATHS = ["/dashboard/admin"];

// Nonce por requisição para a CSP: o App Router injeta o payload de RSC via
// <script> inline (self.__next_f.push(...)) durante a hidratação — sem um
// nonce reconhecido nela, script-src 'self' bloqueia esses scripts e a
// página quebra no cliente (React error #423 / "Connection closed").
// Next.js lê o nonce a partir do header Content-Security-Policy presente
// na requisição encaminhada e o aplica automaticamente aos scripts que ele
// mesmo gera. Ver https://nextjs.org/docs/app/guides/content-security-policy
function buildCsp(nonce: string) {
  return (
    `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; ` +
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.supabase.co; " +
    "connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; " +
    "base-uri 'self'; form-action 'self'"
  );
}

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const { supabaseResponse, user, supabase } = await updateSession(request, requestHeaders);
  const path = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const response = NextResponse.redirect(url);
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  if (user && isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    const response = NextResponse.redirect(url);
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  if (user && ADMIN_PATHS.some((p) => path.startsWith(p))) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin_ti") {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      const response = NextResponse.redirect(url);
      response.headers.set("Content-Security-Policy", csp);
      return response;
    }
  }

  supabaseResponse.headers.set("Content-Security-Policy", csp);
  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
