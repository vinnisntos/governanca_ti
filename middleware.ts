import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

// O Next.js 14 só roda Middleware no runtime Edge, que não suporta `pg`
// (sem TCP direto) — então este middleware é SÓ um atalho de UX (cookie de
// sessão presente? redireciona), igual ao espírito do comentário que já
// existia aqui antes ("RLS é a autoridade real"). Agora que RLS não existe
// mais, a autoridade real é a checagem feita em app/dashboard/layout.tsx e
// app/dashboard/admin/layout.tsx (Node runtime, consulta o banco de
// verdade): validade da sessão, is_active, must_change_password e papel
// admin_ti. Mesmo que este middleware tivesse um bug, essas layouts
// continuariam recusando acesso.
const PUBLIC_PATHS = ["/login"];

function buildCsp(nonce: string) {
  // O Fast Refresh do "next dev" avalia chunks via eval() — sem 'unsafe-eval'
  // a CSP quebra toda interatividade client-side apenas neste modo. Produção
  // (o que importa para segurança) continua sem 'unsafe-eval'.
  const scriptSrc =
    process.env.NODE_ENV === "development"
      ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
      : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return (
    `default-src 'self'; script-src ${scriptSrc}; ` +
    "style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
    "connect-src 'self'; frame-ancestors 'none'; " +
    "base-uri 'self'; form-action 'self'"
  );
}

// Compara por segmento de rota (igual ou prefixo seguido de "/"), não por
// startsWith puro — evita que uma rota futura como "/login-ajuda" seja
// tratada como pública por acidente.
function matchesPath(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const path = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((p) => matchesPath(path, p));
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!hasSessionCookie && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    const response = NextResponse.redirect(url);
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  if (hasSessionCookie && isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    const response = NextResponse.redirect(url);
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
