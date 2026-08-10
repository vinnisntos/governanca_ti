import { z } from "zod";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Zero-Trust: mesmo vindo de um formulário do próprio portal, todo payload
// é revalidado no servidor antes de tocar o Supabase Auth.
export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("E-mail inválido").max(255),
    password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(200),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
