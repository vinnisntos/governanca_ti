import { z } from "zod";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Escrita restrita a admin_ti (reforçado no RLS: profiles_update + trigger
// fn_protect_profile_fields, que bloqueia qualquer não-admin de alterar
// role/department_id/manager_id/is_active mesmo no próprio registro).

export const userRoleSchema = z.enum(["colaborador", "gestor", "rh", "admin_ti"]);

export const updateUserSchema = z
  .object({
    role: userRoleSchema,
    department_id: z.string().uuid().nullable().optional(),
    manager_id: z.string().uuid().nullable().optional(),
    is_active: z.boolean(),
  })
  .strict();

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
