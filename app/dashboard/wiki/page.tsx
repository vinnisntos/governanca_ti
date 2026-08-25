import Link from "next/link";
import { BookOpen, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createCategoryAction,
  createArticleAction,
  togglePublishArticleAction,
  updateCategoryAction,
  deleteCategoryAction,
} from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { FlashToast } from "@/components/ui/flash-toast";
import { Card, Section } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Modal } from "@/components/ui/modal";
import { StatusToggleButton } from "@/components/ui/status-toggle";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

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
    <>
      <FlashToast success={successMessage} error={errorMessage} />

      <PageHeader
        title="Base de Conhecimento"
        actions={
          canManage ? (
            <>
              <Modal
                title="Nova categoria"
                trigger={
                  <Button variant="outline">
                    <FolderPlus className="h-4 w-4" aria-hidden />
                    Nova categoria
                  </Button>
                }
              >
                <form action={createCategoryAction} className="space-y-4">
                  <Field label="Nome" htmlFor="cat-name" required>
                    <Input id="cat-name" name="name" required minLength={2} />
                  </Field>
                  <Field label="Descrição" htmlFor="cat-description" hint="Opcional">
                    <Input id="cat-description" name="description" />
                  </Field>
                  <div className="flex justify-end">
                    <SubmitButton variant="primary" pendingLabel="Criando...">
                      Criar categoria
                    </SubmitButton>
                  </div>
                </form>
              </Modal>

              <Modal
                title="Novo artigo"
                trigger={
                  <Button variant="primary">
                    <Plus className="h-4 w-4" aria-hidden />
                    Novo artigo
                  </Button>
                }
              >
                <form action={createArticleAction} className="space-y-4">
                  <Field label="Título" htmlFor="title" required>
                    <Input id="title" name="title" required minLength={3} />
                  </Field>
                  <Field label="Categoria" htmlFor="category_id" hint="Opcional">
                    <Select id="category_id" name="category_id" defaultValue="">
                      <option value="">Nenhuma</option>
                      {(categories ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Conteúdo" htmlFor="content" required>
                    <Textarea id="content" name="content" required rows={6} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <Checkbox name="is_published" defaultChecked />
                    Publicar imediatamente
                  </label>
                  <div className="flex justify-end">
                    <SubmitButton variant="primary" pendingLabel="Criando...">
                      Criar artigo
                    </SubmitButton>
                  </div>
                </form>
              </Modal>
            </>
          ) : undefined
        }
      />

      {canManage && categories && categories.length > 0 ? (
        <Section title="Categorias" className="mb-6">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <li key={category.id}>
                <Card className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{category.name}</p>
                    {category.description ? (
                      <p className="truncate text-xs text-slate-600">{category.description}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Modal
                      title="Editar categoria"
                      trigger={
                        <Button variant="ghost" size="icon" aria-label={`Editar ${category.name}`}>
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                      }
                    >
                      <form action={updateCategoryAction} className="space-y-4">
                        <input type="hidden" name="id" value={category.id} />
                        <Field label="Nome" htmlFor={`cat-name-${category.id}`} required>
                          <Input
                            id={`cat-name-${category.id}`}
                            name="name"
                            required
                            minLength={2}
                            defaultValue={category.name}
                          />
                        </Field>
                        <Field label="Descrição" htmlFor={`cat-description-${category.id}`} hint="Opcional">
                          <Input
                            id={`cat-description-${category.id}`}
                            name="description"
                            defaultValue={category.description ?? ""}
                          />
                        </Field>
                        <div className="flex justify-end">
                          <SubmitButton variant="primary" pendingLabel="Salvando...">
                            Salvar alterações
                          </SubmitButton>
                        </div>
                      </form>
                    </Modal>

                    <form action={deleteCategoryAction}>
                      <input type="hidden" name="id" value={category.id} />
                      <ConfirmSubmitButton
                        size="icon"
                        aria-label={`Excluir ${category.name}`}
                        title={`Excluir "${category.name}"?`}
                        description="Essa ação não pode ser desfeita. Se houver artigos usando esta categoria, a exclusão será bloqueada."
                        confirmLabel="Excluir"
                        cancelLabel="Cancelar"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {!articles || articles.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nenhum artigo disponível"
          description="Ainda não há artigos publicados na base de conhecimento."
        />
      ) : (
        <ul className="space-y-2">
          {articles.map((article) => (
            <li key={article.id}>
              <Card className="flex items-center justify-between gap-3 p-4">
                <div>
                  <Link
                    href={`/dashboard/wiki/${article.id}`}
                    className="font-medium text-slate-900 underline-offset-2 hover:underline"
                  >
                    {article.title}
                  </Link>
                  {article.knowledge_base_categories ? (
                    <p className="text-xs text-slate-600">{article.knowledge_base_categories.name}</p>
                  ) : null}
                </div>

                {canManage ? (
                  <form action={togglePublishArticleAction}>
                    <input type="hidden" name="article_id" value={article.id} />
                    <input
                      type="hidden"
                      name="next_published"
                      value={(!article.is_published).toString()}
                    />
                    <StatusToggleButton
                      active={article.is_published}
                      activeLabel="Publicado"
                      inactiveLabel="Rascunho"
                      actionLabel={
                        article.is_published
                          ? `Marcar "${article.title}" como rascunho`
                          : `Publicar "${article.title}"`
                      }
                    />
                  </form>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
