import { z } from "zod";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Escrita restrita a admin_ti (reforçado no RLS: access_catalog_write_admin).

export const upsertAccessCatalogSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome do sistema").max(120),
    description: z.string().trim().max(500).optional(),
    owner_department_id: z.string().uuid().nullable().optional(),
    // Custo mensal da licença/assinatura, quando aplicável — alimenta o
    // Dashboard Executivo (Módulo 5).
    monthly_cost: z.number().nonnegative().max(1000000).nullable().optional(),
  })
  .strict();

export type UpsertAccessCatalogInput = z.infer<typeof upsertAccessCatalogSchema>;
