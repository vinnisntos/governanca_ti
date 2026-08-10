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

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user, supabase } = await updateSession(request);
  const path = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
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
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
