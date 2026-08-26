import { z } from "zod";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Zero-Trust: mesmo vindo de um formulário do próprio portal, todo payload
// é revalidado no servidor antes de tocar o banco (ver app/login/actions.ts).
export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("E-mail inválido").max(255),
    password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(200),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;

// Usado no primeiro acesso (troca de senha descartável) e na redefinição de
// senha pelo admin_ti — mesma regra mínima do loginSchema, mas exigindo
// confirmação para evitar erro de digitação numa senha que o usuário ainda
// não decorou.
export const setPasswordSchema = z
  .object({
    password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(200),
    confirm_password: z.string().min(8, "Confirme a nova senha").max(200),
  })
  .strict()
  .refine((data) => data.password === data.confirm_password, {
    message: "As senhas não coincidem",
    path: ["confirm_password"],
  });

export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
