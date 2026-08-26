import { notFound } from "next/navigation";
import { pool } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { updateArticleAction } from "../actions";
import { formatDateBR } from "@/lib/utils/format-datetime";
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
  creator_full_name: string | null;
  updater_full_name: string | null;
};

type CategoryOption = { id: string; name: string };

export default async function WikiArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ articleId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { articleId } = await params;
  const { error: errorMessage, success: successMessage } = await searchParams;
  const session = await getSession();

  const canManage = session?.role === "admin_ti" || session?.role === "rh";

  // Sem RLS: se o artigo for rascunho e o usuário não puder gerenciar, o
  // WHERE abaixo simplesmente não retorna a linha — mesmo comportamento de
  // antes (não dá pra diferenciar "não existe" de "sem permissão", o que é
  // proposital: evita vazar a existência de conteúdo não publicado).
  const { rows } = await pool.query<ArticleRow>(
    `select a.id, a.title, a.content, a.is_published, a.category_id, a.updated_at,
            creator.full_name as creator_full_name, updater.full_name as updater_full_name
     from knowledge_base_articles a
     left join profiles creator on creator.id = a.created_by
     left join profiles updater on updater.id = a.updated_by
     where a.id = $1 and ($2 or a.is_published = true)`,
    [articleId, canManage]
  );

  const article = rows[0];
  if (!article) {
    notFound();
  }

  const { rows: categories } = await pool.query<CategoryOption>(
    "select id, name from knowledge_base_categories order by name"
  );

  return (
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title={article.title}
        back={{ href: "/dashboard/wiki", label: "Base de conhecimento" }}
        actions={<Badge tone={article.is_published ? "success" : "neutral"}>{article.is_published ? "Publicado" : "Rascunho"}</Badge>}
      />

      <p className="mb-4 text-xs text-slate-600">
        Última atualização em {formatDateBR(article.updated_at)}
        {article.updater_full_name
          ? ` por ${article.updater_full_name}`
          : article.creator_full_name
            ? ` por ${article.creator_full_name}`
            : ""}
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
                  {categories.map((c) => (
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
