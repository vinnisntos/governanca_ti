import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCategoryAction, createArticleAction, togglePublishArticleAction } from "./actions";

type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
};

type ArticleRow = {
  id: string;
  title: string;
  is_published: boolean;
  updated_at: string;
  category_id: string | null;
  knowledge_base_categories: { name: string } | null;
};

export default async function WikiPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
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

  const [{ data: categories }, { data: articles }] = await Promise.all([
    supabase.from("knowledge_base_categories").select("id, name, description").order("name"),
    supabase
      .from("knowledge_base_articles")
      .select("id, title, is_published, updated_at, category_id, knowledge_base_categories(name)")
      .order("updated_at", { ascending: false })
      .returns<ArticleRow[]>(),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Base de Conhecimento</h1>
        <Link href="/dashboard" className="text-sm text-slate-500 underline">
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

      {canManage ? (
        <>
          <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Nova categoria</h2>
            <form action={createCategoryAction} className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <label htmlFor="cat-name" className="text-sm font-medium">Nome</label>
                <input id="cat-name" name="name" required minLength={2} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label htmlFor="cat-description" className="text-sm font-medium">Descrição (opcional)</label>
                <input id="cat-description" name="description" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                Criar categoria
              </button>
            </form>
          </section>

          <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Novo artigo</h2>
            <form action={createArticleAction} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="title" className="text-sm font-medium">Título</label>
                <input id="title" name="title" required minLength={3} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label htmlFor="category_id" className="text-sm font-medium">Categoria (opcional)</label>
                <select id="category_id" name="category_id" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                  <option value="">Nenhuma</option>
                  {(categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="content" className="text-sm font-medium">Conteúdo</label>
                <textarea id="content" name="content" required rows={6} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_published" defaultChecked />
                Publicar imediatamente
              </label>
              <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                Criar artigo
              </button>
            </form>
          </section>
        </>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Artigos</h2>
        {!articles || articles.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum artigo disponível ainda.</p>
        ) : (
          <ul className="space-y-2">
            {articles.map((article) => (
              <li
                key={article.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4"
              >
                <div>
                  <Link href={`/dashboard/wiki/${article.id}`} className="font-medium underline">
                    {article.title}
                  </Link>
                  {article.knowledge_base_categories ? (
                    <p className="text-xs text-slate-400">{article.knowledge_base_categories.name}</p>
                  ) : null}
                </div>

                {canManage ? (
                  <form action={togglePublishArticleAction}>
                    <input type="hidden" name="article_id" value={article.id} />
                    <input type="hidden" name="next_published" value={(!article.is_published).toString()} />
                    <button
                      type="submit"
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        article.is_published ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {article.is_published ? "Publicado" : "Rascunho"}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
