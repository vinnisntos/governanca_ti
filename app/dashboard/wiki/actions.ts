"use server";

import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/utils/require-role";
import {
  upsertKnowledgeBaseArticleSchema,
  upsertKnowledgeBaseCategorySchema,
} from "@/lib/validations/knowledge-base";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Autorização real é a policy kb_articles_write / kb_categories_write
// (RLS: admin_ti OU rh); requireRole() é defesa em profundidade para dar uma
// mensagem clara em vez de depender só do efeito colateral silencioso do RLS.

const LIST_PATH = "/dashboard/wiki";
const WRITE_ROLES = ["admin_ti", "rh"] as const;

function emptyToNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

export async function createCategoryAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, supabase } = await requireRole([...WRITE_ROLES]);
  if (!authorized) {
    redirectWithError(LIST_PATH, "Você não tem permissão para esta ação.");
  }

  const parsed = upsertKnowledgeBaseCategorySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(LIST_PATH, "Informe o nome da categoria (mín. 2 caracteres).");
  }

  const { error } = await supabase.from("knowledge_base_categories").insert(parsed.data);

  if (error) {
    console.error("[wiki] create category failed", { message: error.message });
    redirectWithError(LIST_PATH, "Não foi possível criar a categoria (nome já existe?).");
  }

  redirectWithSuccess(LIST_PATH, "Categoria criada.");
}

export async function updateCategoryAction(formData: FormData) {
  await assertTrustedOrigin();

  const id = formData.get("id");
  if (!z.string().uuid().safeParse(id).success) {
    redirectWithError(LIST_PATH, "Categoria inválida.");
  }

  const { authorized, supabase } = await requireRole([...WRITE_ROLES]);
  if (!authorized) {
    redirectWithError(LIST_PATH, "Você não tem permissão para esta ação.");
  }

  const parsed = upsertKnowledgeBaseCategorySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(LIST_PATH, "Informe o nome da categoria (mín. 2 caracteres).");
  }

  const { data: updated, error } = await supabase
    .from("knowledge_base_categories")
    .update(parsed.data)
    .eq("id", id as string)
    .select("id");

  if (error) {
    console.error("[wiki] update category failed", { message: error.message });
    redirectWithError(LIST_PATH, "Não foi possível salvar as alterações (nome já existe?).");
  }

  if (!updated || updated.length === 0) {
    redirectWithError(LIST_PATH, "Categoria não encontrada ou você não tem permissão para alterá-la.");
  }

  redirectWithSuccess(LIST_PATH, "Categoria atualizada.");
}

export async function deleteCategoryAction(formData: FormData) {
  await assertTrustedOrigin();

  const id = formData.get("id");
  if (!z.string().uuid().safeParse(id).success) {
    redirectWithError(LIST_PATH, "Categoria inválida.");
  }

  const { authorized, supabase } = await requireRole([...WRITE_ROLES]);
  if (!authorized) {
    redirectWithError(LIST_PATH, "Você não tem permissão para esta ação.");
  }

  const { data: deleted, error } = await supabase
    .from("knowledge_base_categories")
    .delete()
    .eq("id", id as string)
    .select("id");

  if (error) {
    // 23503 = violação de FK: existem artigos apontando para esta categoria.
    const message =
      error.code === "23503"
        ? "Esta categoria tem artigos vinculados e não pode ser excluída."
        : "Não foi possível excluir a categoria.";
    console.error("[wiki] delete category failed", { message: error.message, code: error.code });
    redirectWithError(LIST_PATH, message);
  }

  if (!deleted || deleted.length === 0) {
    redirectWithError(LIST_PATH, "Categoria não encontrada ou você não tem permissão para excluí-la.");
  }

  redirectWithSuccess(LIST_PATH, "Categoria excluída.");
}

export async function createArticleAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, supabase, user } = await requireRole([...WRITE_ROLES]);
  if (!authorized || !user) {
    redirectWithError(LIST_PATH, "Você não tem permissão para esta ação.");
  }

  const parsed = upsertKnowledgeBaseArticleSchema.safeParse({
    category_id: emptyToNull(formData.get("category_id")),
    title: formData.get("title"),
    content: formData.get("content"),
    is_published: formData.get("is_published") === "on",
  });

  if (!parsed.success) {
    redirectWithError(LIST_PATH, "Preencha título e conteúdo do artigo.");
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
  if (!z.string().uuid().safeParse(articleId).success) {
    redirectWithError(LIST_PATH, "Artigo inválido.");
  }

  const articlePath = `${LIST_PATH}/${articleId}`;

  const { authorized, supabase, user } = await requireRole([...WRITE_ROLES]);
  if (!authorized || !user) {
    redirectWithError(articlePath, "Você não tem permissão para esta ação.");
  }

  const parsed = upsertKnowledgeBaseArticleSchema.safeParse({
    category_id: emptyToNull(formData.get("category_id")),
    title: formData.get("title"),
    content: formData.get("content"),
    is_published: formData.get("is_published") === "on",
  });

  if (!parsed.success) {
    redirectWithError(articlePath, "Preencha título e conteúdo do artigo.");
  }

  const { data: updated, error } = await supabase
    .from("knowledge_base_articles")
    .update({ ...parsed.data, updated_by: user.id })
    .eq("id", articleId as string)
    .select("id");

  if (error) {
    console.error("[wiki] update article failed", { message: error.message });
    redirectWithError(articlePath, "Não foi possível salvar as alterações.");
  }

  if (!updated || updated.length === 0) {
    redirectWithError(articlePath, "Artigo não encontrado ou você não tem permissão para alterá-lo.");
  }

  redirectWithSuccess(articlePath, "Artigo atualizado.");
}

export async function togglePublishArticleAction(formData: FormData) {
  await assertTrustedOrigin();

  const articleId = formData.get("article_id");
  const nextPublished = formData.get("next_published") === "true";

  if (!z.string().uuid().safeParse(articleId).success) {
    redirectWithError(LIST_PATH, "Artigo inválido.");
  }

  const { authorized, supabase, user } = await requireRole([...WRITE_ROLES]);
  if (!authorized || !user) {
    redirectWithError(LIST_PATH, "Você não tem permissão para esta ação.");
  }

  const { data: updated, error } = await supabase
    .from("knowledge_base_articles")
    .update({ is_published: nextPublished, updated_by: user.id })
    .eq("id", articleId as string)
    .select("id");

  if (error) {
    console.error("[wiki] toggle publish failed", { message: error.message });
    redirectWithError(LIST_PATH, "Não foi possível atualizar a publicação.");
  }

  if (!updated || updated.length === 0) {
    redirectWithError(LIST_PATH, "Artigo não encontrado ou você não tem permissão para alterá-lo.");
  }

  redirectWithSuccess(LIST_PATH, nextPublished ? "Artigo publicado." : "Artigo despublicado.");
}
