import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateArticleAction } from "../actions";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Card, Section } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";

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
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title={article.title}
        back={{ href: "/dashboard/wiki", label: "Base de conhecimento" }}
        actions={<Badge tone={article.is_published ? "success" : "neutral"}>{article.is_published ? "Publicado" : "Rascunho"}</Badge>}
      />

      <p className="mb-4 text-xs text-slate-400">
        Última atualização em {new Date(article.updated_at).toLocaleDateString("pt-BR")}
        {article.updater ? ` por ${article.updater.full_name}` : article.creator ? ` por ${article.creator.full_name}` : ""}
      </p>

      {/*
        Conteúdo interpolado como texto pelo React (não HTML) — o próprio
        React escapa qualquer marcação, então isto é seguro contra Stored XSS
        sem depender de nenhuma biblioteca de sanitização.
      */}
      <Card className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
        {article.content}
      </Card>

      {canManage ? (
        <Section title="Editar artigo" className="mt-8">
          <Card>
            <form action={updateArticleAction} className="space-y-4">
              <input type="hidden" name="article_id" value={article.id} />
              <Field label="Título" htmlFor="title" required>
                <Input id="title" name="title" defaultValue={article.title} required minLength={3} />
              </Field>
              <Field label="Categoria" htmlFor="category_id">
                <Select id="category_id" name="category_id" defaultValue={article.category_id ?? ""}>
                  <option value="">Nenhuma</option>
                  {(categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Conteúdo" htmlFor="content" required>
                <Textarea id="content" name="content" defaultValue={article.content} required rows={10} />
              </Field>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <Checkbox name="is_published" defaultChecked={article.is_published} />
                Publicado
              </label>
              <div className="flex justify-end">
                <SubmitButton variant="primary" pendingLabel="Salvando...">
                  Salvar alterações
                </SubmitButton>
              </div>
            </form>
          </Card>
        </Section>
      ) : null}
    </>
  );
}
