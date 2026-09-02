import { describe, expect, it } from "vitest";
import { buildSyncPlan, normalizeDescriptor } from "@/lib/integrations/software-catalog-sync";

// Cabeçalho da planilha "Assinaturas - Softwares e licenças", replicado nos
// testes pra deixar claro o índice de cada coluna:
// [fornecedor, vencimento (serial), descrição, valor, categoria, centro de custo]
const HEADER = ["Nome do fornecedor", "Data de vencimento", "Descrição", "Valor original da parcela (R$)", "Categoria 1", "Centro de Custo 1"];

describe("normalizeDescriptor", () => {
  it("colapsa espaços, remove bordas e ignora maiúsculas/minúsculas", () => {
    expect(normalizeDescriptor("  BR1*ROCKETSEAT   ")).toBe("br1*rocketseat");
    expect(normalizeDescriptor("DM     *hostingercombr")).toBe("dm *hostingercombr");
  });
});

describe("buildSyncPlan", () => {
  it("ignora a linha de cabeçalho e linhas sem descrição ou custo", () => {
    const plan = buildSyncPlan([
      HEADER,
      ["Banco X", 46000, "", 100, "Softwares e Licenças", "TI"],
      ["Banco X", 46000, "Sistema sem custo", null, "Softwares e Licenças", "TI"],
      ["Banco X", 46000, "Figma", 239.36, "Softwares e Licenças", "TI"],
    ]);

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ sourceRef: "figma", rawDescription: "Figma", monthlyCost: 239.36 });
  });

  it("entre duas parcelas do mesmo sistema, mantém a de vencimento mais recente", () => {
    const plan = buildSyncPlan([
      HEADER,
      ["BANCO BRADESCO S.A.", 46255, "ANTHROPIC* CLAUDE TEAM", 2806.63, "Softwares e Licenças", "OPERAÇÕES - CUSTO"],
      ["BANCO BRADESCO S.A.", 46261, "ANTHROPIC* CLAUDE TEAM", 724.91, "Softwares e Licenças", "OPERAÇÕES - CUSTO"],
    ]);

    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ sourceRef: "anthropic* claude team", monthlyCost: 724.91 });
  });

  it("gera um source_ref estável independente de variação de espaços/maiúsculas entre execuções", () => {
    const plan = buildSyncPlan([HEADER, ["Cartão", 46000, "  Pipedrive  ", 546.72, "Softwares e Licenças", "COMERCIAL"]]);
    expect(plan[0]!.sourceRef).toBe("pipedrive");
  });

  it("aceita valor formatado como texto (defensivo, caso a célula não venha numérica)", () => {
    const plan = buildSyncPlan([HEADER, ["Cartão", 46000, "Sistema Y", "R$ 1.801,04", "Softwares e Licenças", "TI"]]);
    expect(plan[0]!.monthlyCost).toBeCloseTo(1801.04);
  });
});
