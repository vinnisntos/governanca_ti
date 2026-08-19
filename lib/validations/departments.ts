import { z } from "zod";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Escrita restrita a admin_ti (reforçado no RLS: departments_write_admin).

export const upsertDepartmentSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome do departamento").max(120),
  })
  .strict();

export type UpsertDepartmentInput = z.infer<typeof upsertDepartmentSchema>;
