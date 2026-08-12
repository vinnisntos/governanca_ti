// Stub usado apenas em testes (vitest.config.ts faz o alias de "server-only"
// para este arquivo). O pacote real "server-only" lança uma Error em
// qualquer ambiente que não sinalize a condition "react-server" do bundler
// do Next.js — o que inclui o runtime Node puro usado pelo Vitest. Sem este
// stub, todo módulo que faz `import "server-only"` (ex.: lib/supabase/server.ts,
// lib/utils/assert-trusted-origin.ts) não poderia ser importado em teste.
export {};
