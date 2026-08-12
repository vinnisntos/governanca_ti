import { describe, expect, it } from "vitest";
import { upsertKnowledgeBaseArticleSchema } from "@/lib/validations/knowledge-base";

describe("upsertKnowledgeBaseArticleSchema", () => {
  it("aceita conteúdo contendo marcação HTML como texto puro", () => {
    // O schema não deve tentar interpretar/sanitizar HTML: a defesa contra
    // Stored XSS é o React nunca renderizar isto via dangerouslySetInnerHTML
    // (ver app/dashboard/wiki/[articleId]/page.tsx). Este teste documenta a
    // premissa: o valor passa intacto pela validação, como string comum.
    const payload = {
      category_id: null,
      title: "Política de Senhas",
      content: "<script>alert(1)</script> Use senhas fortes.",
      is_published: true,
    };
    const result = upsertKnowledgeBaseArticleSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe(payload.content);
    }
  });

  it("rejeita título abaixo do mínimo", () => {
    const result = upsertKnowledgeBaseArticleSchema.safeParse({
      category_id: null,
      title: "Ab",
      content: "conteúdo",
      is_published: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita conteúdo acima de 50000 caracteres", () => {
    const result = upsertKnowledgeBaseArticleSchema.safeParse({
      category_id: null,
      title: "Artigo grande",
      content: "a".repeat(50001),
      is_published: false,
    });
    expect(result.success).toBe(false);
  });
});
