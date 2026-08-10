"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import {
  upsertKnowledgeBaseArticleSchema,
  upsertKnowledgeBaseCategorySchema,
} from "@/lib/validations/knowledge-base";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Autorização real é a policy kb_articles_write / kb_categories_write
// (RLS: admin_ti OU rh). As páginas só exibem estes formulários para quem
// já tem um desses papéis, como atalho de UX.

const LIST_PATH = "/dashboard/wiki";

function emptyToNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

export async function createCategoryAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = upsertKnowledgeBaseCategorySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(LIST_PATH, "Informe o nome da categoria (mín. 2 caracteres).");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("knowledge_base_categories").insert(parsed.data);

  if (error) {
    console.error("[wiki] create category failed", { message: error.message });
    redirectWithError(LIST_PATH, "Não foi possível criar a categoria (nome já existe?).");
  }

  redirectWithSuccess(LIST_PATH, "Categoria criada.");
}

export async function createArticleAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = upsertKnowledgeBaseArticleSchema.safeParse({
    category_id: emptyToNull(formData.get("category_id")),
    title: formData.get("title"),
    content: formData.get("content"),
    is_published: formData.get("is_published") === "on",
  });

  if (!parsed.success) {
    redirectWithError(LIST_PATH, "Preencha título e conteúdo do artigo.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("knowledge_base_articles").insert({
    ...parsed.data,
    created_by: user.id,
  });

  if (error) {
    console.error("[wiki] create article failed", { message: error.message });
    redirectWithError(LIST_PATH, "Não foi possível criar o artigo.");
  }

  redirectWithSuccess(LIST_PATH, "Artigo criado.");
}

export async function updateArticleAction(formData: FormData) {
  await assertTrustedOrigin();

  const articleId = formData.get("article_id");
  if (typeof articleId !== "string" || articleId.length === 0) {
    redirectWithError(LIST_PATH, "Artigo inválido.");
  }

  const parsed = upsertKnowledgeBaseArticleSchema.safeParse({
    category_id: emptyToNull(formData.get("category_id")),
    title: formData.get("title"),
    content: formData.get("content"),
    is_published: formData.get("is_published") === "on",
  });

  const articlePath = `${LIST_PATH}/${articleId}`;

  if (!parsed.success) {
    redirectWithError(articlePath, "Preencha título e conteúdo do artigo.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("knowledge_base_articles")
    .update({ ...parsed.data, updated_by: user.id })
    .eq("id", articleId as string);

  if (error) {
    console.error("[wiki] update article failed", { message: error.message });
    redirectWithError(articlePath, "Não foi possível salvar as alterações.");
  }

  redirectWithSuccess(articlePath, "Artigo atualizado.");
}

export async function togglePublishArticleAction(formData: FormData) {
  await assertTrustedOrigin();

  const articleId = formData.get("article_id");
  const nextPublished = formData.get("next_published") === "true";

  if (typeof articleId !== "string" || articleId.length === 0) {
    redirectWithError(LIST_PATH, "Artigo inválido.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("knowledge_base_articles")
    .update({ is_published: nextPublished, updated_by: user.id })
    .eq("id", articleId as string);

  if (error) {
    console.error("[wiki] toggle publish failed", { message: error.message });
    redirectWithError(LIST_PATH, "Não foi possível atualizar a publicação.");
  }

  redirectWithSuccess(LIST_PATH, nextPublished ? "Artigo publicado." : "Artigo despublicado.");
}
