"use server";

import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/auth/require-role";
import { withRequestContext } from "@/lib/db/context";
import { getClientIp } from "@/lib/utils/client-ip";
import {
  upsertKnowledgeBaseArticleSchema,
  upsertKnowledgeBaseCategorySchema,
} from "@/lib/validations/knowledge-base";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";
import type { UserRole } from "@/lib/auth/session";

// Sem RLS no banco: requireRole(["admin_ti","rh"]) é a autoridade real de
// escrita nestas duas tabelas agora.

const LIST_PATH = "/dashboard/wiki";
const WRITE_ROLES: UserRole[] = ["admin_ti", "rh"];

function emptyToNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

export async function createCategoryAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, session } = await requireRole(WRITE_ROLES);
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

  const clientIp = await getClientIp();

  try {
    await withRequestContext({ userId: session!.id, clientIp }, (client) =>
      client.query("insert into knowledge_base_categories (name, description) values ($1, $2)", [
        parsed.data.name,
        parsed.data.description ?? null,
      ])
    );
  } catch (error) {
    console.error("[wiki] create category failed", { message: (error as Error).message });
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

  const { authorized, session } = await requireRole(WRITE_ROLES);
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

  const clientIp = await getClientIp();
  const { rowCount } = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
    client.query("update knowledge_base_categories set name = $2, description = $3 where id = $1 returning id", [
      id,
      parsed.data.name,
      parsed.data.description ?? null,
    ])
  ).catch((error: unknown) => {
    console.error("[wiki] update category failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(LIST_PATH, "Categoria não encontrada ou não foi possível salvar as alterações.");
  }

  redirectWithSuccess(LIST_PATH, "Categoria atualizada.");
}

export async function deleteCategoryAction(formData: FormData) {
  await assertTrustedOrigin();

  const id = formData.get("id");
  if (!z.string().uuid().safeParse(id).success) {
    redirectWithError(LIST_PATH, "Categoria inválida.");
  }

  const { authorized, session } = await requireRole(WRITE_ROLES);
  if (!authorized) {
    redirectWithError(LIST_PATH, "Você não tem permissão para esta ação.");
  }

  const clientIp = await getClientIp();

  let rowCount = 0;
  try {
    const result = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
      client.query("delete from knowledge_base_categories where id = $1 returning id", [id])
    );
    rowCount = result.rowCount ?? 0;
  } catch (error) {
    const pgError = error as { code?: string; message?: string };
    // 23503 = violação de FK: existem artigos apontando para esta categoria.
    const message =
      pgError.code === "23503"
        ? "Esta categoria tem artigos vinculados e não pode ser excluída."
        : "Não foi possível excluir a categoria.";
    console.error("[wiki] delete category failed", { message: pgError.message, code: pgError.code });
    redirectWithError(LIST_PATH, message);
  }

  if (!rowCount) {
    redirectWithError(LIST_PATH, "Categoria não encontrada.");
  }

  redirectWithSuccess(LIST_PATH, "Categoria excluída.");
}

export async function createArticleAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, session } = await requireRole(WRITE_ROLES);
  if (!authorized) {
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

  const clientIp = await getClientIp();

  try {
    await withRequestContext({ userId: session!.id, clientIp }, (client) =>
      client.query(
        `insert into knowledge_base_articles (category_id, title, content, is_published, created_by)
         values ($1, $2, $3, $4, $5)`,
        [parsed.data.category_id, parsed.data.title, parsed.data.content, parsed.data.is_published, session!.id]
      )
    );
  } catch (error) {
    console.error("[wiki] create article failed", { message: (error as Error).message });
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

  const { authorized, session } = await requireRole(WRITE_ROLES);
  if (!authorized) {
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

  const clientIp = await getClientIp();
  const { rowCount } = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
    client.query(
      `update knowledge_base_articles
       set category_id = $2, title = $3, content = $4, is_published = $5, updated_by = $6
       where id = $1
       returning id`,
      [articleId, parsed.data.category_id, parsed.data.title, parsed.data.content, parsed.data.is_published, session!.id]
    )
  ).catch((error: unknown) => {
    console.error("[wiki] update article failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(articlePath, "Artigo não encontrado ou não foi possível salvar as alterações.");
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

  const { authorized, session } = await requireRole(WRITE_ROLES);
  if (!authorized) {
    redirectWithError(LIST_PATH, "Você não tem permissão para esta ação.");
  }

  const clientIp = await getClientIp();
  const { rowCount } = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
    client.query(
      "update knowledge_base_articles set is_published = $2, updated_by = $3 where id = $1 returning id",
      [articleId, nextPublished, session!.id]
    )
  ).catch((error: unknown) => {
    console.error("[wiki] toggle publish failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(LIST_PATH, "Artigo não encontrado ou não foi possível salvar as alterações.");
  }

  redirectWithSuccess(LIST_PATH, nextPublished ? "Artigo publicado." : "Artigo despublicado.");
}
