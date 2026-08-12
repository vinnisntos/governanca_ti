import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentReferenceMonth } from "@/lib/utils/reference-month";

describe("currentReferenceMonth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retorna sempre o dia 01 do mês corrente em UTC", () => {
    vi.setSystemTime(new Date("2026-08-31T23:59:59.000Z"));
    expect(currentReferenceMonth()).toBe("2026-08-01");
  });

  it("preenche mês com zero à esquerda", () => {
    vi.setSystemTime(new Date("2026-01-05T00:00:00.000Z"));
    expect(currentReferenceMonth()).toBe("2026-01-01");
  });

  it("usa UTC, não o horário local, para evitar checkins duplicados perto da virada do mês", () => {
    // 2026-03-01T00:30 UTC-3 (horário de Brasília) é 2026-03-01T03:30 UTC —
    // ainda março em ambos os fusos, cenário de controle.
    vi.setSystemTime(new Date("2026-03-01T03:30:00.000Z"));
    expect(currentReferenceMonth()).toBe("2026-03-01");
  });
});
