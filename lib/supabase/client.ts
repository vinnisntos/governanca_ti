import { createBrowserClient } from "@supabase/ssr";

// Arquitetura alinhada com as diretrizes do ADR Master.
//
// Cliente Supabase para Client Components. Usado apenas para casos que
// exigem reatividade no browser (ex.: escutar onAuthStateChange para
// redirecionar em outra aba após logout). NUNCA usado para decidir
// permissões: toda leitura/escrita real passa por RLS no banco e por
// validação em Server Actions/Route Handlers.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
