import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateArticleAction } from "../actions";

type ArticleRow = {
  id: string;
  title: string;
  content: string;
  is_published: boolean;
  category_id: string | null;
  updated_at: string;
  creator: { full_name: string } | null;
  updater: { full_name: string } | null;
};

export default async function WikiArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ articleId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { articleId } = await params;
  const { error: errorMessage, success: successMessage } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const canManage = profile?.role === "admin_ti" || profile?.role === "rh";

  // Se o artigo for rascunho e o usuário não for admin_ti/rh, a policy
  // kb_articles_select simplesmente não retorna a linha — não é possível
  // diferenciar "não existe" de "sem permissão", o que é o comportamento
  // correto (evita vazar a existência de conteúdo não publicado).
  const { data: article } = await supabase
    .from("knowledge_base_articles")
    .select(
      "id, title, content, is_published, category_id, updated_at, creator:profiles!knowledge_base_articles_created_by_fkey(full_name), updater:profiles!knowledge_base_articles_updated_by_fkey(full_name)"
    )
    .eq("id", articleId)
    .maybeSingle<ArticleRow>();

  if (!article) {
    notFound();
  }

  const { data: categories } = await supabase
    .from("knowledge_base_categories")
    .select("id, name")
    .order("name");

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{article.title}</h1>
        <Link href="/dashboard/wiki" className="text-sm text-slate-500 underline">
          Voltar
        </Link>
      </div>

      {errorMessage ? (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}
      {successMessage ? (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {successMessage}
        </p>
      ) : null}

      <p className="mb-6 text-xs text-slate-400">
        {article.is_published ? "Publicado" : "Rascunho"} — última atualização em{" "}
        {new Date(article.updated_at).toLocaleDateString("pt-BR")}
        {article.updater ? ` por ${article.updater.full_name}` : article.creator ? ` por ${article.creator.full_name}` : ""}
      </p>

      {/*
        Conteúdo interpolado como texto pelo React (não HTML) — o próprio
        React escapa qualquer marcação, então isto é seguro contra Stored XSS
        sem depender de nenhuma biblioteca de sanitização.
      */}
      <article className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-800">
        {article.content}
      </article>

      {canManage ? (
        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Editar artigo</h2>
          <form action={updateArticleAction} className="space-y-3">
            <input type="hidden" name="article_id" value={article.id} />
            <div className="space-y-1">
              <label htmlFor="title" className="text-sm font-medium">Título</label>
              <input id="title" name="title" defaultValue={article.title} required minLength={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="space-y-1">
              <label htmlFor="category_id" className="text-sm font-medium">Categoria</label>
              <select id="category_id" name="category_id" defaultValue={article.category_id ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Nenhuma</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="content" className="text-sm font-medium">Conteúdo</label>
              <textarea id="content" name="content" defaultValue={article.content} required rows={10} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_published" defaultChecked={article.is_published} />
              Publicado
            </label>
            <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
              Salvar alterações
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}
