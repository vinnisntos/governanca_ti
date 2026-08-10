import { z } from "zod";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Escrita restrita a admin_ti/rh (reforçado no RLS: kb_articles_write).
// O conteúdo é tratado como texto/markdown puro — a renderização no client
// DEVE sanitizar/escapar antes de exibir como HTML (nunca dangerouslySetInnerHTML
// direto sobre este campo sem sanitização, para mitigar Stored XSS).

export const upsertKnowledgeBaseArticleSchema = z
  .object({
    category_id: z.string().uuid().nullable(),
    title: z.string().trim().min(3).max(200),
    content: z.string().trim().min(1).max(50000),
    is_published: z.boolean(),
  })
  .strict();

export type UpsertKnowledgeBaseArticleInput = z.infer<
  typeof upsertKnowledgeBaseArticleSchema
>;

export const upsertKnowledgeBaseCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).optional(),
  })
  .strict();

export type UpsertKnowledgeBaseCategoryInput = z.infer<
  typeof upsertKnowledgeBaseCategorySchema
>;
