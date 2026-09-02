// register() é o hook padrão do Next.js (App Router), chamado uma vez na
// subida do servidor — ver
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation.
//
// O import dinâmico precisa ficar dentro de um `if` aninhado (não um early
// return) e em arquivo separado: é assim que o Next consegue eliminar essa
// ramificação (e tudo que ela importa, inclusive `pg`) da compilação para o
// runtime edge — no runtime edge não existem os módulos nativos do Node
// (fs/path/net) que o driver do Postgres usa, e edge também compila este
// arquivo por padrão.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
