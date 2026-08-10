import { z } from "zod";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Escrita restrita a admin_ti (reforçado no RLS: mobile_lines_write_admin).

export const lineTypeSchema = z.enum(["sim_fisico", "esim"]);
export const mobileLineStatusSchema = z.enum(["ativa", "suspensa", "cancelada"]);

export const upsertMobileLineSchema = z
  .object({
    phone_number: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{10,15}$/, "Número de telefone inválido"),
    carrier: z.string().trim().min(1).max(80),
    plan_name: z.string().trim().min(1).max(120),
    monthly_cost: z.number().nonnegative().max(100000),
    line_type: lineTypeSchema,
    status: mobileLineStatusSchema,
    assigned_to: z.string().uuid().nullable(),
    department_id: z.string().uuid().nullable(),
  })
  .strict();

export type UpsertMobileLineInput = z.infer<typeof upsertMobileLineSchema>;

// Atualização pós-cadastro — phone_number fica imutável (identidade da
// linha); tudo o mais é operacional e muda com frequência (troca de
// operadora/plano, portabilidade, reatribuição).
export const updateMobileLineSchema = z
  .object({
    id: z.string().uuid(),
    carrier: z.string().trim().min(1).max(80),
    plan_name: z.string().trim().min(1).max(120),
    monthly_cost: z.number().nonnegative().max(100000),
    line_type: lineTypeSchema,
    status: mobileLineStatusSchema,
    assigned_to: z.string().uuid().nullable(),
    department_id: z.string().uuid().nullable(),
  })
  .strict();

export type UpdateMobileLineInput = z.infer<typeof updateMobileLineSchema>;
